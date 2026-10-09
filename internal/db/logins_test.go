package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

// Attack simulations for ADR 0006: what SQL injected into a request (running
// inside AsUser, as the tallyn_api login) or into the sync could do. Every
// attempt must fail with permission denied. All data is fake.

func TestInjectedSQLCantLeaveTheUsersRole(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	var superuser string
	if err := f.admin.QueryRow(ctx, `select current_user`).Scan(&superuser); err != nil {
		t.Fatal(err)
	}

	attacks := map[string][]string{
		"reset role, then read every household's transactions": {`reset role`, `select count(*) from public.transactions`},
		"reset role, then read bank tokens":                    {`reset role`, `select access_token_encrypted from public.plaid_items`},
		"reset role, then read every profile":                  {`reset role`, `select count(*) from public.profiles`},
		"reset role, then call the link function":              {`reset role`, `select public.link_plaid_item(gen_random_uuid(), 'x', '\x00', null, null, '[]')`},
		"read bank tokens as the user":                         {`select access_token_encrypted from public.plaid_items`},
		"switch to the sync role":                              {`set role tallyn_sync`},
		"switch to the superuser":                              {`set role "` + superuser + `"`},
		"switch to service_role":                               {`set role service_role`},
		"switch to anon":                                       {`set role anon`},
	}
	for name, steps := range attacks {
		t.Run(name, func(t *testing.T) {
			err := f.db.AsUser(ctx, alice, func(tx pgx.Tx) error {
				for _, sql := range steps {
					if _, err := tx.Exec(ctx, sql); err != nil {
						return err
					}
				}
				return nil
			})
			if pgCode(err) != "42501" {
				t.Fatalf("err = %v, want permission denied", err)
			}
		})
	}

	t.Run("outside AsUser the API login can read nothing", func(t *testing.T) {
		for _, sql := range []string{
			`select count(*) from public.households`,
			`select count(*) from public.transactions`,
			`select count(*) from public.transaction_details`,
		} {
			var n int
			if err := f.db.pool.QueryRow(ctx, sql).Scan(&n); pgCode(err) != "42501" {
				t.Fatalf("%s: err = %v, want permission denied", sql, err)
			}
		}
	})
}

func TestInjectedSQLInTheSyncCantReachUsers(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	for name, steps := range map[string][]string{
		"reset role, then read profiles": {`reset role`, `select count(*) from public.profiles`},
		"switch to authenticated":        {`set role authenticated`},
		"switch to service_role":         {`set role service_role`},
	} {
		t.Run(name, func(t *testing.T) {
			err := f.sys.as(ctx, func(tx pgx.Tx) error {
				for _, sql := range steps {
					if _, err := tx.Exec(ctx, sql); err != nil {
						return err
					}
				}
				return nil
			})
			if pgCode(err) != "42501" {
				t.Fatalf("err = %v, want permission denied", err)
			}
		})
	}
}

func TestUnsafeLoginsAreRefused(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	// The superuser test login stands in for Supabase's postgres (BYPASSRLS).
	superURL := f.admin.Config().ConnString()

	admin, err := Open(ctx, superURL)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	if err := admin.CheckAPILogin(ctx); !errors.Is(err, ErrUnsafeLogin) {
		t.Fatalf("superuser as DATABASE_URL: err = %v, want ErrUnsafeLogin", err)
	}
	if _, err := OpenSystem(ctx, superURL); !errors.Is(err, ErrUnsafeLogin) {
		t.Fatalf("superuser as DATABASE_URL_SYNC: err = %v, want ErrUnsafeLogin", err)
	}
	if _, err := OpenSystem(ctx, f.apiURL); !errors.Is(err, ErrUnsafeLogin) {
		t.Fatalf("API login as DATABASE_URL_SYNC: err = %v, want ErrUnsafeLogin", err)
	}
	if err := f.db.CheckAPILogin(ctx); err != nil {
		t.Fatalf("tallyn_api: %v", err)
	}
}
