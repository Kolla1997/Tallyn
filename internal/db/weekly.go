package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// The weekly summary email (#273, 0024_weekly_summary.sql), read with the
// bank sync's login like the other email work.

// WeeklyDue is a person due their weekly summary for the week from WeekStart.
type WeeklyDue struct {
	UserID, HouseholdID, Household, Email string
	WeekStart                             time.Time
}

// WeeklyDue lists who is due a weekly summary at now: Monday from 9am in
// their time zone, for the week before, not yet looked at.
func (s *System) WeeklyDue(ctx context.Context, now time.Time) ([]WeeklyDue, error) {
	var out []WeeklyDue
	err := s.as(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select user_id::text, household_id::text, household, email, week_start from public.weekly_due($1)`, now)
		if err != nil {
			return err
		}
		out, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (WeeklyDue, error) {
			var w WeeklyDue
			err := r.Scan(&w.UserID, &w.HouseholdID, &w.Household, &w.Email, &w.WeekStart)
			return w, err
		})
		return err
	})
	return out, err
}

// WeeklySummary returns what the email shows (see weekly_summary in 0024).
func (s *System) WeeklySummary(ctx context.Context, householdID, userID string, weekStart time.Time) (json.RawMessage, error) {
	var out json.RawMessage
	err := s.as(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.weekly_summary($1, $2, $3::date)
			|| jsonb_build_object('bills', public.email_bills($1, $2, $3::date, $3::date + 6, $3::date + 7, $3::date + 14))`, householdID, userID, weekStart).Scan(&out)
	})
	return out, err
}

// MarkWeekly records that the week was looked at: sent, or skipped as quiet.
func (s *System) MarkWeekly(ctx context.Context, householdID, userID string, weekStart time.Time, sent bool) error {
	return s.as(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.mark_weekly($1, $2, $3::date, $4)`, householdID, userID, weekStart, sent)
		return err
	})
}

// The monthly highlights (#274, 0025_monthly_highlights.sql) work the same
// way, for the month starting MonthStart (WeekStart's place).

// MonthlyDue lists who is due monthly highlights at now: the 1st from 9am in
// their time zone, for the month before, not yet looked at.
func (s *System) MonthlyDue(ctx context.Context, now time.Time) ([]WeeklyDue, error) {
	var out []WeeklyDue
	err := s.as(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select user_id::text, household_id::text, household, email, month_start from public.monthly_due($1)`, now)
		if err != nil {
			return err
		}
		out, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (WeeklyDue, error) {
			var w WeeklyDue
			err := r.Scan(&w.UserID, &w.HouseholdID, &w.Household, &w.Email, &w.WeekStart)
			return w, err
		})
		return err
	})
	return out, err
}

// MonthlySummary returns what the email shows (see monthly_summary in 0025).
func (s *System) MonthlySummary(ctx context.Context, householdID, userID string, monthStart time.Time) (json.RawMessage, error) {
	var out json.RawMessage
	err := s.as(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.monthly_summary($1, $2, $3::date)
			|| jsonb_build_object('bills', public.email_bills($1, $2, $3::date, ($3::date + interval '1 month')::date - 1, null, null))`, householdID, userID, monthStart).Scan(&out)
	})
	return out, err
}

// MarkMonthly records that the month was looked at: sent, or skipped as quiet.
func (s *System) MarkMonthly(ctx context.Context, householdID, userID string, monthStart time.Time, sent bool) error {
	return s.as(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.mark_monthly($1, $2, $3::date, $4)`, householdID, userID, monthStart, sent)
		return err
	})
}
