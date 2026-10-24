package db

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Closing an account (#56, ADR 0015). The API runs these in order:
// ClosingBlocker, then each of ClosingBanks is removed at Plaid and deleted,
// then PrepareClosing, then the Supabase sign-in is deleted (which deletes
// everything else of theirs by cascade).

// ClosingBank is one of the person's own banks, with its encrypted token so
// the API can revoke it at Plaid.
type ClosingBank struct {
	ID          string
	PlaidItemID string
	Sealed      []byte
}

// ClosingBlocker says why userID can't close their account yet ("last_owner":
// they're the only owner of a household that has other members), or "".
func (d *DB) ClosingBlocker(ctx context.Context, userID string) (string, error) {
	var blocker *string
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.account_closing_blocker()`).Scan(&blocker)
	})
	if blocker == nil {
		return "", err
	}
	return *blocker, err
}

// ClosingBanks lists the banks userID linked themselves, never a kid's bank
// they may manage as an owner: those stay with the kid.
func (d *DB) ClosingBanks(ctx context.Context, userID string) ([]ClosingBank, error) {
	var list []ClosingBank
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select i.id, f.plaid_item_id, f.access_token_encrypted
			from public.plaid_items i
			cross join lateral public.plaid_item_for_unlink(i.id) f
			where i.owner_user_id = $1
			order by i.created_at`, userID)
		if err != nil {
			return err
		}
		list, err = pgx.CollectRows(rows, pgx.RowToStructByPos[ClosingBank])
		return err
	})
	return list, err
}

// PrepareClosing writes the closing record (a keyed hash of the email, never
// the email) and deletes households where userID is the only member. It
// refuses with ErrLastOwner if closing isn't allowed. Safe to run again.
func (d *DB) PrepareClosing(ctx context.Context, userID string, emailHMAC []byte) error {
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.prepare_account_closing($1)`, emailHMAC)
		if err != nil && strings.Contains(err.Error(), "last_owner") {
			return ErrLastOwner
		}
		return mapErr(err)
	})
}

// ClosingRecordsKept is how long a closing record is kept (Dinesh,
// 2026-10-24; ADR 0015). The lawyer review (#36) may change it.
const ClosingRecordsKept = 3 * 365 * 24 * time.Hour

// PurgeClosedAccounts deletes closing records older than keep and says how
// many went. The bank sync's role runs it daily.
func (s *System) PurgeClosedAccounts(ctx context.Context, keep time.Duration) (int, error) {
	var n int
	err := s.as(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.purge_closed_accounts($1)`, keep).Scan(&n)
	})
	return n, err
}
