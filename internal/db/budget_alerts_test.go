package db

import (
	"context"
	"testing"
	"time"
)

// Spending-limit alerts (#55, 0028). Alice owns the Test household (USD),
// Carl is her child. The month is November 2026. All data is fake.
func TestBudgetAlerts(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	alerts := func(user, kind string) int {
		t.Helper()
		var n int
		_ = f.admin.QueryRow(ctx, `select count(*) from notifications where user_id = $1 and kind = $2 and resolved_at is null`, user, kind).Scan(&n)
		return n
	}
	run := func(day string) {
		t.Helper()
		d, _ := time.Parse("2006-01-02", day)
		if _, err := f.sys.NotifyBudgets(ctx, d); err != nil {
			t.Fatal(err)
		}
	}
	var food, carls string
	_ = f.admin.QueryRow(ctx, `insert into budgets (household_id, member_user_id, category, period, amount_minor, currency, created_by)
		values ($1, null, 'FOOD_AND_DRINK', 'month', 50000, 'USD', $2) returning id`, f.testHH, alice).Scan(&food)
	_ = f.admin.QueryRow(ctx, `insert into budgets (household_id, member_user_id, category, period, amount_minor, currency, created_by)
		values ($1, $2, null, 'month', 10000, 'USD', $3) returning id`, f.testHH, carl, alice).Scan(&carls)

	// Adults count in household budgets once they opt in, as on Budgets.
	mustExec(t, f.admin, `update household_members set count_in_budgets = true where household_id = $1 and user_id = $2`, f.testHH, alice)
	f.spend(t, alice, "groceries", "2026-11-03", "FOOD_AND_DRINK", 30000)
	f.spend(t, alice, "salary", "2026-11-03", "INCOME", 900000) // income isn't spending
	run("2026-11-10")
	if alerts(alice, "budget_near") != 0 {
		t.Fatal("a heads-up at 60%")
	}

	f.spend(t, alice, "dinner", "2026-11-12", "FOOD_AND_DRINK", 11000) // 82%
	run("2026-11-12")
	run("2026-11-13")
	if alerts(alice, "budget_near") != 1 || alerts(alice, "budget_over") != 0 {
		t.Fatalf("near %d, over %d: want one heads-up, once", alerts(alice, "budget_near"), alerts(alice, "budget_over"))
	}
	var data struct {
		Limit, Spent, Days int64
	}
	_ = f.admin.QueryRow(ctx, `select (data->>'limit_minor')::bigint, (data->>'spent_minor')::bigint, (data->>'days_left')::int
		from notifications where user_id = $1 and kind = 'budget_near'`, alice).Scan(&data.Limit, &data.Spent, &data.Days)
	if data.Limit != 50000 || data.Spent != 41000 || data.Days != 19 {
		t.Errorf("data = %+v", data)
	}

	f.spend(t, alice, "party", "2026-11-14", "FOOD_AND_DRINK", 12100) // 106%
	run("2026-11-14")
	if alerts(alice, "budget_over") != 1 {
		t.Error("no over alert past the limit")
	}

	t.Run("a child's budget: the child and the parents hear", func(t *testing.T) {
		f.spend(t, carl, "toys", "2026-11-05", "GENERAL_MERCHANDISE", 9000) // 90%
		run("2026-11-15")
		var to []string
		rows, _ := f.admin.Query(ctx, `select user_id::text from notifications where kind = 'budget_near' and ref_id = $1 order by 1`, carls)
		for rows.Next() {
			var u string
			_ = rows.Scan(&u)
			to = append(to, u)
		}
		if len(to) != 2 {
			t.Errorf("heard by %v, want Alice and Carl", to)
		}
	})

	t.Run("switched off", func(t *testing.T) {
		mustExec(t, f.admin, `insert into notification_settings (household_id, user_id, budget) values ($1, $2, false)
			on conflict (household_id, user_id) do update set budget = false`, f.testHH, carl)
		mustExec(t, f.admin, `delete from notifications where user_id = $1`, carl)
		run("2026-11-16")
		if alerts(carl, "budget_near") != 0 {
			t.Error("alerted with the switch off")
		}
	})

	t.Run("a new month starts fresh", func(t *testing.T) {
		run("2026-12-01")
		if alerts(alice, "budget_near")+alerts(alice, "budget_over") != 0 {
			t.Error("last month's alerts still open")
		}
	})

	t.Run("only the sync's login runs it", func(t *testing.T) {
		if _, err := f.execAs(alice, `select public.notify_budgets(current_date)`); err == nil {
			t.Error("the app's login ran notify_budgets")
		}
	})
}
