package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// BackupCodeStatus is what someone can see of their backup codes (#23,
// 0014_backup_codes.sql): how many are left, and when the set was made.
// Never the codes or their hashes.
type BackupCodeStatus struct {
	Left      int        `json:"left"`
	Total     int        `json:"total"`
	CreatedAt *time.Time `json:"created_at"`
}

// BackupCodeStatus counts userID's codes. RLS shows only their own.
func (d *DB) BackupCodeStatus(ctx context.Context, userID string) (BackupCodeStatus, error) {
	var s BackupCodeStatus
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			select count(*) filter (where used_at is null), count(*), max(created_at)
			from public.backup_codes where user_id = $1`, userID).Scan(&s.Left, &s.Total, &s.CreatedAt)
	})
	return s, err
}

// ReplaceBackupCodes swaps userID's codes for ten new ones, given as
// 32-byte keyed hashes (the API makes and hashes them).
func (d *DB) ReplaceBackupCodes(ctx context.Context, userID string, hashes [][]byte) error {
	if len(hashes) != 10 {
		return ErrInvalid
	}
	for _, h := range hashes {
		if len(h) != 32 {
			return ErrInvalid
		}
	}
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.replace_backup_codes($1)`, hashes)
		return err
	})
}

// UseBackupCode marks the matching unused code as used. False if nothing
// matched; a wrong code changes nothing. The other codes stay until the new
// set made after the new authenticator replaces them.
func (d *DB) UseBackupCode(ctx context.Context, userID string, hash []byte) (bool, error) {
	if len(hash) != 32 {
		return false, errors.New("db: backup code hash must be 32 bytes")
	}
	var ok bool
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.use_backup_code($1)`, hash).Scan(&ok)
	})
	return ok, err
}
