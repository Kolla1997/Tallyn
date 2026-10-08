// Package db is the only path to the Supabase Postgres database.
// The React app never talks to the database directly.
//
// Every user request runs through AsUser, which switches to the
// `authenticated` role and sets the user's ID in request.jwt.claims, so the
// row-level security policies in migrations/ apply (ADR 0002). The raw pool
// is never handed out: the login role may bypass RLS.
package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps the connection pool.
type DB struct {
	pool *pgxpool.Pool
}

// Open connects to databaseURL (DATABASE_URL) and checks the connection.
func Open(ctx context.Context, databaseURL string) (*DB, error) {
	if databaseURL == "" {
		return nil, errors.New("db: DATABASE_URL is empty")
	}
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: parse DATABASE_URL: %w", err)
	}
	// Supabase's pooler in transaction mode can hand each transaction a
	// different server connection, so avoid named prepared statements.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeCacheDescribe
	cfg.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: open pool: %w", err)
	}
	d := &DB{pool: pool}
	if err := d.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return d, nil
}

// Close closes all connections.
func (d *DB) Close() { d.pool.Close() }

// Ping checks that the database answers. Used by the health check.
func (d *DB) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := d.pool.Ping(ctx); err != nil {
		return fmt.Errorf("db: ping: %w", err)
	}
	return nil
}

var uuidRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ErrBadUserID is returned when AsUser gets something that isn't a UUID.
var ErrBadUserID = errors.New("db: user ID must be a UUID")

// AsUser runs fn in a transaction as the signed-in user, with RLS enforced.
// userID must come from a verified Supabase session (#7), never from the request body.
// The transaction commits if fn returns nil and rolls back otherwise.
func (d *DB) AsUser(ctx context.Context, userID string, fn func(pgx.Tx) error) error {
	if !uuidRE.MatchString(userID) {
		return ErrBadUserID
	}
	claims, err := json.Marshal(map[string]string{"sub": userID, "role": "authenticated"})
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, d.pool, func(tx pgx.Tx) error {
		// Both settings are LOCAL: they end with the transaction, so a pooled
		// connection never carries one user's identity into the next request.
		if _, err := tx.Exec(ctx, "set local role authenticated"); err != nil {
			return fmt.Errorf("db: set role: %w", err)
		}
		if _, err := tx.Exec(ctx, "select set_config('request.jwt.claims', $1, true)", string(claims)); err != nil {
			return fmt.Errorf("db: set claims: %w", err)
		}
		return fn(tx)
	})
}

// TODO(#8): add a system path for the bank sync (writing plaid_items, accounts,
// transactions and fx_rates), with its own narrow role. See ADR 0002.
