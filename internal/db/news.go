package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Product news (#281, 0027_product_news.sql): one choice per person, kept as
// a record of every change.

// Where a product news choice was made.
const (
	NewsSignup   = "signup"
	NewsSettings = "settings"
	NewsStopLink = "stop_link"
)

// News is a person's current product news choice. Set is false until they
// have made one (then On is false: no newsletter).
type News struct {
	On        bool       `json:"on"`
	Set       bool       `json:"set"`
	ChangedAt *time.Time `json:"changed_at"`
}

// News returns userID's newest choice.
func (d *DB) News(ctx context.Context, userID string) (News, error) {
	var n News
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var at time.Time
		err := tx.QueryRow(ctx, `select subscribed, created_at from public.news_choices
			where user_id = $1 order by created_at desc, id desc limit 1`, userID).Scan(&n.On, &at)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		n.Set, n.ChangedAt = true, &at
		return err
	})
	return n, mapErr(err)
}

// SetNews records a new choice for userID, made at source under the given
// Privacy Policy version.
func (d *DB) SetNews(ctx context.Context, userID string, on bool, source, privacyVersion string) error {
	switch source {
	case NewsSignup, NewsSettings, NewsStopLink:
	default:
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into public.news_choices (user_id, subscribed, source, privacy_version) values ($1, $2, $3, $4)`,
			userID, on, source, privacyVersion)
		return err
	}))
}

// NewsReader is someone who gets the newsletter now.
type NewsReader struct {
	UserID, Email, Name string
}

// NewsList lists who gets the newsletter now, for the newsletter sender.
func (s *System) NewsList(ctx context.Context) ([]NewsReader, error) {
	var out []NewsReader
	err := s.as(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select user_id::text, email, name from public.news_list()`)
		if err != nil {
			return err
		}
		out, err = pgx.CollectRows(rows, pgx.RowToStructByPos[NewsReader])
		return err
	})
	return out, err
}
