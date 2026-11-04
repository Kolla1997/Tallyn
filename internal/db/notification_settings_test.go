package db

import (
	"context"
	"strings"
	"testing"
)

// Settings → Notifications (#268): who hears what. Alice owns the Test
// household, Carl is her child, Dana (added here) an adult, Bob is in
// another household. All data is fake.

func (f *fixture) buy(t *testing.T, user, id string, amount int) {
	t.Helper()
	mustExec(t, f.admin, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name)
		values ($1, $2, $3, $4, 'USD', current_date, 'FAKE STORE')`, f.testHH, f.account(t, user), id, amount)
}

// alerts returns user's unresolved alerts of kind, with their data's person.
func (f *fixture) alerts(t *testing.T, user, kind string) []Notification {
	t.Helper()
	list, err := f.db.Notifications(context.Background(), user)
	if err != nil {
		t.Fatalf("Notifications as %s: %v", user, err)
	}
	var out []Notification
	for _, n := range list {
		if n.Kind == kind && !n.Resolved {
			out = append(out, n)
		}
	}
	return out
}

func TestAlertsReachParentsOneWay(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	f.buy(t, carl, "t-carl", 60000)
	for _, u := range []string{carl, alice, danaG} {
		if got := len(f.alerts(t, u, "big_purchase")); got != 1 {
			t.Errorf("%s: %d alerts about Carl's purchase, want 1", u, got)
		}
	}
	if a := f.alerts(t, alice, "big_purchase"); len(a) == 1 && string(a[0].Data) != "" {
		if !strings.Contains(string(a[0].Data), `"person"`) {
			t.Errorf("parent's alert doesn't say whose purchase: %s", a[0].Data)
		}
	}
	if a := f.alerts(t, carl, "big_purchase"); len(a) == 1 && strings.Contains(string(a[0].Data), `"person"`) {
		t.Errorf("Carl's own alert names a person: %s", a[0].Data)
	}
	// Never the other way: Carl hears nothing about Alice's purchase.
	f.buy(t, alice, "t-alice", 90000)
	if got := len(f.alerts(t, carl, "big_purchase")); got != 1 {
		t.Errorf("Carl has %d big purchase alerts, want only his own", got)
	}
	// Parents don't get a child's low balance.
	mustExec(t, f.admin, `update accounts set current_balance_minor = 500 where owner_user_id = $1`, carl)
	if got := len(f.alerts(t, alice, "low_balance")); got != 0 {
		t.Errorf("Alice got Carl's low balance")
	}
	if got := len(f.alerts(t, carl, "low_balance")); got != 1 {
		t.Errorf("Carl has %d low balance alerts, want 1", got)
	}
	// A child's bank to reconnect: Carl must act; Alice is told, not asked.
	mustExec(t, f.admin, `update plaid_items set status = 'needs_reauth' where owner_user_id = $1`, carl)
	if a := f.alerts(t, carl, "reconnect"); len(a) != 1 || !a[0].NeedsAction {
		t.Errorf("Carl's reconnect = %+v", a)
	}
	if a := f.alerts(t, alice, "reconnect"); len(a) != 1 || a[0].NeedsAction {
		t.Errorf("Alice's copy of Carl's reconnect = %+v, want one that doesn't need action", a)
	}
	if got := len(f.alerts(t, bob, "big_purchase")); got != 0 {
		t.Errorf("Bob heard about another household")
	}
}

func TestAlertsSharedWithPartner(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	s, err := f.db.NotificationSettingsFor(ctx, alice, f.testHH)
	if err != nil || !s.BigPurchase || s.BigPurchaseMinor != 50000 || s.ShareWith != nil {
		t.Fatalf("defaults = %+v, %v", s, err)
	}
	dana := danaG
	s.ShareWith = &dana
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	// Shared, but Dana can't see Alice's transactions yet: nothing reaches her.
	f.buy(t, alice, "t-1", 60000)
	if got := len(f.alerts(t, danaG, "big_purchase")); got != 0 {
		t.Fatalf("Dana got a purchase she can't see")
	}
	mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'transactions')`, f.testHH, alice, danaG)
	f.buy(t, alice, "t-2", 60000)
	if a := f.alerts(t, danaG, "big_purchase"); len(a) != 1 || !strings.Contains(string(a[0].Data), `"person"`) {
		t.Fatalf("Dana's alerts = %+v, want Alice's purchase", a)
	}
	// Low balance needs balances shared too.
	acct := f.account(t, alice)
	mustExec(t, f.admin, `update accounts set current_balance_minor = 500 where id = $1`, acct)
	if got := len(f.alerts(t, danaG, "low_balance")); got != 0 {
		t.Errorf("Dana got a balance she can't see")
	}
	mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'balances')`, f.testHH, alice, danaG)
	mustExec(t, f.admin, `update accounts set current_balance_minor = 50000 where id = $1`, acct)
	mustExec(t, f.admin, `update accounts set current_balance_minor = 500 where id = $1`, acct)
	if got := len(f.alerts(t, danaG, "low_balance")); got != 1 {
		t.Errorf("Dana has %d low balance alerts, want 1", got)
	}
	// A partner is never asked to reconnect Alice's bank.
	mustExec(t, f.admin, `update plaid_items set status = 'needs_reauth' where id = $1`, f.aliceItem)
	if got := len(f.alerts(t, danaG, "reconnect")); got != 0 {
		t.Errorf("Dana was told to reconnect Alice's bank")
	}
}

func TestAlertSettingsRules(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	// Each person's own amount: Alice raised hers, so $600 isn't big to her.
	s, _ := f.db.NotificationSettingsFor(ctx, alice, f.testHH)
	s.BigPurchaseMinor = 100000
	s.Joined = false
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	f.buy(t, alice, "t-600", 60000)
	if got := len(f.alerts(t, alice, "big_purchase")); got != 0 {
		t.Errorf("Alice alerted under her own amount")
	}
	if got, _ := f.db.NotificationSettingsFor(ctx, alice, f.testHH); got.BigPurchaseMinor != 100000 || got.Joined {
		t.Errorf("saved settings = %+v", got)
	}
	// A child can't be a partner; nobody saves settings for another household.
	c := carl
	s.ShareWith = &c
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != ErrForbidden {
		t.Errorf("sharing with a child: err = %v, want ErrForbidden", err)
	}
	s.ShareWith = nil
	if err := f.db.SaveNotificationSettings(ctx, bob, f.testHH, s); err != ErrForbidden {
		t.Errorf("Bob saving in Test household: err = %v, want ErrForbidden", err)
	}
	if _, err := f.db.NotificationSettingsFor(ctx, bob, f.testHH); err != ErrForbidden {
		t.Errorf("Bob reading Test household settings: err = %v, want ErrForbidden", err)
	}
	s.BigPurchaseMinor = 0
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != ErrInvalid {
		t.Errorf("zero amount: err = %v, want ErrInvalid", err)
	}
	// Nobody reads someone else's settings.
	if n := f.count(t, danaG, `select count(*) from notification_settings`); n != 0 {
		t.Errorf("Dana sees %d settings rows", n)
	}
}
