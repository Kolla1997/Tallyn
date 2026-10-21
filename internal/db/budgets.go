package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Budgets (#13, 0015_budgets.sql, ADR 0014): an amount for a week or a
// month, for every category or one, covering the household or one person.
// Progress comes from budget_spending(): daily totals only, never
// transactions, and only spending (no income, transfers or loan payments).

// Budget is one budget with its progress for the current period.
type Budget struct {
	ID           string     `json:"id"`
	MemberUserID *string    `json:"member_user_id"` // nil: the household
	Category     *string    `json:"category"`       // nil: every category
	Period       string     `json:"period"`         // week, month
	AmountMinor  int64      `json:"amount_minor"`
	Currency     string     `json:"currency"`
	From         string     `json:"from"` // first day of this period
	To           string     `json:"to"`   // first day after it
	SpentMinor   int64      `json:"spent_minor"`
	Days         []DayTotal `json:"days"` // spending per day so far, for the pace line
	CanManage    bool       `json:"can_manage"`
}

// DayTotal is one day's spending for a budget.
type DayTotal struct {
	Date        string `json:"date"`
	AmountMinor int64  `json:"amount_minor"`
}

// BudgetCounter says whether a member's spending counts in household budgets,
// and whether that's automatic (teens and children).
type BudgetCounter struct {
	UserID    string `json:"user_id"`
	Counted   bool   `json:"counted"`
	Automatic bool   `json:"automatic"`
}

// NewBudget is what someone sets. MemberUserID and Category may be empty
// (the household; every category).
type NewBudget struct {
	MemberUserID string `json:"member_user_id"`
	Category     string `json:"category"`
	Period       string `json:"period"`
	AmountMinor  int64  `json:"amount_minor"`
}

func (b NewBudget) valid() bool {
	return (b.MemberUserID == "" || uuidRE.MatchString(b.MemberUserID)) &&
		(b.Category == "" || categoryRE.MatchString(b.Category)) &&
		(b.Period == "week" || b.Period == "month") &&
		b.AmountMinor > 0 && b.AmountMinor <= 100_000_000_000
}

// PeriodBounds returns the first day of the period containing today and the
// first day after it. Weeks start on Sunday, like the spending dots (#75).
func PeriodBounds(period string, today time.Time) (from, to time.Time) {
	d := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	if period == "week" {
		from = d.AddDate(0, 0, -int(d.Weekday()))
		return from, from.AddDate(0, 0, 7)
	}
	from = time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, time.UTC)
	return from, from.AddDate(0, 1, 0)
}

const day = "2006-01-02"

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// Budgets lists the budgets userID may see in the household, with progress
// for the period containing today, and who counts in household budgets.
func (d *DB) Budgets(ctx context.Context, userID, householdID string, today time.Time) ([]Budget, []BudgetCounter, error) {
	list, counting := []Budget{}, []BudgetCounter{}
	if !uuidRE.MatchString(householdID) {
		return list, counting, ErrInvalid
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select id, member_user_id, category, period, amount_minor, currency,
			       public.can_manage_budget(household_id, member_user_id)
			from public.budgets where household_id = $1
			order by member_user_id nulls first, category nulls first, created_at`, householdID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var b Budget
			if err := rows.Scan(&b.ID, &b.MemberUserID, &b.Category, &b.Period, &b.AmountMinor, &b.Currency, &b.CanManage); err != nil {
				return err
			}
			list = append(list, b)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		for i := range list {
			b := &list[i]
			from, to := PeriodBounds(b.Period, today)
			b.From, b.To, b.Days = from.Format(day), to.Format(day), []DayTotal{}
			rows, err := tx.Query(ctx, `select day, amount_minor from public.budget_spending($1, $2, $3)`, b.ID, from, to)
			if err != nil {
				return err
			}
			for rows.Next() {
				var dt time.Time
				var amt int64
				if err := rows.Scan(&dt, &amt); err != nil {
					return err
				}
				b.Days = append(b.Days, DayTotal{Date: dt.Format(day), AmountMinor: amt})
				b.SpentMinor += amt
			}
			if err := rows.Err(); err != nil {
				return err
			}
		}
		rows, err = tx.Query(ctx, `select user_id, counted, automatic from public.budget_counting($1)`, householdID)
		if err != nil {
			return err
		}
		counting, err = pgx.CollectRows(rows, pgx.RowToStructByPos[BudgetCounter])
		return err
	})
	return list, counting, mapErr(err)
}

// CreateBudget adds a budget in the household's home currency and returns
// its ID. ErrForbidden if userID may not set it.
func (d *DB) CreateBudget(ctx context.Context, userID, householdID string, b NewBudget) (string, error) {
	if !uuidRE.MatchString(householdID) || !b.valid() {
		return "", ErrInvalid
	}
	var id string
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var cur string
		if err := tx.QueryRow(ctx, `select home_currency from public.households where id = $1`, householdID).Scan(&cur); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrForbidden // not a member: RLS hides the household
			}
			return err
		}
		return tx.QueryRow(ctx, `
			insert into public.budgets (household_id, member_user_id, category, period, amount_minor, currency)
			values ($1, $2, $3, $4, $5, $6) returning id`,
			householdID, nullable(b.MemberUserID), nullable(b.Category), b.Period, b.AmountMinor, cur).Scan(&id)
	})
	return id, mapErr(err)
}

// UpdateBudget changes a budget's category, period and amount (not whom it
// covers). ErrNotFound if userID can't see or change it.
func (d *DB) UpdateBudget(ctx context.Context, userID, budgetID string, b NewBudget) error {
	if !uuidRE.MatchString(budgetID) || !b.valid() {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update public.budgets set category = $2, period = $3, amount_minor = $4, updated_at = now()
			where id = $1`, budgetID, nullable(b.Category), b.Period, b.AmountMinor)
		if err == nil && tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return err
	}))
}

// DeleteBudget removes a budget. ErrNotFound if userID can't see or change it.
func (d *DB) DeleteBudget(ctx context.Context, userID, budgetID string) error {
	if !uuidRE.MatchString(budgetID) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from public.budgets where id = $1`, budgetID)
		if err == nil && tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return err
	}))
}

// SetCountInBudgets turns on or off whether userID's spending counts in the
// household's budgets (totals only). Only for yourself.
func (d *DB) SetCountInBudgets(ctx context.Context, userID, householdID string, on bool) error {
	if !uuidRE.MatchString(householdID) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.set_count_in_budgets($1, $2)`, householdID, on)
		return err
	}))
}
