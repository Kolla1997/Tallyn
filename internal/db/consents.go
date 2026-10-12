package db

import (
	"context"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
)

// Consent is one agreement: a document and version, and when (#36,
// 0010_consents.sql). The time comes from the database.
type Consent struct {
	Document   string    `json:"document"`
	Version    string    `json:"version"`
	AcceptedAt time.Time `json:"accepted_at"`
}

// ConsentDocs are the documents people agree to.
var ConsentDocs = []string{"terms", "privacy"}

var versionRE = regexp.MustCompile(`^[0-9A-Za-z.\-]{1,40}$`)

// Consents lists what userID has agreed to, newest first. RLS shows only
// their own.
func (d *DB) Consents(ctx context.Context, userID string) ([]Consent, error) {
	list := []Consent{}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select document, version, accepted_at from public.consents
			where user_id = $1
			order by accepted_at desc, document`, userID)
		if err != nil {
			return err
		}
		list, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Consent])
		return err
	})
	return list, err
}

// Accept records that userID agreed to these versions (document -> version).
// Agreeing to the same version again changes nothing.
func (d *DB) Accept(ctx context.Context, userID string, versions map[string]string) error {
	for doc, v := range versions {
		if (doc != "terms" && doc != "privacy") || !versionRE.MatchString(v) {
			return ErrInvalid
		}
	}
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		for doc, v := range versions {
			if _, err := tx.Exec(ctx, `
				insert into public.consents (user_id, document, version) values ($1, $2, $3)
				on conflict do nothing`, userID, doc, v); err != nil {
				return err
			}
		}
		return nil
	})
}
