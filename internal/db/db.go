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
// In the running app it must be the tallyn_api login: see CheckAPILogin.
func Open(ctx context.Context, databaseURL string) (*DB, error) {
	pool, err := openPool(ctx, "DATABASE_URL", databaseURL)
	if err != nil {
		return nil, err
	}
	return &DB{pool: pool}, nil
}

func openPool(ctx context.Context, name, databaseURL string) (*pgxpool.Pool, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("db: %s is empty", name)
	}
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: parse %s: %w", name, err)
	}
	// Supabase's pooler in transaction mode can hand each transaction a
	// different server connection, so avoid named prepared statements.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeCacheDescribe
	cfg.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: open %s pool: %w", name, err)
	}
	pctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: ping %s: %w", name, err)
	}
	return pool, nil
}

// loginInfo describes the role a pool logs in as.
type loginInfo struct {
	name                  string
	superuser, bypassRLS  bool
	canBeAuthenticated    bool // may SET ROLE authenticated
	canBeSync             bool // may SET ROLE tallyn_sync
	inheritsAuthenticated bool
}

func describeLogin(ctx context.Context, pool *pgxpool.Pool) (loginInfo, error) {
	var l loginInfo
	err := pool.QueryRow(ctx, `
		select r.rolname, r.rolsuper, r.rolbypassrls,
		       pg_has_role(session_user, 'authenticated', 'SET'),
		       pg_has_role(session_user, 'tallyn_sync', 'SET'),
		       pg_has_role(session_user, 'authenticated', 'USAGE')
		from pg_roles r where r.rolname = session_user`).
		Scan(&l.name, &l.superuser, &l.bypassRLS, &l.canBeAuthenticated, &l.canBeSync, &l.inheritsAuthenticated)
	return l, err
}

// ErrUnsafeLogin means a connection string uses a login with more power than
// its job needs (ADR 0006). The server refuses to start with it.
var ErrUnsafeLogin = errors.New("db: unsafe database login")

// CheckAPILogin makes sure DATABASE_URL logs in as a role that can only become
// `authenticated`: not a superuser, no BYPASSRLS, no way into the sync role,
// and no rights of its own. Otherwise SQL injected into a request could leave
// the user's role (ADR 0006).
func (d *DB) CheckAPILogin(ctx context.Context) error {
	l, err := describeLogin(ctx, d.pool)
	if err != nil {
		return fmt.Errorf("db: check DATABASE_URL login: %w", err)
	}
	switch {
	case l.superuser || l.bypassRLS:
		return fmt.Errorf("%w: DATABASE_URL logs in as %q, which can bypass row-level security; use the tallyn_api login", ErrUnsafeLogin, l.name)
	case l.canBeSync:
		return fmt.Errorf("%w: DATABASE_URL login %q can become tallyn_sync; use the tallyn_api login", ErrUnsafeLogin, l.name)
	case !l.canBeAuthenticated:
		return fmt.Errorf("%w: DATABASE_URL login %q can't become authenticated; use the tallyn_api login", ErrUnsafeLogin, l.name)
	case l.inheritsAuthenticated:
		return fmt.Errorf("%w: DATABASE_URL login %q inherits authenticated's rights outside AsUser; grant it WITH INHERIT FALSE", ErrUnsafeLogin, l.name)
	}
	return nil
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

// The bank sync's system path (its own narrow role) is System, in system.go.
