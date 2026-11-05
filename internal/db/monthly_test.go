package db

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

// Monthly highlights (#274). October 2026, sent Nov 1. Alice owns the Test
// household, Carl is her child, Dana an adult. All data is fake.

type monthly struct {
	Spent   int64
	CameIn  int64 `json:"came_in"`
	Compare struct{ Spent, Last, Avg3 int64 }
	Days    []int64
	Busiest *struct {
		Date        string
		AmountMinor int64 `json:"amount_minor"`
	}
	Biggest *struct {
		Name        string
		AmountMinor int64 `json:"amount_minor"`
	}
	BiggestIn *struct {
		AmountMinor int64 `json:"amount_minor"`
	} `json:"biggest_in"`
	Categories []struct {
		Category    string
		AmountMinor int64 `json:"amount_minor"`
	}
	Shared []struct {
		Name    string
		Kid     bool
		Compare struct{ Spent int64 }
		Biggest *struct{ Name string }
	}
}

func (f *fixture) monthlyFor(t *testing.T, user string) monthly {
	t.Helper()
	raw, err := f.sys.MonthlySummary(context.Background(), f.testHH, user, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("MonthlySummary: %v", err)
	}
	var m monthly
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("%v: %s", err, raw)
	}
	return m
}

func TestMonthlySummary(t *testing.T) {
	f := setup(t)
	f.spend(t, alice, "kfc", "2026-10-20", "FOOD_AND_DRINK", 50000)
	f.spend(t, alice, "bike", "2026-10-20", "TRANSPORTATION", 30000)
	f.spend(t, alice, "air", "2026-10-26", "TRAVEL", 60000)
	f.spend(t, alice, "cardpay", "2026-10-05", "LOAN_PAYMENTS", 207850) // not spending
	f.spend(t, alice, "refund", "2026-10-09", "TRAVEL", -100000)        // came in
	f.spend(t, alice, "sep", "2026-09-30", "FOOD_AND_DRINK", 40000)     // last month
	f.spend(t, alice, "aug", "2026-08-01", "FOOD_AND_DRINK", 20000)     // in the 3-month average
	f.spend(t, alice, "nov", "2026-11-01", "FOOD_AND_DRINK", 99900)     // next month: not counted

	m := f.monthlyFor(t, alice)
	if m.Spent != 140000 || m.CameIn != 100000 {
		t.Errorf("spent %d, came in %d", m.Spent, m.CameIn)
	}
	if m.Compare.Last != 40000 || m.Compare.Avg3 != 20000 { // (40000 + 20000 + 0) / 3
		t.Errorf("compare = %+v", m.Compare)
	}
	if len(m.Days) != 31 || m.Days[19] != 80000 || m.Days[25] != 60000 {
		t.Errorf("days = %v", m.Days)
	}
	if m.Busiest == nil || m.Busiest.Date != "2026-10-20" || m.Busiest.AmountMinor != 80000 {
		t.Errorf("busiest = %+v", m.Busiest)
	}
	if m.Biggest == nil || m.Biggest.AmountMinor != 60000 || m.BiggestIn == nil || m.BiggestIn.AmountMinor != 100000 {
		t.Errorf("biggest = %+v, in = %+v", m.Biggest, m.BiggestIn)
	}
	if len(m.Categories) != 3 || m.Categories[0].Category != "TRAVEL" || m.Categories[0].AmountMinor != 60000 {
		t.Errorf("categories = %+v", m.Categories)
	}
	if m.Shared != nil {
		t.Errorf("shared without asking: %+v", m.Shared)
	}
}

func TestMonthlySharedAndDue(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	f.spend(t, carl, "carl-toy", "2026-10-21", "GENERAL_MERCHANDISE", 3000)
	s, _ := f.db.NotificationSettingsFor(ctx, alice, f.testHH)
	s.EmailIncludeShared, s.EmailMonthly = true, true
	if err := f.db.SaveNotificationSettings(ctx, alice, f.testHH, s); err != nil {
		t.Fatal(err)
	}
	m := f.monthlyFor(t, alice)
	if len(m.Shared) != 1 || !m.Shared[0].Kid || m.Shared[0].Compare.Spent != 3000 || m.Shared[0].Biggest != nil {
		t.Errorf("Carl's part = %+v", m.Shared)
	}
	if c := f.monthlyFor(t, carl); len(c.Shared) != 0 {
		t.Errorf("Carl sees %+v", c.Shared)
	}

	due := func(at time.Time) []WeeklyDue {
		t.Helper()
		list, err := f.sys.MonthlyDue(ctx, at)
		if err != nil {
			t.Fatal(err)
		}
		return list
	}
	// Nov 1 2026 is when Chicago leaves daylight time: 9am CST is 15:00 UTC.
	nov1 := time.Date(2026, 11, 1, 15, 0, 0, 0, time.UTC)
	if len(due(nov1.Add(-time.Minute))) != 0 {
		t.Error("due before 9am Chicago")
	}
	list := due(nov1)
	if len(list) != 1 || list[0].WeekStart.Format("2006-01-02") != "2026-10-01" {
		t.Fatalf("due = %+v", list)
	}
	if len(due(time.Date(2026, 11, 2, 15, 0, 0, 0, time.UTC))) != 0 {
		t.Error("due on the 2nd")
	}
	if err := f.sys.MarkMonthly(ctx, f.testHH, alice, list[0].WeekStart, true); err != nil {
		t.Fatal(err)
	}
	if len(due(nov1.Add(2*time.Hour))) != 0 {
		t.Error("due again after it was sent")
	}
	if _, err := f.execAs(alice, `select * from public.monthly_due(now())`); err == nil {
		t.Error("the app's login could run monthly_due")
	}
}
