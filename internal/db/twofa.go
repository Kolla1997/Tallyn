package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ResetMember2FA lets an owner reset a teen's two-step sign-in (#120): it
// writes the record and removes the teen's backup codes, then runs
// removeFactors (the server-only Supabase call, ADR 0013) before committing.
// If that call fails, nothing here changes. Anything but an owner resetting a
// teen in their own household is ErrForbidden.
func (d *DB) ResetMember2FA(ctx context.Context, userID, householdID, memberID string, removeFactors func(context.Context) error) error {
	if !uuidRE.MatchString(householdID) || !uuidRE.MatchString(memberID) {
		return ErrForbidden
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select public.reset_member_2fa($1, $2)`, householdID, memberID); err != nil {
			return err
		}
		return removeFactors(ctx)
	}))
}

// TwoFAReset is who last reset someone's two-step sign-in, and when.
type TwoFAReset struct {
	ResetByName string    `json:"reset_by_name"`
	ResetAt     time.Time `json:"reset_at"`
}

// My2FAReset is the signed-in person's latest reset in the last 30 days, or
// nil, for the note at their next sign-in (#120).
func (d *DB) My2FAReset(ctx context.Context, userID string) (*TwoFAReset, error) {
	var r TwoFAReset
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select reset_by_name, reset_at from public.my_2fa_reset()`).Scan(&r.ResetByName, &r.ResetAt)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}
