package db

// Integration tests for the schema in migrations/ and its RLS policies.
//
// They need a throwaway Postgres where the login role can create databases:
//
//	TALLYN_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres go test ./internal/db
//
// Each run creates a fresh database, applies testdata/supabase_shim.sql and
// every migration in order, runs the checks and drops the database.
// Without TALLYN_TEST_DATABASE_URL the tests are skipped.
// All data below is fake.

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	alice = "00000000-0000-4000-8000-00000000000a" // owner of the Test household
	carl  = "00000000-0000-4000-8000-00000000000c" // child in the Test household
	bob   = "00000000-0000-4000-8000-00000000000b" // owner of a different household
)

type fixture struct {
	db        *DB     // logs in as tallyn_api, like the running app
	sys       *System // logs in as tallyn_sync, like the bank sync
	apiURL    string
	admin     *pgx.Conn // superuser, bypasses RLS: only for seeding and checks
	testHH    string
	otherHH   string
	aliceItem string
	carlItem  string
}

func setup(t *testing.T) *fixture {
	t.Helper()
	base := os.Getenv("TALLYN_TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TALLYN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()

	server, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	name := fmt.Sprintf("tallyn_test_%d", time.Now().UnixNano())
	if _, err := server.Exec(ctx, "create database "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}
	t.Cleanup(func() {
		_, _ = server.Exec(context.Background(), "drop database if exists "+name+" with (force)")
		server.Close(context.Background())
	})

	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	u.Path = "/" + name
	dbURL := u.String()

	admin, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect test db: %v", err)
	}
	t.Cleanup(func() { admin.Close(context.Background()) })

	files := []string{filepath.Join("testdata", "supabase_shim.sql")}
	migs, _ := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	sort.Strings(migs)
	if len(migs) == 0 {
		t.Fatal("no migrations found")
	}
	files = append(files, migs...)
	for _, f := range files {
		sql, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		if _, err := admin.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("apply %s: %v", f, err)
		}
	}

	// Log in the way the running app does (0006, ADR 0006): the API as
	// tallyn_api, the sync as tallyn_sync. Test-only passwords, local
	// throwaway database.
	loginURL := func(role string) string {
		mustExec(t, admin, `alter role `+role+` with login password 'test-only-password'`)
		lu := *u
		lu.User = url.UserPassword(role, "test-only-password")
		return lu.String()
	}
	apiURL, syncURL := loginURL("tallyn_api"), loginURL("tallyn_sync")

	d, err := Open(ctx, apiURL)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(d.Close)
	if err := d.CheckAPILogin(ctx); err != nil {
		t.Fatalf("CheckAPILogin: %v", err)
	}
	sys, err := OpenSystem(ctx, syncURL)
	if err != nil {
		t.Fatalf("OpenSystem: %v", err)
	}
	t.Cleanup(sys.Close)

	f := &fixture{db: d, sys: sys, apiURL: apiURL, admin: admin}
	f.seed(t)
	return f
}

func (f *fixture) seed(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	mustExec(t, f.admin, `insert into auth.users (id, email) values
		($1, 'alice@example.test'), ($2, 'carl@example.test'), ($3, 'bob@example.test')`, alice, carl, bob)

	f.testHH = f.createHousehold(t, alice, "Test household", "usd")
	f.otherHH = f.createHousehold(t, bob, "Other household", "EUR")

	// Alice (owner) adds Carl as a child.
	if err := f.db.AsUser(ctx, alice, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into household_members (household_id, user_id, role) values ($1, $2, 'child')`, f.testHH, carl)
		return err
	}); err != nil {
		t.Fatalf("alice adds carl: %v", err)
	}

	// Bank data comes from the sync, so seed it with the admin connection.
	f.aliceItem = f.seedBank(t, f.testHH, alice, "a")
	f.carlItem = f.seedBank(t, f.testHH, carl, "c")
	f.seedBank(t, f.otherHH, bob, "b")
	mustExec(t, f.admin, `insert into fx_rates (base, quote, as_of, rate, source) values ('EUR', 'USD', '2026-01-01', 1.1, 'test')`)
}

func (f *fixture) createHousehold(t *testing.T, user, name, cur string) string {
	t.Helper()
	ctx := context.Background()
	var id, homeCur string
	if err := f.db.AsUser(ctx, user, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select id, home_currency from create_household($1, $2)`, name, cur).Scan(&id, &homeCur)
	}); err != nil {
		t.Fatalf("create_household as %s: %v", user, err)
	}
	if homeCur != strings.ToUpper(cur) {
		t.Fatalf("home_currency = %q, want %q", homeCur, strings.ToUpper(cur))
	}
	return id
}

// seedBank adds one Plaid item, one account and one transaction owned by user.
func (f *fixture) seedBank(t *testing.T, hh, user, tag string) string {
	t.Helper()
	ctx := context.Background()
	var item, acct string
	if err := f.admin.QueryRow(ctx, `insert into plaid_items (household_id, owner_user_id, plaid_item_id, access_token_encrypted, institution_name)
		values ($1, $2, $3, '\xdeadbeef', 'Fake Bank') returning id`, hh, user, "item-"+tag).Scan(&item); err != nil {
		t.Fatalf("seed item: %v", err)
	}
	if err := f.admin.QueryRow(ctx, `insert into accounts (household_id, plaid_item_id, owner_user_id, plaid_account_id, name, type, currency, current_balance_minor)
		values ($1, $2, $3, $4, 'Checking', 'depository', 'USD', 123456) returning id`, hh, item, user, "acct-"+tag).Scan(&acct); err != nil {
		t.Fatalf("seed account: %v", err)
	}
	mustExec(t, f.admin, `insert into transactions (household_id, account_id, plaid_transaction_id, amount_minor, currency, date, name)
		values ($1, $2, $3, 1999, 'USD', '2026-01-02', 'Fake Grocer')`, hh, acct, "txn-"+tag)
	return item
}

func mustExec(t *testing.T, c *pgx.Conn, sql string, args ...any) {
	t.Helper()
	if _, err := c.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("exec: %v\n%s", err, sql)
	}
}

// count runs a count(*) query as user.
func (f *fixture) count(t *testing.T, user, sql string, args ...any) int {
	t.Helper()
	ctx := context.Background()
	var n int
	if err := f.db.AsUser(ctx, user, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, sql, args...).Scan(&n)
	}); err != nil {
		t.Fatalf("count as %s: %v\n%s", user, err, sql)
	}
	return n
}

// execAs runs a statement as user and returns rows affected.
func (f *fixture) execAs(user, sql string, args ...any) (int64, error) {
	ctx := context.Background()
	var n int64
	err := f.db.AsUser(ctx, user, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, sql, args...)
		n = tag.RowsAffected()
		return err
	})
	return n, err
}

func pgCode(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

func TestProfilesCreatedOnSignup(t *testing.T) {
	f := setup(t)
	var n int
	if err := f.admin.QueryRow(context.Background(), `select count(*) from profiles`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("profiles = %d, want 3", n)
	}
}

func TestHouseholdIsolation(t *testing.T) {
	f := setup(t)

	cases := []struct {
		name string
		user string
		sql  string
		want int
	}{
		{"bob sees only his household", bob, `select count(*) from households`, 1},
		{"bob can't see the Test household", bob, `select count(*) from households where id = '` + f.testHH + `'`, 0},
		{"bob can't see Test members", bob, `select count(*) from household_members where household_id = '` + f.testHH + `'`, 0},
		{"bob can't see Test accounts", bob, `select count(*) from accounts where household_id = '` + f.testHH + `'`, 0},
		{"bob can't see Test transactions", bob, `select count(*) from transactions where household_id = '` + f.testHH + `'`, 0},
		{"bob can't see alice's profile", bob, `select count(*) from profiles where id = '` + alice + `'`, 0},
		{"alice sees her household's members", alice, `select count(*) from household_members`, 2},
		{"alice sees carl's profile", alice, `select count(*) from profiles`, 2},
		{"alice (owner) sees all accounts", alice, `select count(*) from accounts`, 2},
		{"alice (owner) sees all transactions", alice, `select count(*) from transactions`, 2},
		{"carl (child) sees only his own account", carl, `select count(*) from accounts`, 1},
		{"carl (child) sees only his own transactions", carl, `select count(*) from transactions`, 1},
		{"carl (child) sees only his own items", carl, `select count(*) from plaid_items`, 1},
		{"everyone can read fx rates", bob, `select count(*) from fx_rates`, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := f.count(t, c.user, c.sql); got != c.want {
				t.Fatalf("got %d, want %d", got, c.want)
			}
		})
	}
}

func TestWritesAreLimited(t *testing.T) {
	f := setup(t)

	t.Run("access token is never readable", func(t *testing.T) {
		_, err := f.execAs(alice, `select access_token_encrypted from plaid_items`)
		if pgCode(err) != "42501" { // insufficient_privilege
			t.Fatalf("err = %v, want permission denied", err)
		}
	})
	t.Run("users can't write accounts", func(t *testing.T) {
		_, err := f.execAs(alice, `update accounts set current_balance_minor = 0`)
		if pgCode(err) != "42501" {
			t.Fatalf("err = %v, want permission denied", err)
		}
	})
	t.Run("users can't write fx rates", func(t *testing.T) {
		_, err := f.execAs(alice, `insert into fx_rates (base, quote, as_of, rate, source) values ('USD','EUR','2026-01-01',1,'x')`)
		if pgCode(err) != "42501" {
			t.Fatalf("err = %v, want permission denied", err)
		}
	})
	t.Run("bob can't rename the Test household", func(t *testing.T) {
		n, err := f.execAs(bob, `update households set name = 'hacked' where id = $1`, f.testHH)
		if err != nil || n != 0 {
			t.Fatalf("n = %d, err = %v, want 0 rows", n, err)
		}
	})
	t.Run("bob can't add himself to the Test household", func(t *testing.T) {
		_, err := f.execAs(bob, `insert into household_members (household_id, user_id, role) values ($1, $2, 'owner')`, f.testHH, bob)
		if pgCode(err) != "42501" { // RLS violation
			t.Fatalf("err = %v, want RLS violation", err)
		}
	})
	t.Run("carl (child) can't promote himself", func(t *testing.T) {
		n, err := f.execAs(carl, `update household_members set role = 'owner' where user_id = $1`, carl)
		if err != nil || n != 0 {
			t.Fatalf("n = %d, err = %v, want 0 rows", n, err)
		}
	})
	t.Run("carl (child) can't unlink alice's bank", func(t *testing.T) {
		n, err := f.execAs(carl, `delete from plaid_items where id = $1`, f.aliceItem)
		if err != nil || n != 0 {
			t.Fatalf("n = %d, err = %v, want 0 rows", n, err)
		}
	})
	t.Run("the last owner can't leave", func(t *testing.T) {
		_, err := f.execAs(alice, `delete from household_members where user_id = $1 and household_id = $2`, alice, f.testHH)
		if err == nil || !strings.Contains(err.Error(), "at least one owner") {
			t.Fatalf("err = %v, want 'at least one owner'", err)
		}
	})
	t.Run("alice (owner) can unlink carl's bank, and its data goes with it", func(t *testing.T) {
		n, err := f.execAs(alice, `delete from plaid_items where id = $1`, f.carlItem)
		if err != nil || n != 1 {
			t.Fatalf("n = %d, err = %v, want 1 row", n, err)
		}
		if got := f.count(t, alice, `select count(*) from transactions`); got != 1 {
			t.Fatalf("transactions after unlink = %d, want 1", got)
		}
	})
	t.Run("deleting a household removes everything in it", func(t *testing.T) {
		n, err := f.execAs(bob, `delete from households where id = $1`, f.otherHH)
		if err != nil || n != 1 {
			t.Fatalf("n = %d, err = %v, want 1 row", n, err)
		}
		var left int
		_ = f.admin.QueryRow(context.Background(), `select count(*) from transactions where household_id = $1`, f.otherHH).Scan(&left)
		if left != 0 {
			t.Fatalf("transactions left = %d, want 0", left)
		}
	})
}

func TestMe(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	for _, tc := range []struct {
		user, household, role string
	}{
		{alice, f.testHH, "owner"},
		{carl, f.testHH, "child"},
		{bob, f.otherHH, "owner"},
	} {
		me, err := f.db.Me(ctx, tc.user)
		if err != nil {
			t.Fatalf("Me(%s): %v", tc.user, err)
		}
		if me.UserID != tc.user || len(me.Households) != 1 {
			t.Fatalf("Me(%s) = %+v, want one household", tc.user, me)
		}
		if h := me.Households[0]; h.ID != tc.household || h.Role != tc.role {
			t.Fatalf("Me(%s) household = %+v, want %s as %s", tc.user, h, tc.household, tc.role)
		}
	}

	if _, err := f.db.Me(ctx, "44444444-4444-4444-8444-444444444444"); !errors.Is(err, ErrNoProfile) {
		t.Fatalf("unknown user: err = %v, want ErrNoProfile", err)
	}
}

func TestAsUser(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	if err := f.db.AsUser(ctx, "not-a-uuid", func(pgx.Tx) error { return nil }); !errors.Is(err, ErrBadUserID) {
		t.Fatalf("err = %v, want ErrBadUserID", err)
	}

	var uid, role string
	if err := f.db.AsUser(ctx, alice, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select auth.uid()::text, current_user`).Scan(&uid, &role)
	}); err != nil {
		t.Fatal(err)
	}
	if uid != alice || role != "authenticated" {
		t.Fatalf("inside AsUser: uid = %q, role = %q", uid, role)
	}

	// Nothing leaks onto pooled connections after the transaction ends.
	for i := 0; i < 5; i++ {
		var claims *string
		if err := f.db.pool.QueryRow(ctx, `select current_user, nullif(current_setting('request.jwt.claims', true), '')`).Scan(&role, &claims); err != nil {
			t.Fatal(err)
		}
		if role == "authenticated" || claims != nil {
			t.Fatalf("leaked: role = %q, claims = %v", role, claims)
		}
	}

	if err := f.db.Ping(ctx); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

// Guard for future migrations: every table in public must have RLS on (CLAUDE.md §7).
func TestEveryTableHasRLS(t *testing.T) {
	f := setup(t)
	rows, err := f.admin.Query(context.Background(),
		`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
		 where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`)
	if err != nil {
		t.Fatal(err)
	}
	missing, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	if len(missing) > 0 {
		t.Fatalf("tables without RLS: %v", missing)
	}
}
