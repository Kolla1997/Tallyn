package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// The welcome email (#280, 0026_welcome_emails.sql).

// WelcomeDue is someone due a welcome email.
type WelcomeDue struct {
	UserID, Email, Name string
}

// WelcomeDue lists who has agreed to the terms in the last 7 days and
// hasn't been sent a welcome email yet.
func (s *System) WelcomeDue(ctx context.Context, now time.Time) ([]WelcomeDue, error) {
	var out []WelcomeDue
	err := s.as(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select user_id::text, email, name from public.welcome_due($1)`, now)
		if err != nil {
			return err
		}
		out, err = pgx.CollectRows(rows, pgx.RowToStructByPos[WelcomeDue])
		return err
	})
	return out, err
}

// MarkWelcome records that userID was looked at: sent, or skipped because
// the email couldn't be built.
func (s *System) MarkWelcome(ctx context.Context, userID string, sent bool) error {
	return s.as(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select public.mark_welcome($1, $2)`, userID, sent)
		return err
	})
}
