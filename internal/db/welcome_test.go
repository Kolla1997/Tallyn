package db

import (
	"context"
	"testing"
	"time"
)

// The welcome email (#280). All data is fake.
func TestWelcomeDue(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	due := func(at time.Time) []WelcomeDue {
		t.Helper()
		list, err := f.sys.WelcomeDue(ctx, at)
		if err != nil {
			t.Fatal(err)
		}
		return list
	}
	now := time.Now()
	if len(due(now)) != 0 {
		t.Fatal("due before anyone agreed to the terms")
	}
	mustExec(t, f.admin, `insert into consents (user_id, document, version) values ($1, 'terms', '2026-10-01')`, alice)
	if len(due(now)) != 0 {
		t.Error("due with only the terms agreed")
	}
	mustExec(t, f.admin, `insert into consents (user_id, document, version) values ($1, 'privacy', '2026-10-02')`, alice)
	mustExec(t, f.admin, `update profiles set display_name = 'Alice' where id = $1`, alice)
	list := due(now)
	if len(list) != 1 || list[0].UserID != alice || list[0].Email == "" || list[0].Name != "Alice" {
		t.Fatalf("due = %+v", list)
	}
	if len(due(now.Add(8*24*time.Hour))) != 0 {
		t.Error("still due more than 7 days after agreeing: older accounts must not all get one")
	}
	if err := f.sys.MarkWelcome(ctx, alice, true); err != nil {
		t.Fatal(err)
	}
	if len(due(now)) != 0 {
		t.Error("due again after it was sent")
	}
	if _, err := f.execAs(alice, `select * from welcome_emails`); err == nil {
		t.Error("the app's login can read welcome_emails")
	}
}
