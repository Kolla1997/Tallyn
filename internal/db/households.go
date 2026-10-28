package db

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// RenameHousehold renames a household (#53) and returns the name as saved.
// The name is trimmed and must be 1–80 characters, never only spaces.
// Only owners may (households_update, RLS): anyone else gets ErrForbidden.
func (d *DB) RenameHousehold(ctx context.Context, userID, householdID, name string) (string, error) {
	name = strings.TrimSpace(name)
	if !uuidRE.MatchString(householdID) || name == "" || utf8.RuneCountInString(name) > 80 {
		return "", ErrInvalid
	}
	var saved string
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `update public.households set name = $2 where id = $1 returning name`, householdID, name).Scan(&saved)
		if err == pgx.ErrNoRows {
			return ErrForbidden // not an owner, or not a member at all: RLS hides the row
		}
		return err
	})
	return saved, mapErr(err)
}
