package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Savings goals (#14). Alice is an owner, Carl her child, Dana (added here)
// an adult, Bob in another household. All data is fake.

const danaG = "00000000-0000-4000-8000-0000000000d1"

var goalToday = time.Date(2026, 10, 24, 0, 0, 0, 0, time.UTC)

func (f *fixture) addDana(t *testing.T) {
	t.Helper()
	mustExec(t, f.admin, `insert into auth.users (id, email) values ($1, 'dana@example.test')`, danaG)
	mustExec(t, f.admin, `insert into household_members (household_id, user_id, role) values ($1, $2, 'adult')`, f.testHH, danaG)
}

func (f *fixture) account(t *testing.T, user string) string {
	t.Helper()
	var id string
	if err := f.admin.QueryRow(context.Background(), `select id from accounts where owner_user_id = $1`, user).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// visible returns the goals user sees, by name.
func (f *fixture) visible(t *testing.T, user string) map[string]Goal {
	t.Helper()
	list, err := f.db.Goals(context.Background(), user, f.testHH)
	if err != nil {
		t.Fatalf("Goals as %s: %v", user, err)
	}
	m := map[string]Goal{}
	for _, g := range list {
		m[g.Name] = g
	}
	return m
}

func TestGoalWhoSees(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	for _, g := range []NewGoal{
		{Name: "Only mine", TargetMinor: 100000, Visibility: "me"},
		{Name: "With Dana", TargetMinor: 100000, Visibility: "member", SharedWith: danaG},
		{Name: "  Everyone  ", TargetMinor: 100000, Visibility: "everyone", ByMonth: "2027-06"},
		{Name: "Carl's laptop", OwnerUserID: carl, TargetMinor: 90000, Visibility: "me"},
	} {
		if _, err := f.db.CreateGoal(ctx, alice, f.testHH, g); err != nil {
			t.Fatalf("create %q: %v", g.Name, err)
		}
	}
	want := map[string][]string{
		alice: {"Only mine", "With Dana", "Everyone", "Carl's laptop"},
		danaG: {"With Dana", "Everyone", "Carl's laptop"}, // an adult sees kids' goals
		carl:  {"Everyone", "Carl's laptop"},
		bob:   {},
	}
	for user, names := range want {
		got := f.visible(t, user)
		if len(got) != len(names) {
			t.Errorf("%s sees %d goals, want %d (%v)", user, len(got), len(names), names)
		}
		for _, n := range names {
			if _, ok := got[n]; !ok {
				t.Errorf("%s can't see %q", user, n)
			}
		}
	}
	if g := f.visible(t, alice)["Everyone"]; g.ByMonth == nil || *g.ByMonth != "2027-06-01" || g.Currency != "USD" {
		t.Errorf("Everyone goal = %+v", g)
	}
	// Carl (a child) can't set up his own goals; nobody outside sets any.
	if _, err := f.db.CreateGoal(ctx, carl, f.testHH, NewGoal{Name: "Mine", TargetMinor: 100, Visibility: "me"}); !errors.Is(err, ErrForbidden) {
		t.Errorf("carl creates a goal: %v, want ErrForbidden", err)
	}
	if _, err := f.db.CreateGoal(ctx, bob, f.testHH, NewGoal{Name: "In", TargetMinor: 100, Visibility: "me"}); !errors.Is(err, ErrForbidden) {
		t.Errorf("bob creates a goal in the Test household: %v, want ErrForbidden", err)
	}
}

func TestGoalNeverRevealsABalance(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	acct := f.account(t, alice) // balance 123456 in the seed
	if _, err := f.db.CreateGoal(ctx, alice, f.testHH, NewGoal{Name: "Emergency fund", TargetMinor: 600000, AccountID: acct, Visibility: "everyone"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if g := f.visible(t, alice)["Emergency fund"]; g.Saved == nil || *g.Saved != 123456 || g.Account == nil {
		t.Errorf("alice's own progress = %+v", g)
	}
	// Dana and Carl see the goal, but not the balance behind it.
	for _, user := range []string{danaG, carl} {
		g, ok := f.visible(t, user)["Emergency fund"]
		if !ok || g.Saved != nil || g.History != nil || g.Account != nil {
			t.Errorf("%s sees %+v; want the goal with no progress, history or account", user, g)
		}
	}
	// Once Alice shares her balances with Dana, Dana sees the progress.
	mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'balances')`, f.testHH, alice, danaG)
	if g := f.visible(t, danaG)["Emergency fund"]; g.Saved == nil || *g.Saved != 123456 {
		t.Errorf("dana after the share = %+v", g)
	}
	// The amount column itself is never readable.
	if _, err := f.execAs(danaG, `select saved_minor from goals`); err == nil {
		t.Error("goals.saved_minor is readable directly")
	}
	// A goal can only follow its own person's account.
	if _, err := f.db.CreateGoal(ctx, alice, f.testHH, NewGoal{Name: "Not mine", TargetMinor: 100, AccountID: f.account(t, carl), Visibility: "me"}); !errors.Is(err, ErrForbidden) {
		t.Errorf("following someone else's account: %v, want ErrForbidden", err)
	}
}

func TestGoalByHandAndHistory(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	id, err := f.db.CreateGoal(ctx, alice, f.testHH, NewGoal{Name: "Paris trip", TargetMinor: 200000, Currency: "EUR", ByMonth: "2027-08", Visibility: "member", SharedWith: danaG})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetGoalSaved(ctx, alice, id, 30000, goalToday); err != nil {
		t.Fatalf("set saved: %v", err)
	}
	if err := f.db.SetGoalSaved(ctx, danaG, id, 99, goalToday); !errors.Is(err, ErrForbidden) {
		t.Errorf("dana updates alice's goal: %v, want ErrForbidden", err)
	}
	g := f.visible(t, danaG)["Paris trip"]
	if g.Saved == nil || *g.Saved != 30000 || g.Currency != "EUR" || len(g.History) != 1 || g.History[0].Month != "2026-10-01" {
		t.Errorf("dana sees %+v", g)
	}

	// A goal that follows an account: updated daily by the sync, not by hand.
	acct := f.account(t, alice)
	follow, _ := f.db.CreateGoal(ctx, alice, f.testHH, NewGoal{Name: "Fund", TargetMinor: 600000, AccountID: acct, Visibility: "me"})
	if err := f.db.SetGoalSaved(ctx, alice, follow, 5, goalToday); !errors.Is(err, ErrForbidden) {
		t.Errorf("hand update of an account goal: %v, want ErrForbidden", err)
	}
	if n, err := f.sys.SnapshotGoals(ctx, goalToday); err != nil || n != 1 {
		t.Errorf("SnapshotGoals = %d, %v; want 1", n, err)
	}
	if h := f.visible(t, alice)["Fund"].History; len(h) != 1 || h[0].SavedMinor != 123456 {
		t.Errorf("Fund history = %+v", h)
	}
	// The app's own login can't run the snapshot.
	if _, err := f.execAs(alice, `select public.snapshot_goals(current_date)`); err == nil {
		t.Error("the app's login could run snapshot_goals")
	}

	// Unlinking the bank turns the goal into one updated by hand.
	mustExec(t, f.admin, `delete from plaid_items where id = $1`, f.aliceItem)
	if g := f.visible(t, alice)["Fund"]; g.AccountID != nil || g.Saved == nil || *g.Saved != 0 {
		t.Errorf("after unlinking: %+v", g)
	}

	// Bad goals are refused before the database.
	for i, bad := range []NewGoal{
		{Name: "  ", TargetMinor: 1, Visibility: "me"},
		{Name: "x", TargetMinor: 0, Visibility: "me"},
		{Name: "x", TargetMinor: 1, Visibility: "member"},
		{Name: "x", TargetMinor: 1, Visibility: "everyone", SharedWith: danaG},
		{Name: "x", TargetMinor: 1, Visibility: "me", ByMonth: "June"},
		{Name: "x", TargetMinor: 1, Visibility: "me", Currency: "usd"},
	} {
		if _, err := f.db.CreateGoal(ctx, alice, f.testHH, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("bad goal %d: %v, want ErrInvalid", i, err)
		}
	}
	if err := f.db.DeleteGoal(ctx, danaG, id); !errors.Is(err, ErrNotFound) {
		t.Errorf("dana deletes alice's goal: %v, want ErrNotFound", err)
	}
	if err := f.db.DeleteGoal(ctx, alice, id); err != nil {
		t.Errorf("alice deletes her goal: %v", err)
	}
}
