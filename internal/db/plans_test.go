package db

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

// Plan from your income (#133). Alice is an owner who hasn't opted in to
// counting, Carl is her child (counted automatically), Bob is in another
// household. All data is fake.

var planToday = time.Date(2026, 10, 24, 0, 0, 0, 0, time.UTC)

var plan55 = NewPlan{MonthlyIncomeMinor: 640000, Template: "55-5-10-15-15",
	Shares: map[string]int{"essentials": 55, "guilt_free": 5, "debt": 10, "short_term": 15, "long_term": 15}}

func (f *fixture) seedPlanMoney(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	acct := func(user string) string {
		var id string
		if err := f.admin.QueryRow(ctx, `select id from accounts where owner_user_id = $1`, user).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	a, c := acct(alice), acct(carl)
	n := 0
	add := func(account string, minor int64, date, primary, detailed string) {
		n++
		mustExec(t, f.admin, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name, category_primary, category_detailed)
			values ($1, $2, $3, $4, 'USD', $5, 'Fake', $6, $7)`, f.testHH, account, fmt.Sprintf("plan-%d", n), minor, date, primary, detailed)
	}
	// October, Alice
	add(a, 10000, "2026-10-03", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES")
	add(a, 3000, "2026-10-04", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT")
	add(a, -500, "2026-10-05", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT")         // a refund: not counted
	add(a, 50000, "2026-10-06", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") // never counts
	add(a, 150000, "2026-10-01", "LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT")   // essentials
	add(a, 20000, "2026-10-07", "LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT")
	add(a, 40000, "2026-10-08", "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS")
	add(a, 25000, "2026-10-09", "TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS")
	add(a, 9999, "2026-09-30", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES") // last month
	// October, Carl
	add(c, 1000, "2026-10-10", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD")
	// Alice's pay in July to September, plus a tax refund that doesn't count
	for _, d := range []string{"2026-07-15", "2026-08-15", "2026-09-15"} {
		add(a, -500000, d, "INCOME", "INCOME_WAGES")
	}
	add(a, -100000, "2026-08-20", "INCOME", "INCOME_TAX_REFUND")
	add(a, -700000, "2026-10-15", "INCOME", "INCOME_WAGES") // this month: not in the average
}

func TestPlanBuckets(t *testing.T) {
	f := setup(t)
	f.seedPlanMoney(t)
	ctx := context.Background()

	if _, err := f.db.SavePlan(ctx, alice, f.testHH, plan55); err != nil {
		t.Fatalf("household plan: %v", err)
	}
	mine := plan55
	mine.MemberUserID = alice
	if _, err := f.db.SavePlan(ctx, alice, f.testHH, mine); err != nil {
		t.Fatalf("alice's plan: %v", err)
	}
	plans, err := f.db.Plans(ctx, alice, f.testHH, planToday)
	if err != nil || len(plans) != 2 {
		t.Fatalf("plans = %d, %v", len(plans), err)
	}
	household, hers := plans[0], plans[1]
	if household.MemberUserID != nil || household.Currency != "USD" || household.From != "2026-10-01" || !household.CanManage {
		t.Errorf("household plan = %+v", household)
	}
	// Alice hasn't opted in, so the household plan counts only Carl.
	if g := household.Progress; g["guilt_free"] != 1000 || g["essentials"] != 0 || g["debt"] != 0 {
		t.Errorf("household progress before opting in = %v", g)
	}
	want := map[string]int64{"essentials": 160000, "guilt_free": 3000, "debt": 20000, "short_term": 40000, "long_term": 25000}
	for k, v := range want {
		if hers.Progress[k] != v {
			t.Errorf("alice's %s = %d, want %d", k, hers.Progress[k], v)
		}
	}

	if _, err := f.execAs(alice, `select public.set_count_in_budgets($1, true)`, f.testHH); err != nil {
		t.Fatal(err)
	}
	plans, _ = f.db.Plans(ctx, alice, f.testHH, planToday)
	if g := plans[0].Progress; g["guilt_free"] != 4000 || g["essentials"] != 160000 || g["short_term"] != 40000 {
		t.Errorf("household progress after opting in = %v", g)
	}
}

func TestPlanRules(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	// Carl (a child) can't set the household plan or his own; Alice can set his.
	if _, err := f.db.SavePlan(ctx, carl, f.testHH, plan55); !errors.Is(err, ErrForbidden) {
		t.Errorf("carl sets the household plan: %v, want ErrForbidden", err)
	}
	his := plan55
	his.MemberUserID = carl
	if _, err := f.db.SavePlan(ctx, carl, f.testHH, his); !errors.Is(err, ErrForbidden) {
		t.Errorf("carl sets his own plan: %v, want ErrForbidden", err)
	}
	if _, err := f.db.SavePlan(ctx, alice, f.testHH, his); err != nil {
		t.Errorf("alice sets carl's plan: %v", err)
	}
	// Saving again replaces it: still one plan for Carl.
	again := his
	again.MonthlyIncomeMinor = 5000
	if _, err := f.db.SavePlan(ctx, alice, f.testHH, again); err != nil {
		t.Fatal(err)
	}
	if n := f.count(t, alice, `select count(*) from income_plans where member_user_id = $1`, carl); n != 1 {
		t.Errorf("carl's plans = %d, want 1", n)
	}
	// Carl sees his plan; Bob sees nothing of the Test household.
	if plans, _ := f.db.Plans(ctx, carl, f.testHH, planToday); len(plans) != 1 {
		t.Errorf("carl sees %d plans, want 1", len(plans))
	}
	if plans, _ := f.db.Plans(ctx, bob, f.testHH, planToday); len(plans) != 0 {
		t.Errorf("bob sees %d plans", len(plans))
	}

	// Shares: named templates are fixed; your own must add up to 100.
	bad := []NewPlan{
		{MonthlyIncomeMinor: 100, Template: "55-5-10-15-15", Shares: map[string]int{"essentials": 50, "guilt_free": 10, "debt": 10, "short_term": 15, "long_term": 15}},
		{MonthlyIncomeMinor: 100, Template: "own", Shares: map[string]int{"essentials": 50, "guilt_free": 10, "debt": 10, "short_term": 15, "long_term": 14}},
		{MonthlyIncomeMinor: 100, Template: "50-30-20", Shares: map[string]int{"essentials": 50, "guilt_free": 30, "debt": 20}},
		{MonthlyIncomeMinor: 0, Template: "50-30-20", Shares: map[string]int{"needs": 50, "wants": 30, "save": 20}},
	}
	for i, p := range bad {
		if _, err := f.db.SavePlan(ctx, alice, f.testHH, p); !errors.Is(err, ErrInvalid) {
			t.Errorf("bad plan %d: %v, want ErrInvalid", i, err)
		}
	}
	// The database refuses bad shares too, whatever the API sends.
	if _, err := f.execAs(alice, `insert into income_plans (household_id, monthly_income_minor, currency, template, shares)
		values ($1, 100, 'USD', 'own', '{"essentials": 99}')`, f.testHH); err == nil {
		t.Error("the database took shares that don't add up")
	}
}

func TestPlanIncomeSuggestion(t *testing.T) {
	f := setup(t)
	f.seedPlanMoney(t)
	ctx := context.Background()
	// Alice's own: wages in July to September, no tax refund, not October.
	if n, err := f.db.PlanSuggestion(ctx, alice, f.testHH, alice, planToday); err != nil || n != 500000 {
		t.Errorf("alice's suggestion = %d, %v; want 500000", n, err)
	}
	// The household's counts only people who opted in (and kids): nothing yet.
	if n, _ := f.db.PlanSuggestion(ctx, alice, f.testHH, "", planToday); n != 0 {
		t.Errorf("household suggestion before opting in = %d, want 0", n)
	}
	// Bob can't learn anything about the Test household.
	if n, _ := f.db.PlanSuggestion(ctx, bob, f.testHH, alice, planToday); n != 0 {
		t.Errorf("bob's view of alice's suggestion = %d, want 0", n)
	}
}
