package db

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

// Notification emails (#269). Alice owns the Test household, Carl is her
// child, Bob is in another household. All data is fake.

func (f *fixture) card(t *testing.T, user string, due string, minor int, overdue bool) string {
	t.Helper()
	acct := f.account(t, user)
	mustExec(t, f.admin, `insert into credit_cards (account_id, household_id, minimum_payment_minor, next_payment_due_date, last_statement_balance_minor, is_overdue)
		values ($1, $2, $3, $4::date, 41000, $5)
		on conflict (account_id) do update set minimum_payment_minor = excluded.minimum_payment_minor,
		  next_payment_due_date = excluded.next_payment_due_date, is_overdue = excluded.is_overdue`, acct, f.testHH, minor, due, overdue)
	return acct
}

// outbox returns the outbox as "kind user owner" → send.
func (f *fixture) outbox(t *testing.T) map[string]bool {
	t.Helper()
	list, err := f.sys.EmailOutbox(context.Background(), 100)
	if err != nil {
		t.Fatalf("EmailOutbox: %v", err)
	}
	m := map[string]bool{}
	for _, e := range list {
		m[e.Kind+" "+e.UserID+" "+e.OwnerID] = e.Send
	}
	return m
}

func TestNotifyPaymentsDue(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	today := time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)
	run := func() {
		t.Helper()
		if _, err := f.sys.NotifyPaymentsDue(ctx, today); err != nil {
			t.Fatalf("NotifyPaymentsDue: %v", err)
		}
	}
	f.card(t, alice, "2026-11-20", 2000, false) // not yet
	run()
	if got := len(f.alerts(t, alice, "payment_due")); got != 0 {
		t.Fatalf("alerted %d times for a payment due in 16 days", got)
	}
	f.card(t, alice, "2026-11-07", 2000, false) // in three days
	run()
	run() // daily again: no second alert
	a := f.alerts(t, alice, "payment_due")
	if len(a) != 1 {
		t.Fatalf("payment due alerts = %d, want 1", len(a))
	}
	f.card(t, alice, "2026-11-07", 2000, true) // now overdue
	run()
	a = f.alerts(t, alice, "payment_due")
	var d struct{ Overdue bool }
	if len(a) != 1 || json.Unmarshal(a[0].Data, &d) != nil || !d.Overdue {
		t.Fatalf("after going overdue: %+v", a)
	}
	f.card(t, alice, "2026-12-07", 2000, false) // paid, next month's due date
	run()
	if got := len(f.alerts(t, alice, "payment_due")); got != 0 {
		t.Errorf("still %d open after paying", got)
	}
	for _, u := range []string{carl, bob} {
		if got := len(f.alerts(t, u, "payment_due")); got != 0 {
			t.Errorf("%s got alice's payment due", u)
		}
	}
	if _, err := f.execAs(alice, `select public.notify_payments_due(current_date)`); err == nil {
		t.Error("the app's login could run notify_payments_due")
	}
}

func TestEmailOutbox(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	mustExec(t, f.admin, `update plaid_items set status = 'needs_reauth' where id = $1`, f.aliceItem)
	mustExec(t, f.admin, `update plaid_items set status = 'needs_reauth' where id = $1`, f.carlItem)
	f.card(t, alice, "2026-11-06", 2000, false)
	if _, err := f.sys.NotifyPaymentsDue(ctx, time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	// Every email is off by default.
	for k, send := range f.outbox(t) {
		if send {
			t.Errorf("%s would be emailed with default settings", k)
		}
	}

	if err := f.db.SetEmail(ctx, alice, f.testHH, EmailReconnect, "", true); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetEmail(ctx, alice, f.testHH, EmailPaymentDue, "", true); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetEmail(ctx, carl, f.testHH, EmailReconnect, "", true); err != nil {
		t.Fatal(err)
	}
	m := f.outbox(t)
	if !m["reconnect "+alice+" "+alice] || !m["payment_due "+alice+" "+alice] || !m["reconnect "+carl+" "+carl] {
		t.Errorf("owners' emails not sent: %v", m)
	}
	// Alice gets Carl's reconnect in the app; by email only once she asks.
	list, _ := f.sys.EmailOutbox(ctx, 100)
	parentSend := func() bool {
		list, _ = f.sys.EmailOutbox(ctx, 100)
		for _, e := range list {
			if e.Kind == "reconnect" && e.UserID == alice && e.OwnerID == carl {
				return e.Send
			}
		}
		t.Fatal("no outbox row for Alice about Carl's bank")
		return false
	}
	if parentSend() {
		t.Error("Carl's reconnect emailed to Alice without asking")
	}
	if err := f.db.SetEmail(ctx, alice, f.testHH, EmailKidReconnect, carl, true); err != nil {
		t.Fatal(err)
	}
	if !parentSend() {
		t.Error("Alice asked for Carl's reconnect emails but won't get one")
	}
	// A child can't ask for a parent's emails.
	if err := f.db.SetEmail(ctx, carl, f.testHH, EmailKidReconnect, alice, true); err != nil {
		t.Fatal(err)
	}
	for _, e := range list {
		if e.UserID == carl && e.OwnerID == alice {
			t.Errorf("Carl has an alert about Alice's bank")
		}
	}
	// Bob isn't in the household: his link changes nothing.
	if err := f.db.SetEmail(ctx, bob, f.testHH, EmailReconnect, "", true); err == nil {
		t.Error("Bob saved settings in a household he isn't in")
	}

	// Looked at once, never again.
	var ids []string
	for _, e := range list {
		ids = append(ids, e.ID)
	}
	if err := f.sys.MarkEmailed(ctx, ids); err != nil {
		t.Fatal(err)
	}
	if got := len(f.outbox(t)); got != 0 {
		t.Errorf("outbox has %d after marking", got)
	}
	if _, err := f.execAs(alice, `select * from public.email_outbox(10)`); err == nil {
		t.Error("the app's login could read the outbox")
	}
}

func TestSettingsKidEmails(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	s, err := f.db.NotificationSettingsFor(ctx, alice, f.testHH)
	if err != nil || len(s.EmailKidReconnect) != 0 {
		t.Fatalf("defaults = %+v, %v", s, err)
	}
	s.EmailKidReconnect = []string{carl}
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	if s, _ = f.db.NotificationSettingsFor(ctx, alice, f.testHH); len(s.EmailKidReconnect) != 1 || s.EmailKidReconnect[0] != carl {
		t.Errorf("saved kids = %v", s.EmailKidReconnect)
	}
	if err := f.db.SetEmail(ctx, alice, f.testHH, EmailKidReconnect, carl, false); err != nil {
		t.Fatal(err)
	}
	if s, _ = f.db.NotificationSettingsFor(ctx, alice, f.testHH); len(s.EmailKidReconnect) != 0 {
		t.Errorf("after unsubscribing, kids = %v", s.EmailKidReconnect)
	}
	s.EmailKidReconnect = []string{"not-a-uuid"}
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != ErrInvalid {
		t.Errorf("bad kid id: %v", err)
	}
}
