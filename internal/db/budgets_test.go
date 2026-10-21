package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Budgets (#13, 0015_budgets.sql, ADR 0014). The family: alice (owner),
// dave (adult), carl (child), mia (teen), rosa (viewer); bob is in another
// household. Alice and carl each spent $12.34 on Food and drink on 1 October.
var october = time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)

func budgetFamily(t *testing.T) *fixture {
	t.Helper()
	f := sharingFamily(t)
	// Dave's bank: spending that counts, and money moves that never do.
	f.seedBank(t, f.testHH, dave, "d")
	mustExec(t, f.admin, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name, category_primary)
		select $1, a.id, x.id, x.amt, 'USD', x.d::date, 'Fake', x.cat
		from accounts a, (values
		  ('d-food',     500,    '2026-10-03', 'FOOD_AND_DRINK'),
		  ('d-pay',     -300000, '2026-10-01', 'INCOME'),
		  ('d-save',     20000,  '2026-10-02', 'TRANSFER_OUT'),
		  ('d-loan',     15000,  '2026-10-04', 'LOAN_PAYMENTS'),
		  ('d-refund',  -800,    '2026-10-05', 'FOOD_AND_DRINK'),
		  ('d-sept',     900,    '2026-09-30', 'FOOD_AND_DRINK')
		) as x(id, amt, d, cat)
		where a.plaid_account_id = 'acct-d'`, f.testHH)
	return f
}

func spent(t *testing.T, f *fixture, user, budgetID string) (int64, bool) {
	t.Helper()
	list, _, err := f.db.Budgets(context.Background(), user, f.testHH, october)
	if err != nil {
		t.Fatalf("Budgets as %s: %v", user, err)
	}
	for _, b := range list {
		if b.ID == budgetID {
			return b.SpentMinor, true
		}
	}
	return 0, false
}

func TestBudgetRules(t *testing.T) {
	f := budgetFamily(t)
	ctx := context.Background()
	food := NewBudget{Category: "FOOD_AND_DRINK", Period: "month", AmountMinor: 60000}

	for _, c := range []struct {
		who, member string
		ok          bool
		why         string
	}{
		{alice, "", true, "owner, household"},
		{dave, "", true, "adult, household"},
		{mia, "", false, "teen, household"},
		{rosa, "", false, "viewer, household"},
		{rosa, rosa, true, "viewer, their own"},
		{dave, dave, true, "adult, their own"},
		{mia, mia, false, "teen, their own"},
		{alice, carl, true, "owner, on a child"},
		{dave, mia, true, "adult, on a teen"},
		{alice, dave, false, "owner, on another adult"},
		{rosa, carl, false, "viewer, on a child"},
		{bob, "", false, "someone from another household"},
	} {
		b := food
		b.MemberUserID = c.member
		_, err := f.db.CreateBudget(ctx, c.who, f.testHH, b)
		if c.ok && err != nil {
			t.Errorf("%s: err = %v, want allowed", c.why, err)
		}
		if !c.ok && !errors.Is(err, ErrForbidden) {
			t.Errorf("%s: err = %v, want ErrForbidden", c.why, err)
		}
	}

	for name, b := range map[string]NewBudget{
		"zero":         {Period: "month", AmountMinor: 0},
		"bad period":   {Period: "year", AmountMinor: 100},
		"bad category": {Category: "food; drop", Period: "week", AmountMinor: 100},
		"bad member":   {MemberUserID: "not-a-uuid", Period: "week", AmountMinor: 100},
	} {
		if _, err := f.db.CreateBudget(ctx, alice, f.testHH, b); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestBudgetVisibility(t *testing.T) {
	f := budgetFamily(t)
	ctx := context.Background()
	house, err := f.db.CreateBudget(ctx, alice, f.testHH, NewBudget{Period: "month", AmountMinor: 100000})
	if err != nil {
		t.Fatal(err)
	}
	carls, err := f.db.CreateBudget(ctx, alice, f.testHH, NewBudget{MemberUserID: carl, Period: "week", AmountMinor: 5000})
	if err != nil {
		t.Fatal(err)
	}
	rosas, err := f.db.CreateBudget(ctx, rosa, f.testHH, NewBudget{MemberUserID: rosa, Period: "month", AmountMinor: 9000})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		who                string
		house, carl, rosas bool
	}{
		{alice, true, true, false},
		{dave, true, true, false}, // parents see their kids' budgets
		{carl, true, true, false},
		{mia, true, false, false}, // teens don't see a sibling's
		{rosa, true, false, true}, // viewers see their own, not the kids'
	} {
		_, h := spent(t, f, c.who, house)
		_, k := spent(t, f, c.who, carls)
		_, r := spent(t, f, c.who, rosas)
		if h != c.house || k != c.carl || r != c.rosas {
			t.Errorf("%s sees household %v (want %v), carl's %v (want %v), rosa's %v (want %v)", c.who, h, c.house, k, c.carl, r, c.rosas)
		}
	}
	if list, _, _ := f.db.Budgets(ctx, bob, f.testHH, october); len(list) != 0 {
		t.Errorf("bob sees %d budgets", len(list))
	}
	// Totals for a budget you can't see come back empty, even asked directly.
	if n := f.count(t, rosa, `select count(*) from budget_spending($1, '2026-10-01', '2026-11-01')`, carls); n != 0 {
		t.Errorf("rosa got %d days of carl's spending", n)
	}
}

func TestBudgetCounting(t *testing.T) {
	f := budgetFamily(t)
	ctx := context.Background()
	food, err := f.db.CreateBudget(ctx, alice, f.testHH, NewBudget{Category: "FOOD_AND_DRINK", Period: "month", AmountMinor: 60000})
	if err != nil {
		t.Fatal(err)
	}
	all, err := f.db.CreateBudget(ctx, alice, f.testHH, NewBudget{Period: "month", AmountMinor: 60000})
	if err != nil {
		t.Fatal(err)
	}
	carls, err := f.db.CreateBudget(ctx, alice, f.testHH, NewBudget{MemberUserID: carl, Period: "month", AmountMinor: 5000})
	if err != nil {
		t.Fatal(err)
	}

	// Nobody opted in: only carl (a child) counts, automatically.
	if s, _ := spent(t, f, alice, food); s != 1234 {
		t.Fatalf("household food = %d, want carl's 1234", s)
	}
	// Alice and dave opt in. Dave's income, savings, loan payment, refund and
	// September spending never count.
	if err := f.db.SetCountInBudgets(ctx, alice, f.testHH, true); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetCountInBudgets(ctx, dave, f.testHH, true); err != nil {
		t.Fatal(err)
	}
	if s, _ := spent(t, f, mia, food); s != 1234+1234+500 {
		t.Errorf("household food = %d, want %d (carl, alice, dave)", s, 1234+1234+500)
	}
	if s, _ := spent(t, f, alice, all); s != 1234+1234+500 {
		t.Errorf("household everything = %d, want %d: transfers, loans, income and refunds don't count", s, 1234+1234+500)
	}
	// A person's budget counts only that person.
	if s, _ := spent(t, f, dave, carls); s != 1234 {
		t.Errorf("carl's budget = %d, want 1234", s)
	}
	// The counting list.
	_, counting, err := f.db.Budgets(ctx, rosa, f.testHH, october)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]BudgetCounter{}
	for _, c := range counting {
		got[c.UserID] = c
	}
	if !got[alice].Counted || got[alice].Automatic || !got[carl].Automatic || !got[mia].Counted || got[rosa].Counted {
		t.Errorf("counting = %+v", counting)
	}
	// Dave changes his mind; his spending stops counting.
	if err := f.db.SetCountInBudgets(ctx, dave, f.testHH, false); err != nil {
		t.Fatal(err)
	}
	if s, _ := spent(t, f, alice, food); s != 1234+1234 {
		t.Errorf("after dave opts out = %d, want 2468", s)
	}
	if err := f.db.SetCountInBudgets(ctx, bob, f.testHH, true); !errors.Is(err, ErrForbidden) {
		t.Errorf("bob opting in to another household: %v, want ErrForbidden", err)
	}
}

func TestOnlyYouChooseToCount(t *testing.T) {
	f := budgetFamily(t)
	// An owner can't switch it on for someone else, by update or when adding them.
	if n, err := f.execAs(alice, `update household_members set count_in_budgets = true where user_id = $1`, dave); err == nil && n > 0 {
		t.Errorf("alice switched dave's choice on (%d rows)", n)
	}
	mustExec(t, f.admin, `insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000ee', 'eve@example.test')`)
	if n, err := f.execAs(alice, `insert into household_members (household_id, user_id, role, count_in_budgets) values ($1, '00000000-0000-4000-8000-0000000000ee', 'adult', true)`, f.testHH); err == nil && n > 0 {
		t.Errorf("alice added eve already counting (%d rows)", n)
	}
	// Adding someone the usual way still works.
	if n, err := f.execAs(alice, `insert into household_members (household_id, user_id, role) values ($1, '00000000-0000-4000-8000-0000000000ee', 'adult')`, f.testHH); err != nil || n != 1 {
		t.Errorf("adding eve: %d rows, %v", n, err)
	}
}

func TestChangingBudgets(t *testing.T) {
	f := budgetFamily(t)
	ctx := context.Background()
	id, err := f.db.CreateBudget(ctx, dave, f.testHH, NewBudget{Period: "month", AmountMinor: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.db.UpdateBudget(ctx, alice, id, NewBudget{Category: "TRANSPORTATION", Period: "week", AmountMinor: 2000}); err != nil {
		t.Fatal(err)
	}
	list, _, _ := f.db.Budgets(ctx, mia, f.testHH, october)
	if len(list) != 1 || list[0].Period != "week" || list[0].AmountMinor != 2000 || *list[0].Category != "TRANSPORTATION" || list[0].CanManage {
		t.Fatalf("after update, as mia: %+v", list)
	}
	for _, who := range []string{mia, rosa, bob} {
		if err := f.db.UpdateBudget(ctx, who, id, NewBudget{Period: "week", AmountMinor: 1}); !errors.Is(err, ErrNotFound) {
			t.Errorf("%s updates: %v, want ErrNotFound", who, err)
		}
		if err := f.db.DeleteBudget(ctx, who, id); !errors.Is(err, ErrNotFound) {
			t.Errorf("%s deletes: %v, want ErrNotFound", who, err)
		}
	}
	if err := f.db.DeleteBudget(ctx, dave, id); err != nil {
		t.Fatal(err)
	}
	// A person's budget goes when they leave.
	kid, _ := f.db.CreateBudget(ctx, alice, f.testHH, NewBudget{MemberUserID: mia, Period: "week", AmountMinor: 5000})
	mustExec(t, f.admin, `delete from household_members where user_id = $1`, mia)
	if n := f.count(t, alice, `select count(*) from budgets where id = $1`, kid); n != 0 {
		t.Errorf("mia's budget stayed after she left")
	}
}

func TestPeriodBounds(t *testing.T) {
	for _, c := range []struct {
		period, today, from, to string
	}{
		{"month", "2026-10-15", "2026-10-01", "2026-11-01"},
		{"month", "2026-12-31", "2026-12-01", "2027-01-01"},
		{"week", "2026-10-21", "2026-10-18", "2026-10-25"}, // Wednesday: Sunday to Sunday
		{"week", "2026-10-18", "2026-10-18", "2026-10-25"}, // Sunday starts a week
		{"week", "2026-12-30", "2026-12-27", "2027-01-03"},
	} {
		today, _ := time.Parse("2006-01-02", c.today)
		from, to := PeriodBounds(c.period, today)
		if from.Format("2006-01-02") != c.from || to.Format("2006-01-02") != c.to {
			t.Errorf("%s %s: %s to %s, want %s to %s", c.period, c.today, from.Format("2006-01-02"), to.Format("2006-01-02"), c.from, c.to)
		}
	}
}
