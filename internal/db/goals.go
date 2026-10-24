package db

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Savings goals (#14, 0018_goals.sql). A goal follows one of its person's
// accounts or is updated by hand. Who sees it is its own setting; progress
// from an account reaches only people who may see that person's balances.

// Goal is one goal as the current user may see it. Saved and History are nil
// when its progress is private to them.
type Goal struct {
	ID          string      `json:"id"`
	OwnerUserID string      `json:"owner_user_id"`
	Name        string      `json:"name"`
	TargetMinor int64       `json:"target_minor"`
	Currency    string      `json:"currency"`
	ByMonth     *string     `json:"by_month"` // YYYY-MM-01, or nil
	AccountID   *string     `json:"account_id"`
	Account     *string     `json:"account"` // "High-yield savings ••4321" when visible
	Visibility  string      `json:"visibility"`
	SharedWith  *string     `json:"shared_with"`
	CanManage   bool        `json:"can_manage"`
	Saved       *int64      `json:"saved_minor"`
	History     []GoalMonth `json:"history"`
}

// GoalMonth is a goal's amount at the end of a month (or now, for this one).
type GoalMonth struct {
	Month      string `json:"month"`
	SavedMinor int64  `json:"saved_minor"`
}

// NewGoal is what someone sets. OwnerUserID empty means yourself. A goal that
// follows an account takes that account's currency; otherwise Currency, or
// the household's when empty.
type NewGoal struct {
	OwnerUserID string `json:"owner_user_id"`
	Name        string `json:"name"`
	TargetMinor int64  `json:"target_minor"`
	Currency    string `json:"currency"`
	ByMonth     string `json:"by_month"` // YYYY-MM, or empty
	AccountID   string `json:"account_id"`
	Visibility  string `json:"visibility"`
	SharedWith  string `json:"shared_with"`
}

var currencyRE = regexp.MustCompile(`^[A-Z]{3}$`)

func (g *NewGoal) clean(userID string) (byMonth *time.Time, ok bool) {
	g.Name = strings.TrimSpace(g.Name)
	if g.OwnerUserID == "" {
		g.OwnerUserID = userID
	}
	if g.Name == "" || utf8.RuneCountInString(g.Name) > 80 || g.TargetMinor <= 0 || g.TargetMinor > 100_000_000_000 ||
		!uuidRE.MatchString(g.OwnerUserID) || (g.Currency != "" && !currencyRE.MatchString(g.Currency)) ||
		(g.AccountID != "" && !uuidRE.MatchString(g.AccountID)) {
		return nil, false
	}
	switch g.Visibility {
	case "me", "everyone":
		if g.SharedWith != "" {
			return nil, false
		}
	case "member":
		if !uuidRE.MatchString(g.SharedWith) || g.SharedWith == g.OwnerUserID {
			return nil, false
		}
	default:
		return nil, false
	}
	if g.ByMonth != "" {
		t, err := time.Parse("2006-01", g.ByMonth)
		if err != nil {
			return nil, false
		}
		return &t, true
	}
	return nil, true
}

// Goals lists the goals userID may see in the household, with progress
// where they may see it.
func (d *DB) Goals(ctx context.Context, userID, householdID string) ([]Goal, error) {
	list := []Goal{}
	if !uuidRE.MatchString(householdID) {
		return list, ErrInvalid
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select g.id, g.owner_user_id, g.name, g.target_minor, g.currency, to_char(g.by_month, 'YYYY-MM-DD'),
			       g.account_id, case when a.id is null then null else a.name || coalesce(' ••' || a.mask, '') end,
			       g.visibility, g.shared_with, public.can_manage_goal(g.household_id, g.owner_user_id)
			from public.goals g
			left join public.accounts a on a.id = g.account_id
			where g.household_id = $1
			order by g.by_month nulls last, g.created_at`, householdID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var g Goal
			if err := rows.Scan(&g.ID, &g.OwnerUserID, &g.Name, &g.TargetMinor, &g.Currency, &g.ByMonth,
				&g.AccountID, &g.Account, &g.Visibility, &g.SharedWith, &g.CanManage); err != nil {
				return err
			}
			list = append(list, g)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		for i := range list {
			g := &list[i]
			var saved int64
			var history []byte
			err := tx.QueryRow(ctx, `select saved_minor, history from public.goal_progress($1)`, g.ID).Scan(&saved, &history)
			if errors.Is(err, pgx.ErrNoRows) {
				continue // private to this viewer
			}
			if err != nil {
				return err
			}
			g.Saved = &saved
			if err := json.Unmarshal(history, &g.History); err != nil {
				return err
			}
		}
		return nil
	})
	return list, mapErr(err)
}

// CreateGoal adds a goal and returns its ID. ErrForbidden if userID may not
// set up a goal for that person, or the account isn't that person's.
func (d *DB) CreateGoal(ctx context.Context, userID, householdID string, g NewGoal) (string, error) {
	by, ok := g.clean(userID)
	if !uuidRE.MatchString(householdID) || !ok {
		return "", ErrInvalid
	}
	var id string
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		cur, err := goalCurrency(ctx, tx, householdID, g)
		if err != nil {
			return err
		}
		return tx.QueryRow(ctx, `
			insert into public.goals (household_id, owner_user_id, name, target_minor, currency, by_month, account_id, visibility, shared_with)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
			householdID, g.OwnerUserID, g.Name, g.TargetMinor, cur, by, nullable(g.AccountID), g.Visibility, nullable(g.SharedWith)).Scan(&id)
	})
	return id, mapErr(err)
}

// UpdateGoal changes a goal (not whose it is). ErrNotFound if userID can't
// see or change it.
func (d *DB) UpdateGoal(ctx context.Context, userID, goalID string, g NewGoal) error {
	if !uuidRE.MatchString(goalID) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var hh string
		if err := tx.QueryRow(ctx, `select household_id, owner_user_id from public.goals where id = $1`, goalID).Scan(&hh, &g.OwnerUserID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		by, ok := g.clean(userID)
		if !ok {
			return ErrInvalid
		}
		cur, err := goalCurrency(ctx, tx, hh, g)
		if err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `
			update public.goals set name = $2, target_minor = $3, currency = $4, by_month = $5, account_id = $6, visibility = $7, shared_with = $8
			where id = $1`, goalID, g.Name, g.TargetMinor, cur, by, nullable(g.AccountID), g.Visibility, nullable(g.SharedWith))
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrForbidden
		}
		return nil
	}))
}

// goalCurrency is the account's currency for a goal that follows one, else
// the one given, else the household's.
func goalCurrency(ctx context.Context, tx pgx.Tx, householdID string, g NewGoal) (string, error) {
	var cur string
	var err error
	switch {
	case g.AccountID != "":
		err = tx.QueryRow(ctx, `select currency from public.accounts where id = $1 and household_id = $2 and owner_user_id = $3`,
			g.AccountID, householdID, g.OwnerUserID).Scan(&cur)
	case g.Currency != "":
		return g.Currency, nil
	default:
		err = tx.QueryRow(ctx, `select home_currency from public.households where id = $1`, householdID).Scan(&cur)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrForbidden // not your household, or not that person's account
	}
	return cur, err
}

// SetGoalSaved updates a hand-kept goal's amount, and this month's history.
func (d *DB) SetGoalSaved(ctx context.Context, userID, goalID string, savedMinor int64, today time.Time) error {
	if !uuidRE.MatchString(goalID) || savedMinor < 0 || savedMinor > 100_000_000_000 {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.set_goal_saved($1, $2, $3)`, goalID, savedMinor, today)
		return err
	}))
}

// DeleteGoal removes a goal. ErrNotFound if userID can't see or change it.
func (d *DB) DeleteGoal(ctx context.Context, userID, goalID string) error {
	if !uuidRE.MatchString(goalID) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from public.goals where id = $1`, goalID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}))
}

// SnapshotGoals writes this month's amount for every goal that follows an
// account. The bank sync's login runs it daily.
func (s *System) SnapshotGoals(ctx context.Context, today time.Time) (int, error) {
	var n int
	err := s.as(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.snapshot_goals($1)`, today).Scan(&n)
	})
	return n, err
}
