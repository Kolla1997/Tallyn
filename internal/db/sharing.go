package db

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Sharing categories (0007_sharing.sql). Debts join with #27.
const (
	ShareBalances     = "balances"
	ShareTransactions = "transactions"
	ShareWhereabouts  = "whereabouts" // time and location; only with transactions
)

var shareCategories = map[string]bool{ShareBalances: true, ShareTransactions: true, ShareWhereabouts: true}

// Member is someone in the household, as the Sharing screen shows them.
type Member struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	IsYou       bool   `json:"is_you"`
}

// Sharing is what the user shares with each member (Given, keyed by viewer)
// and what each member shares with the user (Received, keyed by owner).
type Sharing struct {
	Members  []Member            `json:"members"`
	Given    map[string][]string `json:"given"`
	Received map[string][]string `json:"received"`
}

// Sharing returns the household's members and the user's sharing in both directions.
func (d *DB) Sharing(ctx context.Context, userID, householdID string) (Sharing, error) {
	s := Sharing{Members: []Member{}, Given: map[string][]string{}, Received: map[string][]string{}}
	if !uuidRE.MatchString(householdID) {
		return s, ErrInvalid
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select m.user_id, coalesce(p.display_name, ''), m.role, m.user_id = auth.uid()
			from public.household_members m
			left join public.profiles p on p.id = m.user_id
			where m.household_id = $1
			order by m.user_id = auth.uid() desc, m.created_at, m.user_id`, householdID)
		if err != nil {
			return err
		}
		if s.Members, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Member]); err != nil {
			return err
		}
		if len(s.Members) == 0 {
			return ErrForbidden // not a member: RLS hid everything
		}
		rows, err = tx.Query(ctx, `
			select owner_user_id, viewer_user_id, category from public.shares
			where household_id = $1 order by category`, householdID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var owner, viewer, cat string
			if err := rows.Scan(&owner, &viewer, &cat); err != nil {
				return err
			}
			if owner == userID {
				s.Given[viewer] = append(s.Given[viewer], cat)
			} else {
				s.Received[owner] = append(s.Received[owner], cat)
			}
		}
		return rows.Err()
	})
	return s, err
}

// SetSharing replaces what userID shares with viewerID in householdID. An
// empty list stops sharing. Time and location need transactions too.
// The database checks that the user shares only their own money, with a
// member who can use it (not a teen or child).
func (d *DB) SetSharing(ctx context.Context, userID, householdID, viewerID string, categories []string) error {
	if !uuidRE.MatchString(householdID) || !uuidRE.MatchString(viewerID) {
		return ErrInvalid
	}
	seen := map[string]bool{}
	for _, c := range categories {
		if !shareCategories[c] || seen[c] {
			return ErrInvalid
		}
		seen[c] = true
	}
	if seen[ShareWhereabouts] && !seen[ShareTransactions] {
		return ErrInvalid
	}
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `delete from public.shares
			where household_id = $1 and owner_user_id = auth.uid() and viewer_user_id = $2`, householdID, viewerID); err != nil {
			return mapErr(err)
		}
		for c := range seen {
			if _, err := tx.Exec(ctx, `insert into public.shares (household_id, owner_user_id, viewer_user_id, category)
				values ($1, auth.uid(), $2, $3)`, householdID, viewerID, c); err != nil {
				return mapErr(err)
			}
		}
		return nil
	})
}

// SetDisplayName sets the name other members see.
func (d *DB) SetDisplayName(ctx context.Context, userID, name string) error {
	name = strings.TrimSpace(name)
	if len([]rune(name)) > 80 {
		return ErrInvalid
	}
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `update public.profiles set display_name = $1 where id = auth.uid()`, name)
		return mapErr(err)
	})
}
