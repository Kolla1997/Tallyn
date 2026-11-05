package db

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

// Weekly summary email (#273). Alice owns the Test household (USD), Carl is
// her child, Dana (added here) an adult, Bob is in another household. The
// week is Mon Oct 19 to Sun Oct 25 2026, sent Monday Oct 26. All data is fake.

type weekly struct {
	Spent     int64
	CameIn    int64 `json:"came_in"`
	Days      []int64
	Purchases []struct {
		Name        string
		AmountMinor int64 `json:"amount_minor"`
	}
	Month struct {
		Spent, Last, Avg3 int64
	}
	CashMinor int64 `json:"cash_minor"`
	Shared    []struct {
		Name    string
		Kid     bool
		Month   struct{ Spent int64 }
		Biggest *struct {
			Name string
		}
	}
}

func (f *fixture) spend(t *testing.T, user, id, date, cat string, amount int) {
	t.Helper()
	mustExec(t, f.admin, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name, category_primary)
		values ($1, $2, $3, $4, 'USD', $5::date, $3, nullif($6, ''))`, f.testHH, f.account(t, user), id, amount, date, cat)
}

func (f *fixture) weeklyFor(t *testing.T, user string) weekly {
	t.Helper()
	raw, err := f.sys.WeeklySummary(context.Background(), f.testHH, user, time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("WeeklySummary: %v", err)
	}
	var w weekly
	if err := json.Unmarshal(raw, &w); err != nil {
		t.Fatalf("%v: %s", err, raw)
	}
	return w
}

func TestWeeklySummary(t *testing.T) {
	f := setup(t)
	f.spend(t, alice, "bike", "2026-10-20", "TRANSPORTATION", 50000)
	f.spend(t, alice, "kfc", "2026-10-20", "FOOD_AND_DRINK", 50000)
	f.spend(t, alice, "uber", "2026-10-24", "TRANSPORTATION", 633)
	f.spend(t, alice, "cardpay", "2026-10-20", "LOAN_PAYMENTS", 207850) // not spending
	f.spend(t, alice, "pay", "2026-10-23", "INCOME", -150000)           // came in
	f.spend(t, alice, "sep", "2026-09-10", "FOOD_AND_DRINK", 20000)     // last month, same days
	f.spend(t, alice, "early", "2026-10-02", "FOOD_AND_DRINK", 1000)    // this month, before the week

	w := f.weeklyFor(t, alice)
	if w.Spent != 100633 || w.CameIn != 150000 {
		t.Errorf("spent %d, came in %d; want 100633 and 150000", w.Spent, w.CameIn)
	}
	if len(w.Days) != 7 || w.Days[1] != 100000 || w.Days[5] != 633 || w.Days[0] != 0 {
		t.Errorf("days = %v", w.Days)
	}
	if len(w.Purchases) != 3 || w.Purchases[0].AmountMinor != 50000 {
		t.Errorf("purchases = %+v", w.Purchases)
	}
	if w.Month.Spent != 101633 || w.Month.Last != 20000 {
		t.Errorf("month = %+v", w.Month)
	}
	if w.CashMinor != 123456 {
		t.Errorf("cash = %d", w.CashMinor)
	}
	if w.Shared != nil {
		t.Errorf("shared section without asking: %+v", w.Shared)
	}
}

func TestWeeklySharedSection(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	f.addDana(t)
	mustExec(t, f.admin, `insert into plaid_items (household_id, owner_user_id, plaid_item_id, access_token_encrypted) values ($1, $2, 'item-dana', '\xbeef')`, f.testHH, danaG)
	mustExec(t, f.admin, `insert into accounts (household_id, plaid_item_id, owner_user_id, plaid_account_id, name, type, currency)
		select $1, id, $2, 'acct-dana', 'Dana checking', 'depository', 'USD' from plaid_items where plaid_item_id = 'item-dana'`, f.testHH, danaG)
	f.spend(t, carl, "carl-toy", "2026-10-21", "GENERAL_MERCHANDISE", 3000)
	f.spend(t, danaG, "dana-tv", "2026-10-22", "GENERAL_MERCHANDISE", 80000)

	s, _ := f.db.NotificationSettingsFor(ctx, alice, f.testHH)
	s.EmailIncludeShared = true
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	// Dana hasn't shared her transactions: only Carl, Alice's child, and
	// only his totals.
	w := f.weeklyFor(t, alice)
	if len(w.Shared) != 1 || w.Shared[0].Name == "" || !w.Shared[0].Kid || w.Shared[0].Month.Spent != 3000 || w.Shared[0].Biggest != nil {
		t.Fatalf("shared = %+v", w.Shared)
	}
	mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'transactions')`, f.testHH, danaG, alice)
	w = f.weeklyFor(t, alice)
	if len(w.Shared) != 2 {
		t.Fatalf("after Dana shares: %+v", w.Shared)
	}
	for _, o := range w.Shared {
		if !o.Kid && (o.Biggest == nil || o.Month.Spent != 80000) {
			t.Errorf("Dana's part = %+v", o)
		}
	}
	// A child never sees anyone else's.
	sc, _ := f.db.NotificationSettingsFor(ctx, carl, f.testHH)
	sc.EmailIncludeShared = true
	if err := f.db.SaveNotificationSettings(ctx, carl, f.testHH, sc); err != nil {
		t.Fatal(err)
	}
	if w := f.weeklyFor(t, carl); len(w.Shared) != 0 {
		t.Errorf("Carl sees %+v", w.Shared)
	}
}

func TestWeeklyDue(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	due := func(at time.Time) int {
		t.Helper()
		list, err := f.sys.WeeklyDue(ctx, at)
		if err != nil {
			t.Fatal(err)
		}
		return len(list)
	}
	mon9 := time.Date(2026, 10, 26, 14, 0, 0, 0, time.UTC) // 9:00 in Chicago (CDT)
	if due(mon9) != 0 {
		t.Fatal("due with the weekly summary off")
	}
	s, _ := f.db.NotificationSettingsFor(ctx, alice, f.testHH)
	s.EmailWeekly = true
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	if due(mon9.Add(-time.Minute)) != 0 || due(mon9) != 1 || due(mon9.Add(24*time.Hour)) != 0 {
		t.Error("not due exactly from Monday 9am Chicago to the end of Monday")
	}
	list, _ := f.sys.WeeklyDue(ctx, mon9)
	if list[0].WeekStart.Format("2006-01-02") != "2026-10-19" || list[0].Email == "" {
		t.Errorf("due = %+v", list[0])
	}
	if err := f.sys.MarkWeekly(ctx, f.testHH, alice, list[0].WeekStart, true); err != nil {
		t.Fatal(err)
	}
	if due(mon9.Add(time.Hour)) != 0 {
		t.Error("due again after it was sent")
	}

	// A saved time zone moves it; a save without one keeps it.
	tz := "Asia/Tokyo"
	s.TimeZone = &tz
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	s.TimeZone = nil
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.db.NotificationSettingsFor(ctx, alice, f.testHH); got.TimeZone == nil || *got.TimeZone != tz {
		t.Errorf("time zone = %v", got.TimeZone)
	}
	tokyoMon9 := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC) // 9:00 Monday in Tokyo
	if due(tokyoMon9) != 1 || due(time.Date(2026, 11, 2, 14, 0, 0, 0, time.UTC)) != 1 {
		t.Error("not due on Tokyo's Monday morning")
	}
	if due(time.Date(2026, 11, 2, 16, 0, 0, 0, time.UTC)) != 0 { // Tuesday 1am in Tokyo
		t.Error("due on Tuesday in Tokyo")
	}
	if _, err := f.execAs(alice, `select * from public.weekly_due(now())`); err == nil {
		t.Error("the app's login could run weekly_due")
	}
}
