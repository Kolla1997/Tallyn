package db

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Plan from your income (#133, 0017_income_plans.sql): a monthly income split
// into buckets by a template, for the household or one person, with each
// bucket's money this month. Same rules as budgets (ADR 0014).

// Plan is one plan with its progress this month. Progress is per base bucket
// (essentials, guilt_free, debt, short_term, long_term); the page combines
// them for 50/30/20.
type Plan struct {
	ID                 string           `json:"id"`
	MemberUserID       *string          `json:"member_user_id"` // nil: the household
	MonthlyIncomeMinor int64            `json:"monthly_income_minor"`
	Currency           string           `json:"currency"`
	Template           string           `json:"template"`
	Shares             map[string]int   `json:"shares"`
	From               string           `json:"from"` // first day of this month
	To                 string           `json:"to"`   // first day of next month
	Progress           map[string]int64 `json:"progress"`
	CanManage          bool             `json:"can_manage"`
}

// NewPlan is what someone sets. MemberUserID empty means the household.
type NewPlan struct {
	MemberUserID       string         `json:"member_user_id"`
	MonthlyIncomeMinor int64          `json:"monthly_income_minor"`
	Template           string         `json:"template"`
	Shares             map[string]int `json:"shares"`
}

// The two named templates have fixed shares; changing one makes it "own".
var planTemplates = map[string]map[string]int{
	"55-5-10-15-15": {"essentials": 55, "guilt_free": 5, "debt": 10, "short_term": 15, "long_term": 15},
	"50-30-20":      {"needs": 50, "wants": 30, "save": 20},
}

var planBuckets = []string{"essentials", "guilt_free", "debt", "short_term", "long_term"}

func (p NewPlan) valid() bool {
	if (p.MemberUserID != "" && !uuidRE.MatchString(p.MemberUserID)) || p.MonthlyIncomeMinor <= 0 || p.MonthlyIncomeMinor > 100_000_000_000 {
		return false
	}
	if fixed, ok := planTemplates[p.Template]; ok {
		if len(p.Shares) != len(fixed) {
			return false
		}
		for k, v := range fixed {
			if p.Shares[k] != v {
				return false
			}
		}
		return true
	}
	if p.Template != "own" || len(p.Shares) != len(planBuckets) {
		return false
	}
	sum := 0
	for _, k := range planBuckets {
		v, ok := p.Shares[k]
		if !ok || v < 0 || v > 100 {
			return false
		}
		sum += v
	}
	return sum == 100
}

// Plans lists the plans userID may see in the household, with progress for
// the month containing today.
func (d *DB) Plans(ctx context.Context, userID, householdID string, today time.Time) ([]Plan, error) {
	list := []Plan{}
	if !uuidRE.MatchString(householdID) {
		return list, ErrInvalid
	}
	from, to := PeriodBounds("month", today)
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select id, member_user_id, monthly_income_minor, currency, template, shares,
			       public.can_manage_budget(household_id, member_user_id)
			from public.income_plans where household_id = $1
			order by member_user_id nulls first, created_at`, householdID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var p Plan
			var shares []byte
			if err := rows.Scan(&p.ID, &p.MemberUserID, &p.MonthlyIncomeMinor, &p.Currency, &p.Template, &shares, &p.CanManage); err != nil {
				return err
			}
			if err := json.Unmarshal(shares, &p.Shares); err != nil {
				return err
			}
			p.From, p.To = from.Format(day), to.Format(day)
			list = append(list, p)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		for i := range list {
			p := &list[i]
			p.Progress = map[string]int64{}
			for _, k := range planBuckets {
				p.Progress[k] = 0
			}
			rows, err := tx.Query(ctx, `select bucket, amount_minor from public.plan_progress($1, $2, $3)`, p.ID, from, to)
			if err != nil {
				return err
			}
			for rows.Next() {
				var k string
				var amt int64
				if err := rows.Scan(&k, &amt); err != nil {
					return err
				}
				p.Progress[k] = amt
			}
			if err := rows.Err(); err != nil {
				return err
			}
		}
		return nil
	})
	return list, mapErr(err)
}

// PlanSuggestion is a suggested monthly income for a plan for memberUserID
// ("" for the household): the average of the last 3 full months of pay.
// 0 when there's nothing to go on, or userID may not see such a plan.
func (d *DB) PlanSuggestion(ctx context.Context, userID, householdID, memberUserID string, today time.Time) (int64, error) {
	if !uuidRE.MatchString(householdID) || (memberUserID != "" && !uuidRE.MatchString(memberUserID)) {
		return 0, ErrInvalid
	}
	var n int64
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.plan_income_suggestion($1, $2, $3)`,
			householdID, nullable(memberUserID), time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)).Scan(&n)
	})
	return n, mapErr(err)
}

// SavePlan sets the household's plan or a person's plan, replacing the one
// there was, in the household's home currency, and returns its ID.
// ErrForbidden if userID may not set it, ErrInvalid for bad shares.
func (d *DB) SavePlan(ctx context.Context, userID, householdID string, p NewPlan) (string, error) {
	if !uuidRE.MatchString(householdID) || !p.valid() {
		return "", ErrInvalid
	}
	shares, err := json.Marshal(p.Shares)
	if err != nil {
		return "", err
	}
	var id string
	err = d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var cur string
		if err := tx.QueryRow(ctx, `select home_currency from public.households where id = $1`, householdID).Scan(&cur); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrForbidden
			}
			return err
		}
		return tx.QueryRow(ctx, `
			insert into public.income_plans (household_id, member_user_id, monthly_income_minor, currency, template, shares)
			values ($1, $2, $3, $4, $5, $6)
			on conflict (household_id, member_user_id) do update
			  set monthly_income_minor = excluded.monthly_income_minor, currency = excluded.currency,
			      template = excluded.template, shares = excluded.shares
			returning id`,
			householdID, nullable(p.MemberUserID), p.MonthlyIncomeMinor, cur, p.Template, shares).Scan(&id)
	})
	return id, mapErr(err)
}

// DeletePlan removes a plan. ErrNotFound if userID can't see or change it.
func (d *DB) DeletePlan(ctx context.Context, userID, planID string) error {
	if !uuidRE.MatchString(planID) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from public.income_plans where id = $1`, planID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}))
}
