package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Me is the signed-in person's profile and the households they belong to.
type Me struct {
	UserID      string        `json:"user_id"`
	DisplayName string        `json:"display_name"`
	Households  []MyHousehold `json:"households"`
}

// MyHousehold is one household and the person's role in it.
type MyHousehold struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	HomeCurrency string `json:"home_currency"`
	Role         string `json:"role"`
}

// ErrNoProfile means the user has no profile row. Profiles are created by a
// trigger when someone signs up, so this points at a broken setup.
var ErrNoProfile = errors.New("db: no profile for user")

// Me reads the user's profile and households as that user, so RLS applies.
func (d *DB) Me(ctx context.Context, userID string) (Me, error) {
	me := Me{UserID: userID, Households: []MyHousehold{}}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `select display_name from profiles where id = $1`, userID).Scan(&me.DisplayName)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoProfile
		}
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			select h.id, h.name, h.home_currency, m.role
			from household_members m join households h on h.id = m.household_id
			where m.user_id = $1
			order by h.created_at, h.id`, userID)
		if err != nil {
			return err
		}
		hh, err := pgx.CollectRows(rows, pgx.RowToStructByPos[MyHousehold])
		if err != nil {
			return err
		}
		me.Households = append(me.Households, hh...)
		return nil
	})
	return me, err
}
