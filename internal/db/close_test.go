package db

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"
)

// Closing an account (#56, ADR 0015). Supabase deletes the sign-in; here the
// admin connection does the same delete, so the cascades run as in
// production. All data is fake.

const dana = "00000000-0000-4000-8000-00000000000d" // a second owner of the Test household

func TestClosingNeedsAnotherOwner(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	// Alice is the only owner of a household with Carl in it.
	if b, err := f.db.ClosingBlocker(ctx, alice); err != nil || b != "last_owner" {
		t.Fatalf("alice blocker = %q, %v; want last_owner", b, err)
	}
	if err := f.db.PrepareClosing(ctx, alice, bytes.Repeat([]byte{1}, 32)); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("PrepareClosing as last owner = %v, want ErrLastOwner", err)
	}
	var n int
	_ = f.admin.QueryRow(ctx, `select count(*) from closed_accounts`).Scan(&n)
	if n != 0 {
		t.Fatalf("a refused closing wrote %d records", n)
	}
	// Bob is alone in his household: nothing stops him.
	if b, err := f.db.ClosingBlocker(ctx, bob); err != nil || b != "" {
		t.Fatalf("bob blocker = %q, %v; want none", b, err)
	}
}

func TestClosingBanksAreOnlyYours(t *testing.T) {
	f := setup(t)
	// Alice may unlink Carl's bank as an owner, but closing takes only hers.
	banks, err := f.db.ClosingBanks(context.Background(), alice)
	if err != nil {
		t.Fatal(err)
	}
	if len(banks) != 1 || banks[0].ID != f.aliceItem || banks[0].PlaidItemID != "item-a" || len(banks[0].Sealed) == 0 {
		t.Fatalf("alice's closing banks = %+v, want only her own with its sealed token", banks)
	}
}

func TestClosingAnAccount(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	mustExec(t, f.admin, `insert into auth.users (id, email) values ($1, 'dana@example.test')`, dana)
	mustExec(t, f.admin, `insert into household_members (household_id, user_id, role) values ($1, $2, 'owner')`, f.testHH, dana)
	mustExec(t, f.admin, `insert into consents (user_id, document, version) values ($1, 'terms', '2026-10-01'), ($1, 'privacy', '2026-10-02')`, alice)
	mustExec(t, f.admin, `insert into budgets (household_id, member_user_id, category, period, amount_minor, currency, created_by)
		values ($1, null, 'FOOD_AND_DRINK', 'month', 50000, 'USD', $2), ($1, $2, null, 'week', 2000, 'USD', $3)`, f.testHH, alice, dana)

	if b, _ := f.db.ClosingBlocker(ctx, alice); b != "" {
		t.Fatalf("with Dana as owner too, alice blocker = %q", b)
	}
	hmac := bytes.Repeat([]byte{7}, 32)
	if err := f.db.PrepareClosing(ctx, alice, hmac); err != nil {
		t.Fatalf("PrepareClosing: %v", err)
	}
	if err := f.db.PrepareClosing(ctx, alice, hmac); err != nil { // retried after a failed sign-in delete
		t.Fatalf("PrepareClosing again: %v", err)
	}
	mustExec(t, f.admin, `delete from auth.users where id = $1`, alice) // what Supabase does

	counts := map[string]int{}
	var n0 int
	for name, sql := range map[string]string{
		"alice's profile":           `select count(*) from profiles where id = '` + alice + `'`,
		"alice's banks":             `select count(*) from plaid_items where owner_user_id = '` + alice + `'`,
		"alice's accounts":          `select count(*) from accounts where owner_user_id = '` + alice + `'`,
		"alice's memberships":       `select count(*) from household_members where user_id = '` + alice + `'`,
		"alice's consents":          `select count(*) from consents where user_id = '` + alice + `'`,
		"budget for alice":          `select count(*) from budgets where member_user_id = '` + alice + `'`,
		"transactions left":         `select count(*) from transactions`,
		"carl's bank":               `select count(*) from plaid_items where owner_user_id = '` + carl + `'`,
		"household budget she made": `select count(*) from budgets where member_user_id is null and created_by is null`,
		"the Test household":        `select count(*) from households where id = '` + f.testHH + `'`,
	} {
		if err := f.admin.QueryRow(ctx, sql).Scan(&n0); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		counts[name] = n0
	}
	want := map[string]int{
		"alice's profile": 0, "alice's banks": 0, "alice's accounts": 0, "alice's memberships": 0, "alice's consents": 0,
		"budget for alice": 0, "transactions left": 2, // Carl's and Bob's
		"carl's bank": 1, "household budget she made": 1, "the Test household": 1,
	}
	for k, v := range want {
		if counts[k] != v {
			t.Errorf("%s = %d, want %d", k, counts[k], v)
		}
	}

	// The record: id, the hash, when, the versions. Nothing else.
	var gotHMAC []byte
	var terms, privacy string
	var closedAt time.Time
	if err := f.admin.QueryRow(ctx, `select email_hmac, terms_version, privacy_version, closed_at from closed_accounts where user_id = $1`, alice).
		Scan(&gotHMAC, &terms, &privacy, &closedAt); err != nil {
		t.Fatalf("closing record: %v", err)
	}
	if !bytes.Equal(gotHMAC, hmac) || terms != "2026-10-01" || privacy != "2026-10-02" || time.Since(closedAt) > time.Minute {
		t.Errorf("record = %x %s %s %v", gotHMAC, terms, privacy, closedAt)
	}
	// Nobody reads it through the app, not even the person (who's gone).
	if _, err := f.execAs(dana, `select * from closed_accounts`); err == nil {
		t.Error("the app's login could read closed_accounts")
	}
}

// Someone alone in their household takes it with them: no empty households.
func TestClosingTakesYourEmptyHousehold(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	if err := f.db.PrepareClosing(ctx, bob, nil); err != nil {
		t.Fatalf("PrepareClosing: %v", err)
	}
	mustExec(t, f.admin, `delete from auth.users where id = $1`, bob)
	var n int
	_ = f.admin.QueryRow(ctx, `select count(*) from households where id = $1`, f.otherHH).Scan(&n)
	if n != 0 {
		t.Errorf("bob's household is still there")
	}
}

func TestClosingRecordsArePurged(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	mustExec(t, f.admin, `insert into closed_accounts (user_id, closed_at) values
		('00000000-0000-4000-8000-0000000000e1', now() - interval '3 years 1 day'),
		('00000000-0000-4000-8000-0000000000e2', now() - interval '2 years')`)
	n, err := f.sys.PurgeClosedAccounts(ctx, ClosingRecordsKept)
	if err != nil {
		t.Fatalf("PurgeClosedAccounts: %v", err)
	}
	var left int
	_ = f.admin.QueryRow(ctx, `select count(*) from closed_accounts`).Scan(&left)
	if n != 1 || left != 1 {
		t.Errorf("purged %d, left %d; want 1 and 1", n, left)
	}
	// The app's own login can't purge (or read) them.
	if _, err := f.execAs(alice, `select public.purge_closed_accounts(interval '0')`); err == nil {
		t.Error("the app's login could purge closing records")
	}
}
