package db

import (
	"context"
	"testing"
)

// In-app notifications (#267). Alice owns the Test household and Checking
// (balance $1,234.56); Carl is her child; Bob is in another household. All
// data is fake.

// kinds returns user's alerts as kind → count, unresolved only.
func (f *fixture) kinds(t *testing.T, user string) map[string]int {
	t.Helper()
	list, err := f.db.Notifications(context.Background(), user)
	if err != nil {
		t.Fatalf("Notifications as %s: %v", user, err)
	}
	m := map[string]int{}
	for _, n := range list {
		if !n.Resolved {
			m[n.Kind]++
		}
	}
	return m
}

func TestNotifyBigPurchase(t *testing.T) {
	f := setup(t)
	acct := f.account(t, alice)
	add := func(id string, amount int, date string, pending bool) {
		mustExec(t, f.admin, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name, merchant_name, pending)
			values ($1, $2, $3, $4, 'USD', $5::date, 'FAKE STORE 123', 'Fake Store', $6)`, f.testHH, acct, id, amount, date, pending)
	}
	add("t-big", 64218, "today", false)
	add("t-small", 50000, "today", false)                                                                            // exactly $500 isn't over it
	add("t-old", 90000, "2025-01-02", false)                                                                         // history from a new link
	add("t-pending", 70000, "today", true)                                                                           // waits until it settles
	add("t-refund", -80000, "today", false)                                                                          // money in
	mustExec(t, f.admin, `update transactions set amount_minor = amount_minor where plaid_transaction_id = 't-big'`) // a re-sync
	if got := f.kinds(t, alice)["big_purchase"]; got != 1 {
		t.Fatalf("alice has %d big purchase alerts, want 1", got)
	}
	for _, u := range []string{carl, bob} {
		if got := f.kinds(t, u)["big_purchase"]; got != 0 {
			t.Errorf("%s sees %d of alice's big purchase alerts", u, got)
		}
	}
	list, _ := f.db.Notifications(context.Background(), alice)
	for _, n := range list {
		if n.Kind == "big_purchase" && string(n.Data) == "" {
			t.Errorf("big purchase alert has no data")
		}
	}
}

func TestNotifyLowBalanceAndReconnect(t *testing.T) {
	f := setup(t)
	acct := f.account(t, alice)
	bal := func(minor int) {
		mustExec(t, f.admin, `update accounts set current_balance_minor = $2 where id = $1`, acct, minor)
	}
	bal(8430)
	bal(5000) // still low: no second alert
	if got := f.kinds(t, alice)["low_balance"]; got != 1 {
		t.Fatalf("low balance alerts = %d, want 1", got)
	}
	bal(20000) // back up clears it
	bal(9000)  // and a new dip alerts again
	if got := f.kinds(t, alice)["low_balance"]; got != 1 {
		t.Errorf("after recovering and dipping again, open low balance alerts = %d, want 1", got)
	}

	mustExec(t, f.admin, `update plaid_items set status = 'needs_reauth' where id = $1`, f.aliceItem)
	list, _ := f.db.Notifications(context.Background(), alice)
	if len(list) == 0 || list[0].Kind != "reconnect" || !list[0].NeedsAction {
		t.Fatalf("newest alert = %+v, want a reconnect that needs action", list[0])
	}
	mustExec(t, f.admin, `update plaid_items set status = 'active' where id = $1`, f.aliceItem)
	if got := f.kinds(t, alice)["reconnect"]; got != 0 {
		t.Errorf("reconnect still open after the bank is active again")
	}
}

func TestNotifyJoinedAndMarkRead(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	if got := f.kinds(t, alice)["joined"]; got != 2 { // Carl in setup, then Dana
		t.Fatalf("alice has %d joined alerts, want 2", got)
	}
	if got := f.kinds(t, danaG)["joined"]; got != 0 {
		t.Errorf("dana was told she joined")
	}
	if got := f.kinds(t, bob)["joined"]; got != 0 {
		t.Errorf("bob was told about another household")
	}

	list, _ := f.db.Notifications(ctx, alice)
	if err := f.db.MarkNotificationsRead(ctx, alice, list[0].ID); err != nil {
		t.Fatal(err)
	}
	// Bob can't mark Alice's alerts: RLS hides them, so nothing changes.
	if err := f.db.MarkNotificationsRead(ctx, bob, ""); err != nil {
		t.Fatal(err)
	}
	list, _ = f.db.Notifications(ctx, alice)
	if !list[0].Read || list[1].Read {
		t.Errorf("after marking one read: %v, %v", list[0].Read, list[1].Read)
	}
	if err := f.db.MarkNotificationsRead(ctx, alice, ""); err != nil {
		t.Fatal(err)
	}
	list, _ = f.db.Notifications(ctx, alice)
	for _, n := range list {
		if !n.Read {
			t.Errorf("%s still unread after mark all", n.Kind)
		}
	}
	if err := f.db.MarkNotificationsRead(ctx, alice, "not-a-uuid"); err != ErrInvalid {
		t.Errorf("bad ID: err = %v, want ErrInvalid", err)
	}
	// Nobody writes alerts directly, or changes anything but read_at.
	if _, err := f.execAs(alice, `insert into notifications (household_id, user_id, kind, ref_id) values ($1, $2, 'joined', $2)`, f.testHH, alice); err == nil {
		t.Errorf("alice inserted an alert")
	}
	if _, err := f.execAs(alice, `update notifications set resolved_at = now()`); err == nil {
		t.Errorf("alice changed resolved_at")
	}
}

// Closing alerts (#267): gone from the list, read, and only your own. A bank
// still to reconnect stays (marked closed) so Home's strip keeps it.
func TestDismissNotifications(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	mustExec(t, f.admin, `update plaid_items set status = 'needs_reauth' where id = $1`, f.aliceItem)
	list, _ := f.db.Notifications(ctx, alice) // reconnect, Dana joined, Carl joined
	ids := []string{}
	for _, n := range list {
		ids = append(ids, n.ID)
	}
	if err := f.db.DismissNotifications(ctx, bob, ids); err != nil {
		t.Fatal(err)
	}
	if after, _ := f.db.Notifications(ctx, alice); len(after) != len(list) {
		t.Fatalf("Bob closed Alice's alerts")
	}
	if err := f.db.DismissNotifications(ctx, alice, ids); err != nil {
		t.Fatal(err)
	}
	after, _ := f.db.Notifications(ctx, alice)
	if len(after) != 1 || after[0].Kind != "reconnect" || !after[0].Dismissed || !after[0].Read {
		t.Fatalf("after closing all: %+v", after)
	}
	mustExec(t, f.admin, `update plaid_items set status = 'active' where id = $1`, f.aliceItem)
	if after, _ := f.db.Notifications(ctx, alice); len(after) != 0 {
		t.Errorf("a fixed, closed reconnect still listed")
	}
	if err := f.db.DismissNotifications(ctx, alice, []string{"x"}); err != ErrInvalid {
		t.Errorf("bad id: err = %v", err)
	}
	if _, err := f.execAs(alice, `update notifications set kind = 'joined'`); err == nil {
		t.Errorf("alice changed an alert's kind")
	}
}
