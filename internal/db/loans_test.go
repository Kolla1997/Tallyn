package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Loans Plaid can't see (#306). The example from Dinesh: $25,000 at 4.9% over
// 60 months. All data is fake.

func TestLoanMaths(t *testing.T) {
	if got := LoanPayment(2500000, 490, 60); got != 47064 {
		t.Errorf("payment = %d, want 47064 ($470.64)", got)
	}
	if got := LoanPayment(120000, 0, 12); got != 10000 {
		t.Errorf("0%% payment = %d, want 10000", got)
	}
	on := func(s string) time.Time { return billDay(s) }
	s := RunLoan(2500000, 490, []LoanEvent{{On: on("2025-12-05"), Minor: 47064}}, 2025)
	if s.Last.InterestMinor != 10208 || s.Last.BalanceMinor != 36856 || s.Balance != 2463144 || s.InterestThisYear != 10208 {
		t.Errorf("first payment split = %+v, balance %d", s.Last, s.Balance)
	}
	// An extra payment goes straight to the balance, no interest.
	s = RunLoan(2500000, 490, []LoanEvent{{On: on("2025-12-20"), Minor: 50000, Extra: true}, {On: on("2025-12-05"), Minor: 47064}}, 2025)
	if s.Balance != 2463144-50000 || s.Last.InterestMinor != 0 || !s.Last.Extra || s.Payments != 1 {
		t.Errorf("extra: %+v balance %d", s.Last, s.Balance)
	}
	// 60 payments clear it; a payment under the interest never does.
	if n := PayoffMonths(2500000, 490, 47064); n != 60 {
		t.Errorf("payoff months = %d, want 60", n)
	}
	if n := PayoffMonths(2500000, 490, 10000); n != -1 {
		t.Errorf("tiny payment payoff = %d, want -1", n)
	}
	for _, bad := range []string{"-1", "101", "4.555", "abc"} {
		if _, ok := aprBP(bad); ok {
			t.Errorf("aprBP(%q) accepted", bad)
		}
	}
	if bp, ok := aprBP("4.9%"); !ok || bp != 490 {
		t.Errorf("aprBP(4.9%%) = %d %v", bp, ok)
	}
}

func TestManualLoans(t *testing.T) {
	f := setup(t)
	f.addDana(t)
	ctx := context.Background()
	today := billDay("2026-11-09")
	toyota := NewLoan{Name: "Toyota car loan", Lender: "Toyota Financial", PrincipalMinor: 2500000, APR: "4.9", Months: 60, FirstDue: "2025-12-05"}
	id, err := f.db.CreateLoan(ctx, alice, f.testHH, toyota, today)
	if err != nil {
		t.Fatal(err)
	}
	for _, u := range []string{danaG, carl, bob} {
		if _, err := f.db.Loans(ctx, u, f.testHH, today); !errors.Is(err, ErrForbidden) {
			t.Errorf("Loans as %s = %v, want ErrForbidden", u, err)
		}
		if _, err := f.db.CreateLoan(ctx, u, f.testHH, toyota, today); err == nil {
			t.Errorf("%s created a loan", u)
		}
		if err := f.db.SetLoanBalance(ctx, u, id, 1, today); !errors.Is(err, ErrNotFound) {
			t.Errorf("%s corrected the balance: %v", u, err)
		}
	}
	// Its payment is a monthly bill: due on the 5th, $470.64, kind loan.
	bills, dues, err := f.db.Bills(ctx, alice, f.testHH, billDay("2026-11-01"), today)
	if err != nil || len(bills) != 1 || bills[0].AmountMinor != 47064 || bills[0].DueDay != 5 || *bills[0].Category != "loan" || dues[0].Due != "2026-11-05" {
		t.Fatalf("loan bill = %+v %+v %v", bills, dues, err)
	}
	// Pay the first two months.
	for _, d := range []string{"2025-12-05", "2026-01-05"} {
		if err := f.db.MarkBillPaid(ctx, alice, id, billDay(d), 47064, billDay(d), ""); err != nil {
			t.Fatal(err)
		}
	}
	one := func() ManualLoan {
		t.Helper()
		list, err := f.db.Loans(ctx, alice, f.testHH, today)
		if err != nil || len(list) != 1 {
			t.Fatalf("Loans = %+v %v", list, err)
		}
		return list[0]
	}
	l := one()
	// Dec: 102.08 interest; Jan: round(24631.44 × 0.049/12) = 100.58 interest.
	if l.BalanceMinor != 2500000-36856-37006 || l.InterestPaidMinor != 10208+10058 || l.InterestThisYearMinor != 10058 || l.PaymentsMade != 2 {
		t.Errorf("after two payments: %+v", l)
	}
	if l.NextDue == nil || *l.NextDue != "2026-02-05" || l.PayoffDate == nil || *l.PayoffDate != "2030-11-05" || l.APR != "4.9" {
		t.Errorf("next due / payoff = %v / %v, APR %q", l.NextDue, l.PayoffDate, l.APR)
	}
	// An extra $500 brings the payoff forward.
	if err := f.db.AddLoanExtra(ctx, alice, id, 50000, billDay("2026-01-20")); err != nil {
		t.Fatal(err)
	}
	if l2 := one(); l2.BalanceMinor != l.BalanceMinor-50000 || *l2.PayoffDate >= *l.PayoffDate {
		t.Errorf("after extra: balance %d payoff %v", l2.BalanceMinor, *l2.PayoffDate)
	}
	// Correcting to the lender's figure: payments after that date start from it.
	if err := f.db.SetLoanBalance(ctx, alice, id, 2400000, billDay("2026-01-31")); err != nil {
		t.Fatal(err)
	}
	if err := f.db.MarkBillPaid(ctx, alice, id, billDay("2026-02-05"), 47064, billDay("2026-02-05"), ""); err != nil {
		t.Fatal(err)
	}
	if l3 := one(); l3.BalanceMinor != 2400000-(47064-9800) || l3.CorrectedMinor == nil || *l3.CorrectedMinor != 2400000 {
		t.Errorf("after correction: %+v", l3)
	}
	// A loan payment isn't spending (#77).
	list, err := f.db.Spending(ctx, alice, f.testHH, "2026-02")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Errorf("loan payment counted as spending: %+v", list)
	}
	// Deleting the bill deletes the loan.
	if err := f.db.DeleteBill(ctx, alice, id); err != nil {
		t.Fatal(err)
	}
	if list, _ := f.db.Loans(ctx, alice, f.testHH, today); len(list) != 0 {
		t.Errorf("loan left after delete: %+v", list)
	}
}
