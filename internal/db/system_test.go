package db

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// All data below is fake. Needs TALLYN_TEST_DATABASE_URL (see db_test.go).

func ptr[T any](v T) *T { return &v }

// The fixture's seeded bank for tag t has plaid item "item-t", account
// "acct-t" and transaction "txn-t".
func syncItem(t *testing.T, f *fixture, id string) SyncItem {
	t.Helper()
	it, err := f.sys.Item(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func whereaboutsTxn(id, account string) plaid.Transaction {
	return plaid.Transaction{
		PlaidTransactionID: id, PlaidAccountID: account, AmountMinor: 1234, Currency: "USD",
		Date: "2026-10-01", AuthorizedDate: "2026-09-30", Name: "FAKE GROCER", MerchantName: "Fake Grocer",
		CategoryPrimary: "FOOD_AND_DRINK", CategoryDetailed: "FOOD_AND_DRINK_GROCERIES", PaymentChannel: "in store",
		AuthorizedAt: ptr(time.Date(2026, 9, 30, 13, 42, 0, 0, time.UTC)),
		Location:     plaid.Location{Address: "1 Test St", City: "Testville", Region: "IL", Country: "US", Lat: ptr(41.88), Lon: ptr(-87.63)},
	}
}

func TestSyncRoleLimits(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	sys := f.sys

	denied := map[string]string{
		"read profiles":         `select count(*) from public.profiles`,
		"read households":       `select count(*) from public.households`,
		"read members":          `select count(*) from public.household_members`,
		"create a bank link":    `insert into public.plaid_items (household_id, owner_user_id, plaid_item_id, access_token_encrypted) values (gen_random_uuid(), gen_random_uuid(), 'x', '\x00')`,
		"delete a bank link":    `delete from public.plaid_items`,
		"change a bank's owner": `update public.plaid_items set owner_user_id = owner_user_id`,
		"write exchange rates":  `insert into public.fx_rates (base, quote, as_of, rate, source) values ('USD', 'EUR', '2026-01-01', 1, 'x')`,
	}
	for name, sql := range denied {
		t.Run("can't "+name, func(t *testing.T) {
			err := sys.as(ctx, func(tx pgx.Tx) error { _, err := tx.Exec(ctx, sql); return err })
			if pgCode(err) != "42501" {
				t.Fatalf("err = %v, want permission denied", err)
			}
		})
	}

	// Postgres checks SET ROLE against the *login* role, and the backend's
	// login (Supabase's postgres) may also bypass RLS. So the boundary here is
	// that the authenticated role itself never holds the sync role, and that
	// handlers only run fixed, parameterised SQL. ADR 0005 has the hardening
	// plan (separate login roles).
	t.Run("the authenticated role never holds the sync role", func(t *testing.T) {
		var member bool
		if err := f.admin.QueryRow(ctx, `select pg_has_role('authenticated', 'tallyn_sync', 'MEMBER')`).Scan(&member); err != nil || member {
			t.Fatalf("authenticated is a member of tallyn_sync (%v)", err)
		}
		if err := f.admin.QueryRow(ctx, `select pg_has_role('anon', 'tallyn_sync', 'MEMBER')`).Scan(&member); err != nil || member {
			t.Fatalf("anon is a member of tallyn_sync (%v)", err)
		}
	})

	t.Run("lists active banks with their encrypted tokens", func(t *testing.T) {
		items, err := sys.ItemsToSync(ctx)
		if err != nil || len(items) != 3 || len(items[0].Sealed) == 0 {
			t.Fatalf("items = %+v, err = %v", items, err)
		}
		if err := sys.SetStatus(ctx, f.carlItem, "needs_reauth"); err != nil {
			t.Fatal(err)
		}
		if items, _ := sys.ItemsToSync(ctx); len(items) != 2 {
			t.Fatalf("needs_reauth banks must be skipped: %d items", len(items))
		}
		if err := sys.SetStatus(ctx, f.carlItem, "sleeping"); !errors.Is(err, ErrInvalid) {
			t.Fatalf("unknown status: err = %v", err)
		}
	})
}

func TestSaveSync(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	sys := f.sys
	item := syncItem(t, f, f.aliceItem)

	bal := int64(5000)
	res := plaid.SyncResult{
		Added: []plaid.Transaction{
			whereaboutsTxn("txn-new", "acct-a"),
			{PlaidTransactionID: "txn-online", PlaidAccountID: "acct-a", AmountMinor: -2500, Currency: "USD", Date: "2026-10-02", Name: "REFUND", PaymentChannel: "online"},
			{PlaidTransactionID: "txn-orphan", PlaidAccountID: "acct-unknown", AmountMinor: 1, Currency: "USD", Date: "2026-10-02", Name: "X"},
		},
		Removed: []string{"txn-a", "txn-b"}, // txn-b is Bob's, in another bank: must survive
		Accounts: []plaid.Account{
			{PlaidAccountID: "acct-a", Name: "Checking", Type: "depository", Currency: "USD", CurrentMinor: &bal},
			{PlaidAccountID: "acct-a2", Name: "New Savings", Type: "depository", Subtype: "savings", Currency: "USD", CurrentMinor: &bal},
			{PlaidAccountID: "acct-b", Name: "Hijack", Type: "depository", Currency: "USD", CurrentMinor: &bal}, // Bob's
		},
		NextCursor: "cursor-1",
	}
	st, err := sys.SaveSync(ctx, item, res)
	if err != nil {
		t.Fatal(err)
	}
	if st.Upserted != 2 || st.Skipped != 1 || st.Removed != 2 {
		t.Fatalf("stats = %+v", st)
	}

	q := func(sql string, args ...any) int {
		t.Helper()
		var v int
		if err := f.admin.QueryRow(ctx, sql, args...).Scan(&v); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
		return v
	}
	if q(`select count(*) from transactions where plaid_transaction_id = 'txn-a'`) != 0 {
		t.Fatal("removed transaction still there")
	}
	if q(`select count(*) from transactions where plaid_transaction_id = 'txn-b'`) != 1 {
		t.Fatal("another bank's transaction was removed")
	}
	if q(`select count(*) from accounts where plaid_account_id = 'acct-b' and name = 'Checking' and plaid_item_id <> $1`, f.aliceItem) != 1 {
		t.Fatal("another bank's account was taken over")
	}
	if q(`select count(*) from accounts where plaid_account_id = 'acct-a2' and owner_user_id = $1`, alice) != 1 {
		t.Fatal("new account not added with the bank's owner")
	}
	if q(`select current_balance_minor::int from accounts where plaid_account_id = 'acct-a'`) != 5000 {
		t.Fatal("balance not updated")
	}
	if q(`select count(*) from transaction_details d join transactions t on t.id = d.transaction_id
		where t.plaid_transaction_id = 'txn-new' and d.city = 'Testville' and d.lat = 41.88 and d.authorized_at is not null`) != 1 {
		t.Fatal("time and location not saved")
	}
	if q(`select count(*) from transaction_details d join transactions t on t.id = d.transaction_id where t.plaid_transaction_id = 'txn-online'`) != 0 {
		t.Fatal("details saved for a transaction that has none")
	}
	if q(`select count(*) from plaid_items where id = $1 and transactions_cursor = 'cursor-1' and last_synced_at is not null`, f.aliceItem) != 1 {
		t.Fatal("cursor not saved")
	}

	t.Run("a stale cursor saves nothing", func(t *testing.T) {
		stale := res
		stale.Added = []plaid.Transaction{whereaboutsTxn("txn-stale", "acct-a")}
		stale.NextCursor = "cursor-old"
		if _, err := sys.SaveSync(ctx, item, stale); !errors.Is(err, ErrStaleCursor) { // item still has cursor ""
			t.Fatalf("err = %v, want ErrStaleCursor", err)
		}
		if q(`select count(*) from transactions where plaid_transaction_id = 'txn-stale'`) != 0 {
			t.Fatal("stale sync wrote data")
		}
	})

	t.Run("a modified transaction replaces its details", func(t *testing.T) {
		item = syncItem(t, f, f.aliceItem)
		mod := whereaboutsTxn("txn-new", "acct-a")
		mod.AmountMinor, mod.Location, mod.AuthorizedAt = 999, plaid.Location{}, nil
		if _, err := sys.SaveSync(ctx, item, plaid.SyncResult{Modified: []plaid.Transaction{mod}, NextCursor: "cursor-2"}); err != nil {
			t.Fatal(err)
		}
		if q(`select amount_minor::int from transactions where plaid_transaction_id = 'txn-new'`) != 999 {
			t.Fatal("amount not updated")
		}
		if q(`select count(*) from transaction_details d join transactions t on t.id = d.transaction_id where t.plaid_transaction_id = 'txn-new'`) != 0 {
			t.Fatal("old location kept after the bank dropped it")
		}
	})

	t.Run("a bad batch rolls everything back", func(t *testing.T) {
		item = syncItem(t, f, f.aliceItem)
		bad := plaid.SyncResult{
			Added:      []plaid.Transaction{whereaboutsTxn("txn-rollback", "acct-a"), {PlaidTransactionID: "txn-bad", PlaidAccountID: "acct-a", Currency: "not a currency", Date: "2026-10-01", Name: "X"}},
			NextCursor: "cursor-3",
		}
		if _, err := sys.SaveSync(ctx, item, bad); err == nil {
			t.Fatal("want an error")
		}
		if q(`select count(*) from transactions where plaid_transaction_id = 'txn-rollback'`) != 0 ||
			q(`select count(*) from plaid_items where id = $1 and transactions_cursor = 'cursor-2'`, f.aliceItem) != 1 {
			t.Fatal("partial save")
		}
	})
}

func TestWhereaboutsVisibility(t *testing.T) {
	f := setup(t)
	addDave(t, f)
	ctx := context.Background()
	sys := f.sys

	if _, err := sys.SaveSync(ctx, syncItem(t, f, f.aliceItem), plaid.SyncResult{Added: []plaid.Transaction{whereaboutsTxn("txn-alice", "acct-a")}, NextCursor: "c"}); err != nil {
		t.Fatal(err)
	}
	if _, err := sys.SaveSync(ctx, syncItem(t, f, f.carlItem), plaid.SyncResult{Added: []plaid.Transaction{whereaboutsTxn("txn-carl", "acct-c")}, NextCursor: "c"}); err != nil {
		t.Fatal(err)
	}

	// who → which transactions they see, and whose whereabouts.
	cases := []struct {
		name      string
		user      string
		sees      map[string]bool // merchant txn id → whereabouts visible
		forbidden []string        // transactions not visible at all
	}{
		{"alice (owner) sees her own and her child's", alice, map[string]bool{"txn-alice": true, "txn-carl": true}, nil},
		{"carl (child) sees only his own", carl, map[string]bool{"txn-carl": true}, []string{"txn-alice"}},
		// 0007: adults see kids' everything automatically, other adults' nothing unless shared.
		{"dave (adult) sees his child's whereabouts, nothing of alice's", dave, map[string]bool{"txn-carl": true}, []string{"txn-alice"}},
		{"bob (other household) sees nothing", bob, map[string]bool{}, []string{"txn-alice", "txn-carl"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			list, _, err := f.db.Transactions(ctx, tc.user, f.testHH, TxFilter{Limit: 100})
			if err != nil {
				t.Fatal(err)
			}
			got := map[string]bool{}
			byPlaid := map[string]string{}
			rows, _ := f.admin.Query(ctx, `select id::text, plaid_transaction_id from transactions`)
			for rows.Next() {
				var id, pid string
				_ = rows.Scan(&id, &pid)
				byPlaid[id] = pid
			}
			for _, tr := range list {
				pid := byPlaid[tr.ID]
				if pid == "txn-alice" || pid == "txn-carl" {
					got[pid] = tr.Whereabouts != nil
					if tr.Whereabouts != nil && (tr.Whereabouts.City == nil || *tr.Whereabouts.City != "Testville" || tr.Whereabouts.Lat == nil) {
						t.Fatalf("%s whereabouts = %+v", pid, tr.Whereabouts)
					}
				}
			}
			for pid, want := range tc.sees {
				if v, ok := got[pid]; !ok || v != want {
					t.Errorf("%s: visible = %v (present %v), want whereabouts %v", pid, v, ok, want)
				}
			}
			for _, pid := range tc.forbidden {
				if _, ok := got[pid]; ok {
					t.Errorf("%s should not be visible", pid)
				}
			}
		})
	}

	t.Run("details can't be read directly either", func(t *testing.T) {
		var n int
		if err := f.db.AsUser(ctx, dave, func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `select count(*) from transaction_details`).Scan(&n)
		}); err != nil || n != 1 { // carl's only
			t.Fatalf("dave reads %d detail rows (%v), want 1", n, err)
		}
	})
}

func TestSpending(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	mk := func(id string, amount int64, primary, detailed string) plaid.Transaction {
		return plaid.Transaction{PlaidTransactionID: id, PlaidAccountID: "acct-a", AmountMinor: amount, Currency: "USD",
			Date: "2026-10-05", Name: id, CategoryPrimary: primary, CategoryDetailed: detailed}
	}
	res := plaid.SyncResult{Added: []plaid.Transaction{
		mk("g1", 1000, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
		mk("g2", 500, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"),
		mk("rent", 120000, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"),
		mk("pay", -300000, "INCOME", "INCOME_WAGES"),
		mk("xfer", 20000, "TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"),
		mk("card", 40000, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
		mk("car", 35000, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"), // a transfer too (#77)
		mk("refund", -200, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
		{PlaidTransactionID: "sept", PlaidAccountID: "acct-a", AmountMinor: 9999, Currency: "USD", Date: "2026-09-30", Name: "sept", CategoryPrimary: "TRAVEL"},
	}, NextCursor: "c"}
	if _, err := f.sys.SaveSync(ctx, syncItem(t, f, f.aliceItem), res); err != nil {
		t.Fatal(err)
	}
	got, err := f.db.Spending(ctx, alice, f.testHH, "2026-10")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Category != "RENT_AND_UTILITIES" || got[0].AmountMinor != 120000 ||
		got[1].Category != "FOOD_AND_DRINK" || got[1].AmountMinor != 1500 || got[1].Count != 2 {
		t.Fatalf("spending = %+v", got)
	}
	if none, _ := f.db.Spending(ctx, bob, f.testHH, "2026-10"); len(none) != 0 {
		t.Fatalf("bob sees spending in another household: %+v", none)
	}
	if _, err := f.db.Spending(ctx, alice, f.testHH, "2026-13"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bad month: err = %v", err)
	}
}

// Credit cards (#27): the sync saves limits and card details; whoever may see
// the card's balance sees them, nobody else; cards the bank drops go away.
func TestSaveCreditCards(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	limit, neg := int64(200000), int64(-5)
	res := plaid.SyncResult{Accounts: []plaid.Account{
		{PlaidAccountID: "acct-a", Name: "Checking", Type: "depository", Currency: "USD", CurrentMinor: ptr(int64(123456))},
		{PlaidAccountID: "card-a", Name: "Fake Card", Mask: "3333", Type: "credit", Subtype: "credit card", Currency: "USD", CurrentMinor: ptr(int64(41000)), LimitMinor: &limit},
		{PlaidAccountID: "card-b", Name: "Odd Card", Type: "credit", Currency: "USD", LimitMinor: &neg},
	}, NextCursor: "c"}
	if _, err := f.sys.SaveSync(ctx, syncItem(t, f, f.aliceItem), res); err != nil {
		t.Fatal(err)
	}
	item := syncItem(t, f, f.aliceItem)
	if item.LiabilitiesSyncedAt != nil {
		t.Fatal("card details were never fetched")
	}
	min, overdue := int64(2000), false
	cards := []plaid.CreditCard{
		{PlaidAccountID: "card-a", APRs: []plaid.APR{{Type: "purchase_apr", Percent: "15.24"}}, MinimumMinor: &min,
			NextDueDate: "2026-10-28", LastStatementDate: "2026-09-28", Overdue: &overdue},
		{PlaidAccountID: "card-b", APRs: []plaid.APR{}},
		{PlaidAccountID: "acct-b", APRs: []plaid.APR{}}, // bob's account, another bank: skipped
	}
	if err := f.sys.SaveCreditCards(ctx, item, cards, "shared"); err != nil {
		t.Fatal(err)
	}
	if syncItem(t, f, f.aliceItem).LiabilitiesSyncedAt == nil {
		t.Fatal("fetch time not recorded")
	}
	if n := f.count(t, alice, `select count(*) from credit_cards`); n != 2 {
		t.Fatalf("alice sees %d cards, want 2", n)
	}

	banks, err := f.db.Banks(ctx, alice, f.testHH)
	if err != nil {
		t.Fatal(err)
	}
	var card, odd *BankAccount
	for _, b := range banks {
		for i, a := range b.Accounts {
			switch a.Name {
			case "Fake Card":
				card = &b.Accounts[i]
			case "Odd Card":
				odd = &b.Accounts[i]
			}
		}
	}
	if card == nil || card.LimitMinor == nil || *card.LimitMinor != 200000 || card.Card == nil {
		t.Fatalf("card = %+v", card)
	}
	c := card.Card
	if len(c.APRs) != 1 || c.APRs[0].Percent != "15.24" || *c.MinimumMinor != 2000 || *c.NextDueDate != "2026-10-28" ||
		*c.LastStatementDate != "2026-09-28" || c.Overdue == nil || *c.Overdue {
		t.Fatalf("card details = %+v", c)
	}
	if odd == nil || odd.LimitMinor != nil {
		t.Fatalf("negative limit kept: %+v", odd)
	}

	// The daily balance refresh updates limits without a transaction sync.
	raised := int64(300000)
	if err := f.sys.SaveAccounts(ctx, item, []plaid.Account{
		{PlaidAccountID: "card-a", Name: "Fake Card", Mask: "3333", Type: "credit", Subtype: "credit card", Currency: "USD", CurrentMinor: ptr(int64(50000)), LimitMinor: &raised},
	}); err != nil {
		t.Fatal(err)
	}
	if n := f.count(t, alice, `select count(*) from accounts where plaid_account_id = 'card-a' and credit_limit_minor = 300000 and current_balance_minor = 50000`); n != 1 {
		t.Fatal("balance refresh didn't update the card")
	}

	// Same visibility as the balance: carl (child) and bob see none.
	if n := f.count(t, carl, `select count(*) from credit_cards`); n != 0 {
		t.Fatalf("carl sees %d of alice's cards", n)
	}
	if n := f.count(t, bob, `select count(*) from credit_cards`); n != 0 {
		t.Fatalf("bob sees %d cards from another household", n)
	}
	// Nobody but the sync writes them.
	if _, err := f.execAs(alice, `update credit_cards set minimum_payment_minor = 0`); err == nil {
		t.Fatal("alice could change card details")
	}

	// The bank stops reporting card-b: it goes; an empty answer clears all.
	if err := f.sys.SaveCreditCards(ctx, item, cards[:1], "shared"); err != nil {
		t.Fatal(err)
	}
	if n := f.count(t, alice, `select count(*) from credit_cards`); n != 1 {
		t.Fatalf("after card-b dropped: %d cards", n)
	}
	if err := f.sys.SaveCreditCards(ctx, item, nil, "consent_needed"); err != nil {
		t.Fatal(err)
	}
	if n := f.count(t, alice, `select count(*) from credit_cards`); n != 0 {
		t.Fatalf("after empty answer: %d cards", n)
	}
	// What the bank said is kept, and shown to whoever sees the bank (#51).
	banks, err = f.db.Banks(ctx, alice, f.testHH)
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range banks {
		if b.ID == f.aliceItem && (b.CardDetails == nil || *b.CardDetails != "consent_needed") {
			t.Fatalf("card details state = %v", b.CardDetails)
		}
	}
	if err := f.sys.SaveCreditCards(ctx, item, nil, "made_up"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unknown state: %v", err)
	}
}
