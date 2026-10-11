package db

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// Transactions page (#42): filters, paging, owners and logos. All data is fake.

func seedTxns(t *testing.T, f *fixture) {
	t.Helper()
	ctx := context.Background()
	mk := func(id, acct, merchant, cat, logo string, day int) plaid.Transaction {
		return plaid.Transaction{PlaidTransactionID: id, PlaidAccountID: acct, AmountMinor: 1000 + int64(day), Currency: "USD",
			Date: fmt.Sprintf("2026-10-%02d", day), Name: merchant, MerchantName: merchant, CategoryPrimary: cat, LogoURL: logo}
	}
	var alices []plaid.Transaction
	for i := 1; i <= 7; i++ {
		alices = append(alices, mk(fmt.Sprintf("a%d", i), "acct-a", "Fresh Market", "FOOD_AND_DRINK", "https://plaid-merchant-logos.plaid.com/fresh_1.png", i))
	}
	alices = append(alices, mk("a-uber", "acct-a", "Uber", "TRANSPORTATION", "", 8), mk("a-pct", "acct-a", "100% Juice_Bar", "FOOD_AND_DRINK", "", 9))
	if _, err := f.sys.SaveSync(ctx, syncItem(t, f, f.aliceItem), plaid.SyncResult{Added: alices, NextCursor: "c"}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.sys.SaveSync(ctx, syncItem(t, f, f.carlItem), plaid.SyncResult{Added: []plaid.Transaction{mk("c-books", "acct-c", "Book Barn", "GENERAL_MERCHANDISE", "", 3)}, NextCursor: "c"}); err != nil {
		t.Fatal(err)
	}
}

func TestTransactionFilters(t *testing.T) {
	f := setup(t)
	seedTxns(t, f)
	ctx := context.Background()
	count := func(user string, flt TxFilter) int {
		t.Helper()
		list, _, err := f.db.Transactions(ctx, user, f.testHH, flt)
		if err != nil {
			t.Fatal(err)
		}
		return len(list)
	}

	// Seeds from setup: one "Fake Grocer" each for alice and carl.
	if n := count(alice, TxFilter{}); n != 12 {
		t.Fatalf("alice sees %d, want 12", n)
	}
	if n := count(alice, TxFilter{Owner: carl}); n != 2 {
		t.Fatalf("carl's (alice is his parent): %d, want 2", n)
	}
	if n := count(alice, TxFilter{Owner: alice}); n != 10 {
		t.Fatalf("alice's own: %d, want 10", n)
	}
	if n := count(carl, TxFilter{Owner: alice}); n != 0 {
		t.Fatalf("carl (child) asking for alice's: %d, want 0", n)
	}
	if n := count(alice, TxFilter{Query: "fresh"}); n != 7 {
		t.Fatalf("search 'fresh': %d, want 7", n)
	}
	if n := count(alice, TxFilter{Query: "%"}); n != 1 {
		t.Fatalf("'%%' must match literally (100%% Juice_Bar only): %d", n)
	}
	if n := count(alice, TxFilter{Query: "_"}); n != 1 {
		t.Fatalf("'_' must match literally: %d", n)
	}
	if n := count(alice, TxFilter{Category: "TRANSPORTATION"}); n != 1 {
		t.Fatalf("category: %d, want 1", n)
	}
	if n := count(alice, TxFilter{Owner: alice, Query: "market", Category: "FOOD_AND_DRINK"}); n != 7 {
		t.Fatalf("combined: %d, want 7", n)
	}
	// Setup's two Fake Grocer rows are in January; everything seeded here is October.
	if n := count(alice, TxFilter{Month: "2026-10"}); n != 10 {
		t.Fatalf("October: %d, want 10", n)
	}
	if n := count(alice, TxFilter{Month: "2026-01"}); n != 2 {
		t.Fatalf("January: %d, want 2", n)
	}
	if n := count(alice, TxFilter{Month: "2026-11"}); n != 0 {
		t.Fatalf("November: %d, want 0", n)
	}
	if n := count(alice, TxFilter{Month: "2026-10", Category: "FOOD_AND_DRINK"}); n != 8 {
		t.Fatalf("October food: %d, want 8", n)
	}
	for name, flt := range map[string]TxFilter{
		"owner not a UUID":   {Owner: "alice"},
		"month not a month":  {Month: "2026-13"},
		"month injection":    {Month: "2026-10' --"},
		"category injection": {Category: "FOOD' OR 1=1 --"},
		"query too long":     {Query: string(make([]rune, 101))},
		"negative offset":    {Offset: -1},
	} {
		if _, _, err := f.db.Transactions(ctx, alice, f.testHH, flt); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestTransactionPaging(t *testing.T) {
	f := setup(t)
	seedTxns(t, f)
	ctx := context.Background()
	seen := map[string]bool{}
	offset, pages := 0, 0
	for {
		list, more, err := f.db.Transactions(ctx, alice, f.testHH, TxFilter{Limit: 5, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		pages++
		for _, tr := range list {
			if seen[tr.ID] {
				t.Fatalf("%s returned twice", tr.ID)
			}
			seen[tr.ID] = true
		}
		if !more {
			break
		}
		offset += len(list)
	}
	if len(seen) != 12 || pages != 3 {
		t.Fatalf("saw %d in %d pages, want 12 in 3", len(seen), pages)
	}
}

func TestTransactionOwnerAndLogo(t *testing.T) {
	f := setup(t)
	addDave(t, f)
	seedTxns(t, f)
	ctx := context.Background()

	// Alice shares transactions but not balances with dave: he sees her
	// transactions (with her as owner) but not her accounts.
	if err := f.db.SetSharing(ctx, alice, f.testHH, dave, []string{ShareTransactions}); err != nil {
		t.Fatal(err)
	}
	list, _, err := f.db.Transactions(ctx, dave, f.testHH, TxFilter{Owner: alice, Query: "fresh", Limit: 1})
	if err != nil || len(list) != 1 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	tr := list[0]
	if tr.OwnerUserID != alice || tr.AccountName != "" {
		t.Fatalf("owner %q, account %q: want alice as owner and no account name", tr.OwnerUserID, tr.AccountName)
	}
	if tr.LogoURL == nil || *tr.LogoURL != "https://plaid-merchant-logos.plaid.com/fresh_1.png" {
		t.Fatalf("logo = %v", tr.LogoURL)
	}

	// The database refuses logos from anywhere else, whatever the sync sends.
	for _, bad := range []string{
		"https://evil.example/a.png",
		"http://plaid-merchant-logos.plaid.com/a.png",
		"https://plaid-merchant-logos.plaid.com.evil.example/a.png",
		"https://plaid-merchant-logos.plaid.com/a.png?x=1",
	} {
		_, err := f.admin.Exec(ctx, `update transactions set logo_url = $1 where plaid_transaction_id = 'a1'`, bad)
		if pgCode(err) != "23514" {
			t.Fatalf("%s: err = %v, want check violation", bad, err)
		}
	}

	// transaction_owner reveals nothing to someone who can't see the account's money.
	var leaked *string
	if err := f.db.AsUser(ctx, bob, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.transaction_owner($1)::text`, accountID(t, f, "acct-a")).Scan(&leaked)
	}); err != nil {
		t.Fatal(err)
	}
	if leaked != nil {
		t.Fatalf("bob learned the owner of alice's account: %s", *leaked)
	}
}

func accountID(t *testing.T, f *fixture, plaidAccount string) string {
	t.Helper()
	var id string
	if err := f.admin.QueryRow(context.Background(), `select id from accounts where plaid_account_id = $1`, plaidAccount).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
