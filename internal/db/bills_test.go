package db

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

// Bills Plaid can't see (#127). Alice owns the Test household, Dana (added
// here) is an adult, Carl a child, Bob owns another household. All fake.

func billDay(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestDueIn(t *testing.T) {
	start := billDay("2026-11-01")
	cases := []struct {
		freq  string
		dueOn int
		month string
		want  string // "" = not due
	}{
		{"monthly", 1, "2026-11-01", "2026-11-01"},
		{"monthly", 31, "2027-02-01", "2027-02-28"}, // 31st → month's last day
		{"monthly", 31, "2028-02-01", "2028-02-29"},
		{"monthly", 15, "2026-10-01", ""}, // before it starts
		{"quarterly", 20, "2027-02-01", "2027-02-20"},
		{"quarterly", 20, "2027-01-01", ""},
		{"yearly", 5, "2027-11-01", "2027-11-05"},
		{"yearly", 5, "2027-10-01", ""},
		{"once", 9, "2026-11-01", "2026-11-09"},
		{"once", 9, "2026-12-01", ""},
		{"weekly", 9, "2026-11-01", ""},
	}
	for _, c := range cases {
		m := billDay(c.month)
		got, ok := DueIn(c.freq, c.dueOn, start, m.Year(), m.Month())
		gotS := ""
		if ok {
			gotS = got.Format("2006-01-02")
		}
		if gotS != c.want {
			t.Errorf("%s day %d in %s = %q, want %q", c.freq, c.dueOn, c.month, gotS, c.want)
		}
	}
}

func TestBills(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	nov, today := billDay("2026-11-01"), billDay("2026-11-09")

	rent, err := f.db.CreateBill(ctx, alice, f.testHH, NewBill{Name: " Rent ", Category: "housing", AmountMinor: 150000, Frequency: "monthly", DueDay: 1, StartsOn: "2026-11"})
	if err != nil {
		t.Fatal(err)
	}
	gas, err := f.db.CreateBill(ctx, alice, f.testHH, NewBill{Name: "Gas", AmountMinor: 6490, Varies: true, Frequency: "monthly", DueDay: 15, StartsOn: "2026-11"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.CreateBill(ctx, alice, f.testHH, NewBill{Name: "Water", AmountMinor: 4800, Frequency: "quarterly", DueDay: 20, StartsOn: "2026-12"}); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []NewBill{
		{Name: "", AmountMinor: 1, Frequency: "monthly", DueDay: 1, StartsOn: "2026-11"},
		{Name: "x", AmountMinor: 0, Frequency: "monthly", DueDay: 1, StartsOn: "2026-11"},
		{Name: "x", AmountMinor: 1, Frequency: "weekly", DueDay: 1, StartsOn: "2026-11"},
		{Name: "x", AmountMinor: 1, Frequency: "monthly", DueDay: 32, StartsOn: "2026-11"},
		{Name: "x", AmountMinor: 1, Frequency: "monthly", DueDay: 1, StartsOn: "Nov"},
		{Name: "x", AmountMinor: 1, Frequency: "monthly", DueDay: 1, StartsOn: "2026-11", Category: "pets"},
	} {
		if _, err := f.db.CreateBill(ctx, alice, f.testHH, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("CreateBill(%+v) = %v, want ErrInvalid", bad, err)
		}
	}

	t.Run("only owners", func(t *testing.T) {
		for _, u := range []string{danaG, carl, bob} {
			if _, _, err := f.db.Bills(ctx, u, f.testHH, nov, today); !errors.Is(err, ErrForbidden) {
				t.Errorf("Bills as %s = %v, want ErrForbidden", u, err)
			}
			if _, err := f.db.CreateBill(ctx, u, f.testHH, NewBill{Name: "x", AmountMinor: 1, Frequency: "monthly", DueDay: 1, StartsOn: "2026-11"}); err == nil {
				t.Errorf("%s created a bill", u)
			}
			if err := f.db.MarkBillPaid(ctx, u, rent, billDay("2026-11-01"), 150000, today, ""); !errors.Is(err, ErrNotFound) {
				t.Errorf("%s marked rent paid: %v", u, err)
			}
			if err := f.db.DeleteBill(ctx, u, rent); !errors.Is(err, ErrNotFound) {
				t.Errorf("%s deleted rent: %v", u, err)
			}
			if n, err := f.execAs(u, `select 1 from bills`); err == nil && n > 0 {
				t.Errorf("%s reads %d bills directly", u, n)
			}
		}
	})

	t.Run("due, late and paid", func(t *testing.T) {
		bills, dues, err := f.db.Bills(ctx, alice, f.testHH, nov, today)
		if err != nil {
			t.Fatal(err)
		}
		if len(bills) != 3 || bills[0].Name != "Rent" || bills[0].Currency != "USD" {
			t.Fatalf("bills = %+v", bills)
		}
		if len(dues) != 2 { // water starts in December
			t.Fatalf("dues = %+v", dues)
		}
		if dues[0].Status != "late" || dues[1].Status != "due" {
			t.Errorf("statuses = %s, %s; want late, due", dues[0].Status, dues[1].Status)
		}
		if err := f.db.MarkBillPaid(ctx, alice, gas, billDay("2026-11-15"), 7135, today, ""); err != nil {
			t.Fatal(err)
		}
		if err := f.db.MarkBillPaid(ctx, alice, rent, billDay("2026-11-02"), 150000, today, ""); !errors.Is(err, ErrInvalid) {
			t.Errorf("paid on a day it isn't due: %v, want ErrInvalid", err)
		}
		_, dues, _ = f.db.Bills(ctx, alice, f.testHH, nov, today)
		if dues[1].Status != "paid" || *dues[1].PaidMinor != 7135 || *dues[1].PaidOn != "2026-11-09" {
			t.Errorf("gas = %+v", dues[1])
		}
		if err := f.db.UnmarkBillPaid(ctx, alice, gas, billDay("2026-11-15")); err != nil {
			t.Fatal(err)
		}
		_, dues, _ = f.db.Bills(ctx, alice, f.testHH, nov, today)
		if dues[1].Status != "due" {
			t.Errorf("after unmark gas is %s", dues[1].Status)
		}
	})

	t.Run("paused bills drop out unless paid", func(t *testing.T) {
		if err := f.db.UpdateBill(ctx, alice, gas, NewBill{Name: "Gas", AmountMinor: 6490, Varies: true, Frequency: "monthly", DueDay: 15, StartsOn: "2026-11", Paused: true}); err != nil {
			t.Fatal(err)
		}
		_, dues, _ := f.db.Bills(ctx, alice, f.testHH, nov, today)
		if len(dues) != 1 {
			t.Errorf("dues with gas paused = %d, want 1", len(dues))
		}
	})

	t.Run("possible match from the bank", func(t *testing.T) {
		acct := f.account(t, alice)
		mustExec(t, f.admin, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name)
			values ($1, $2, 'bill-match-1', 148500, 'USD', '2026-11-02', 'Landlord LLC')`, f.testHH, acct)
		_, dues, _ := f.db.Bills(ctx, alice, f.testHH, nov, today)
		if dues[0].Match == nil || dues[0].Match.Name != "Landlord LLC" || dues[0].Match.AmountMinor != 148500 {
			t.Errorf("rent match = %+v", dues[0].Match)
		}
	})

	t.Run("delete", func(t *testing.T) {
		if err := f.db.DeleteBill(ctx, alice, rent); err != nil {
			t.Fatal(err)
		}
		bills, _, _ := f.db.Bills(ctx, alice, f.testHH, nov, today)
		if len(bills) != 2 {
			t.Errorf("after delete %d bills", len(bills))
		}
	})
}

// Paid bills count as spending (#127, 0030): in Transactions, Spending and
// household budgets, for owners only, and not twice when paid from the bank.
func TestBillsInSpending(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	today := billDay("2026-11-20")
	rent, err := f.db.CreateBill(ctx, alice, f.testHH, NewBill{Name: "Rent", Category: "housing", AmountMinor: 150000, Frequency: "monthly", DueDay: 1, StartsOn: "2026-11"})
	if err != nil {
		t.Fatal(err)
	}
	gas, err := f.db.CreateBill(ctx, alice, f.testHH, NewBill{Name: "Gas", Category: "utilities", AmountMinor: 6490, Frequency: "monthly", DueDay: 15, StartsOn: "2026-11"})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.db.MarkBillPaid(ctx, alice, rent, billDay("2026-11-01"), 150000, billDay("2026-11-02"), ""); err != nil {
		t.Fatal(err)
	}
	// Gas was paid from a linked bank: that transaction already counts.
	acct := f.account(t, alice)
	var txID string
	if err := f.admin.QueryRow(ctx, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name, category_primary)
		values ($1, $2, 'gas-co-1', 7135, 'USD', '2026-11-14', 'City Gas', 'RENT_AND_UTILITIES') returning id`, f.testHH, acct).Scan(&txID); err != nil {
		t.Fatal(err)
	}
	if err := f.db.MarkBillPaid(ctx, alice, gas, billDay("2026-11-15"), 7135, billDay("2026-11-14"), txID); err != nil {
		t.Fatal(err)
	}

	rentUtilities := func(user string) int64 {
		t.Helper()
		list, err := f.db.Spending(ctx, user, f.testHH, "2026-11")
		if err != nil {
			t.Fatal(err)
		}
		for _, s := range list {
			if s.Category == "RENT_AND_UTILITIES" {
				return s.AmountMinor
			}
		}
		return 0
	}
	if got := rentUtilities(alice); got != 150000+7135 {
		t.Errorf("alice's rent and utilities = %d, want rent once and gas once", got)
	}
	if got := rentUtilities(danaG); got != 0 {
		t.Errorf("dana sees %d of bills in spending", got)
	}

	list, _, err := f.db.Transactions(ctx, alice, f.testHH, TxFilter{Month: "2026-11"})
	if err != nil {
		t.Fatal(err)
	}
	bills := 0
	for _, tx := range list {
		if tx.BillID != nil {
			bills++
			if *tx.BillID != rent || tx.AccountID != "" || tx.Date != "2026-11-02" || tx.AmountMinor != 150000 {
				t.Errorf("bill line = %+v", tx)
			}
		}
	}
	if bills != 1 {
		t.Errorf("%d bill lines in Transactions, want 1 (rent; gas came from the bank)", bills)
	}
	countBills := func(owner string) int {
		list, _, err := f.db.Transactions(ctx, alice, f.testHH, TxFilter{Month: "2026-11", Owner: owner})
		if err != nil {
			t.Fatal(err)
		}
		n := 0
		for _, tx := range list {
			if tx.BillID != nil {
				n++
			}
		}
		return n
	}
	if n := countBills(alice); n != 1 {
		t.Errorf("alice's own view (Yours) has %d bill lines, want 1", n)
	}
	if n := countBills(carl); n != 0 {
		t.Errorf("filtering to Carl shows %d household bills", n)
	}

	// Alice counts her own spending in household budgets, so the bank's gas shows there too.
	if err := f.db.SetCountInBudgets(ctx, alice, f.testHH, true); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.CreateBudget(ctx, alice, f.testHH, NewBudget{Category: "RENT_AND_UTILITIES", Period: "month", AmountMinor: 200000}); err != nil {
		t.Fatal(err)
	}
	spent := func(user string) int64 {
		t.Helper()
		bs, _, err := f.db.Budgets(ctx, user, f.testHH, today)
		if err != nil {
			t.Fatal(err)
		}
		for _, b := range bs {
			if b.Category != nil && *b.Category == "RENT_AND_UTILITIES" && b.MemberUserID == nil {
				return b.SpentMinor
			}
		}
		t.Fatalf("%s can't see the household budget", user)
		return 0
	}
	if got := spent(alice); got != 150000+7135 {
		t.Errorf("alice's household budget spent = %d", got)
	}
	if got := spent(danaG); got != 7135 {
		t.Errorf("dana's household budget spent = %d, want the bank's gas only", got)
	}
}

// Bills in the summary emails and household plans (#127, 0031): owners only,
// never counted twice, and bills due the week after in the weekly email.
func TestBillsInEmailsAndPlans(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	rent, err := f.db.CreateBill(ctx, alice, f.testHH, NewBill{Name: "Rent", Category: "housing", AmountMinor: 150000, Frequency: "monthly", DueDay: 1, StartsOn: "2026-11"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.CreateBill(ctx, alice, f.testHH, NewBill{Name: "Water", Category: "utilities", AmountMinor: 4800, Varies: true, Frequency: "monthly", DueDay: 18, StartsOn: "2026-11"}); err != nil {
		t.Fatal(err)
	}
	if err := f.db.MarkBillPaid(ctx, alice, rent, billDay("2026-11-01"), 150000, billDay("2026-11-10"), ""); err != nil {
		t.Fatal(err)
	}

	type bills struct {
		Bills *struct {
			PaidTotal int64 `json:"paid_total"`
			Paid      []struct {
				Name string
			}
			Due []struct {
				Name    string
				DueDate string `json:"due_date"`
			}
		}
	}
	week := func(user string) bills {
		t.Helper()
		raw, err := f.sys.WeeklySummary(ctx, f.testHH, user, billDay("2026-11-09")) // Mon 9 – Sun 15; due window 16 – 23
		if err != nil {
			t.Fatal(err)
		}
		var b bills
		if err := json.Unmarshal(raw, &b); err != nil {
			t.Fatal(err)
		}
		return b
	}
	a := week(alice)
	if a.Bills == nil || a.Bills.PaidTotal != 150000 || len(a.Bills.Paid) != 1 || a.Bills.Paid[0].Name != "Rent" {
		t.Fatalf("alice's weekly bills = %+v", a.Bills)
	}
	if len(a.Bills.Due) != 1 || a.Bills.Due[0].Name != "Water" || a.Bills.Due[0].DueDate != "2026-11-18" {
		t.Errorf("due next week = %+v", a.Bills.Due)
	}
	if d := week(danaG); d.Bills != nil {
		t.Errorf("dana (adult) gets bills in her email: %+v", d.Bills)
	}
	raw, err := f.sys.MonthlySummary(ctx, f.testHH, alice, billDay("2026-11-01"))
	if err != nil {
		t.Fatal(err)
	}
	var mo bills
	_ = json.Unmarshal(raw, &mo)
	if mo.Bills == nil || mo.Bills.PaidTotal != 150000 || len(mo.Bills.Due) != 0 {
		t.Errorf("monthly bills = %+v", mo.Bills)
	}

	// A household plan counts rent as an essential, for the owner only.
	if _, err := f.db.SavePlan(ctx, alice, f.testHH, plan55); err != nil {
		t.Fatal(err)
	}
	essentials := func(user string) int64 {
		t.Helper()
		plans, err := f.db.Plans(ctx, user, f.testHH, billDay("2026-11-20"))
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range plans {
			if p.MemberUserID == nil {
				return p.Progress["essentials"]
			}
		}
		t.Fatalf("%s can't see the household plan", user)
		return 0
	}
	if got := essentials(alice); got != 150000 {
		t.Errorf("alice's household plan needs = %d, want rent", got)
	}
	if got := essentials(danaG); got != 0 {
		t.Errorf("dana's household plan needs = %d, want 0", got)
	}
}
