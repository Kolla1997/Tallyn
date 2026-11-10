package db

import (
	"context"
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
			if err := f.db.MarkBillPaid(ctx, u, rent, billDay("2026-11-01"), 150000, today); !errors.Is(err, ErrNotFound) {
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
		if err := f.db.MarkBillPaid(ctx, alice, gas, billDay("2026-11-15"), 7135, today); err != nil {
			t.Fatal(err)
		}
		if err := f.db.MarkBillPaid(ctx, alice, rent, billDay("2026-11-02"), 150000, today); !errors.Is(err, ErrInvalid) {
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
