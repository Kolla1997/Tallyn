package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// Notification emails (#269, 0023_notification_emails.sql). The server runs
// these with the bank sync's login, like the other daily jobs.

// NotifyPaymentsDue opens payment-due alerts for cards and loans due within
// three days of today or overdue, and closes the ones no longer due.
func (s *System) NotifyPaymentsDue(ctx context.Context, today time.Time) (int, error) {
	var n int
	err := s.as(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.notify_payments_due($1)`, today).Scan(&n)
	})
	return n, err
}

// OutboxEmail is an alert the server hasn't looked at yet. Send says whether
// it should be emailed (the person's switches, a confirmed email address).
type OutboxEmail struct {
	ID          string
	UserID      string
	HouseholdID string
	Household   string // its name
	Kind        string
	Data        json.RawMessage
	OwnerID     string
	Email       string
	Send        bool
}

// EmailOutbox returns up to max alerts not yet looked at, oldest first.
func (s *System) EmailOutbox(ctx context.Context, max int) ([]OutboxEmail, error) {
	var out []OutboxEmail
	err := s.as(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select id::text, user_id::text, household_id::text, household, kind, data, coalesce(owner_id::text, ''), coalesce(email, ''), send
			from public.email_outbox($1)`, max)
		if err != nil {
			return err
		}
		out, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (OutboxEmail, error) {
			var e OutboxEmail
			err := r.Scan(&e.ID, &e.UserID, &e.HouseholdID, &e.Household, &e.Kind, &e.Data, &e.OwnerID, &e.Email, &e.Send)
			return e, err
		})
		return err
	})
	return out, err
}

// MarkEmailed records that these alerts were looked at (sent or skipped),
// so they're never emailed again.
func (s *System) MarkEmailed(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return s.as(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.mark_emailed($1::uuid[])`, ids)
		return err
	})
}

// Email types an unsubscribe link can turn off (#269).
const (
	EmailReconnect    = "reconnect"
	EmailPaymentDue   = "payment_due"
	EmailKidReconnect = "kid_reconnect" // with the child's user ID
)

// SetEmail turns one of userID's emails on or off, from a signed
// unsubscribe link: the caller checks the signature, the change runs as
// userID with RLS. kid is the child for EmailKidReconnect.
func (d *DB) SetEmail(ctx context.Context, userID, householdID, kind, kid string, on bool) error {
	if !uuidRE.MatchString(householdID) || (kind == EmailKidReconnect && !uuidRE.MatchString(kid)) {
		return ErrInvalid
	}
	switch kind {
	case EmailReconnect, EmailPaymentDue:
		kid = ""
	case EmailKidReconnect:
	default:
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		// Saved settings first, so a person who never opened Settings gets a row.
		if _, err := tx.Exec(ctx, `insert into public.notification_settings (household_id, user_id) values ($1, $2) on conflict do nothing`,
			householdID, userID); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `
			update public.notification_settings set
			  email_reconnect = case when $3 = 'reconnect' then $4 else email_reconnect end,
			  email_payment_due = case when $3 = 'payment_due' then $4 else email_payment_due end,
			  email_kid_reconnect = case when $3 <> 'kid_reconnect' then email_kid_reconnect
			                             when $4 then array(select distinct unnest(email_kid_reconnect || nullif($5, '')::uuid))
			                             else array_remove(email_kid_reconnect, nullif($5, '')::uuid) end
			where household_id = $1 and user_id = $2`, householdID, userID, kind, on, kid)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrForbidden
		}
		return nil
	}))
}
