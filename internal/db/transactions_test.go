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

// Summary (#58): totals over every matching transaction, same rules as the
// spending card, same filters and visibility as the list.
func TestTransactionSummary(t *testing.T) {
	f := setup(t)
	seedTxns(t, f)
	ctx := context.Background()
	extra := []plaid.Transaction{
		{PlaidTransactionID: "a-save", PlaidAccountID: "acct-a", AmountMinor: 5000, Currency: "USD", Date: "2026-10-10", Name: "Move to savings", CategoryPrimary: "TRANSFER_OUT"},
		{PlaidTransactionID: "a-card", PlaidAccountID: "acct-a", AmountMinor: 2500, Currency: "USD", Date: "2026-10-10", Name: "Card payment", CategoryPrimary: "LOAN_PAYMENTS", CategoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"},
		{PlaidTransactionID: "a-car", PlaidAccountID: "acct-a", AmountMinor: 30000, Currency: "USD", Date: "2026-10-10", Name: "Car loan", CategoryPrimary: "LOAN_PAYMENTS", CategoryDetailed: "LOAN_PAYMENTS_CAR_PAYMENT"},
		{PlaidTransactionID: "a-pay", PlaidAccountID: "acct-a", AmountMinor: -100000, Currency: "USD", Date: "2026-10-11", Name: "Payroll", CategoryPrimary: "INCOME"},
		{PlaidTransactionID: "a-refund", PlaidAccountID: "acct-a", AmountMinor: -500, Currency: "USD", Date: "2026-10-12", Name: "Fresh Market", MerchantName: "Fresh Market", CategoryPrimary: "FOOD_AND_DRINK"},
	}
	if _, err := f.sys.SaveSync(ctx, syncItem(t, f, f.aliceItem), plaid.SyncResult{Added: extra, NextCursor: "c2"}); err != nil {
		t.Fatal(err)
	}
	sum := func(user string, flt TxFilter) TxSummary {
		t.Helper()
		got, err := f.db.Summary(ctx, user, f.testHH, flt)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 1 || got[0].Currency != "USD" {
			t.Fatalf("summary = %+v, want one USD summary", got)
		}
		return got[0]
	}

	// October for alice: her nine seeded purchases (1001..1009 cents) and
	// carl's Book Barn (1003), as a parent.
	oct := sum(alice, TxFilter{Month: "2026-10"})
	if oct.SpentMinor != 9045+1003 {
		t.Errorf("spent = %d, want %d", oct.SpentMinor, 9045+1003)
	}
	if oct.MoneyInMinor != 100000+500 {
		t.Errorf("money in = %d, want payroll plus the refund", oct.MoneyInMinor)
	}
	if oct.TransfersMinor != 5000+2500+30000 {
		t.Errorf("transfers = %d, want the savings move, the card payment and the car loan (#77)", oct.TransfersMinor)
	}
	if len(oct.Categories) != 3 || oct.Categories[0].Category != "FOOD_AND_DRINK" || oct.Categories[0].AmountMinor != 7028+1009 || oct.Categories[0].Count != 8 {
		t.Errorf("categories = %+v", oct.Categories)
	}
	if len(oct.Merchants) == 0 || oct.Merchants[0].Merchant != "Fresh Market" || oct.Merchants[0].AmountMinor != 7028 || oct.Merchants[0].Count != 7 {
		t.Errorf("top merchant = %+v, want Fresh Market 7028 x7 (the refund isn't spending)", oct.Merchants)
	}

	// Filters narrow the totals exactly as they narrow the list.
	if s := sum(alice, TxFilter{Month: "2026-10", Owner: carl}); s.SpentMinor != 1003 || s.MoneyInMinor != 0 {
		t.Errorf("carl only: %+v", s)
	}
	if s := sum(alice, TxFilter{Month: "2026-10", Category: "TRANSPORTATION"}); s.SpentMinor != 1008 || len(s.Merchants) != 1 || s.Merchants[0].Merchant != "Uber" {
		t.Errorf("transportation: %+v", s)
	}
	if s := sum(alice, TxFilter{Query: "fresh"}); s.SpentMinor != 7028 || s.MoneyInMinor != 500 {
		t.Errorf("search fresh: %+v", s)
	}

	// Visibility: carl (a child) sees only his own; bob, in another household, nothing.
	if s := sum(carl, TxFilter{Month: "2026-10"}); s.SpentMinor != 1003 {
		t.Errorf("carl sees spent %d, want only his own 1003", s.SpentMinor)
	}
	if got, err := f.db.Summary(ctx, bob, f.testHH, TxFilter{}); err != nil || len(got) != 0 {
		t.Errorf("bob: %+v %v, want nothing", got, err)
	}
	if _, err := f.db.Summary(ctx, alice, f.testHH, TxFilter{Month: "2026-13"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("bad month: %v, want ErrInvalid", err)
	}
}

// Year of dots (#75): spending per day with the top purchases, the same
// filters and visibility as the list, and a day filter.
func TestDailyAndDayFilter(t *testing.T) {
	f := setup(t)
	seedTxns(t, f)
	ctx := context.Background()

	got, err := f.db.Daily(ctx, alice, f.testHH, TxFilter{Year: "2026"})
	if err != nil {
		t.Fatal(err)
	}
	byDay := map[string]DaySpend{}
	for _, d := range got {
		byDay[d.Date] = d
	}
	// Setup's two Fake Grocer rows (alice's and carl's, 1999 each) are on Jan 2.
	if d := byDay["2026-01-02"]; d.AmountMinor != 3998 || d.Count != 2 || len(d.Top) != 2 {
		t.Errorf("Jan 2 = %+v, want 3998 over 2 purchases", d)
	}
	// Oct 3: alice's Fresh Market (1003) and carl's Book Barn (1003), seen as a parent.
	if d := byDay["2026-10-03"]; d.AmountMinor != 2006 || d.Count != 2 {
		t.Errorf("Oct 3 = %+v, want 2006 over 2", d)
	}
	if d := byDay["2026-10-08"]; d.AmountMinor != 1008 || len(d.Top) != 1 || d.Top[0].Merchant != "Uber" {
		t.Errorf("Oct 8 = %+v, want Uber 1008", d)
	}
	if _, ok := byDay["2026-10-10"]; ok {
		t.Error("a day with no spending should be left out")
	}

	// Filters narrow it like the list: only carl's.
	carls, _ := f.db.Daily(ctx, alice, f.testHH, TxFilter{Year: "2026", Owner: carl})
	for _, d := range carls {
		if d.Date != "2026-01-02" && d.Date != "2026-10-03" {
			t.Errorf("carl only: unexpected day %s", d.Date)
		}
	}
	// Visibility: carl (a child) sees only his own.
	own, _ := f.db.Daily(ctx, carl, f.testHH, TxFilter{Year: "2026"})
	for _, d := range own {
		if d.AmountMinor != 1999 && d.AmountMinor != 1003 {
			t.Errorf("carl sees %+v, want only his own", d)
		}
	}
	for name, flt := range map[string]TxFilter{
		"no year":        {},
		"bad year":       {Year: "1999"},
		"year and month": {Year: "2026", Month: "2026-10"},
	} {
		if _, err := f.db.Daily(ctx, alice, f.testHH, flt); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}

	// Day filter on the list: Oct 3 has 2 rows; Day wins over Month.
	list, _, err := f.db.Transactions(ctx, alice, f.testHH, TxFilter{Day: "2026-10-03", Month: "2026-01"})
	if err != nil || len(list) != 2 {
		t.Errorf("day Oct 3: %d rows, %v; want 2", len(list), err)
	}
	if _, _, err := f.db.Transactions(ctx, alice, f.testHH, TxFilter{Day: "2026-13-01"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("bad day: %v, want ErrInvalid", err)
	}
}

// Bank filter (#83): only that bank's transactions, with the same totals; the
// bank name comes with each row. A bank you can't see matches nothing, and
// a row whose account is hidden carries no bank.
func TestBankFilter(t *testing.T) {
	f := setup(t)
	seedTxns(t, f)
	ctx := context.Background()
	list := func(user string, flt TxFilter) []Transaction {
		t.Helper()
		got, _, err := f.db.Transactions(ctx, user, f.testHH, flt)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}

	// alice's bank: her nine seeded purchases and the fixture's grocery run.
	mine := list(alice, TxFilter{Bank: f.aliceItem})
	if len(mine) != 10 {
		t.Fatalf("alice's bank: %d rows, want 10", len(mine))
	}
	for _, tx := range mine {
		if tx.OwnerUserID != alice || tx.BankName == nil || *tx.BankName != "Fake Bank" {
			t.Fatalf("row = %+v", tx)
		}
	}
	// carl's bank, seen by alice as a parent; combines with other filters.
	if n := len(list(alice, TxFilter{Bank: f.carlItem})); n != 2 {
		t.Fatalf("carl's bank: %d rows, want 2", n)
	}
	if n := len(list(alice, TxFilter{Bank: f.aliceItem, Query: "uber"})); n != 1 {
		t.Fatalf("alice's bank + uber: %d rows", n)
	}
	// The summary follows the filter.
	sum, err := f.db.Summary(ctx, alice, f.testHH, TxFilter{Bank: f.carlItem, Month: "2026-10"})
	if err != nil || len(sum) != 1 || sum[0].SpentMinor != 1003 {
		t.Fatalf("summary = %+v, %v", sum, err)
	}
	// carl (child) can't see alice's bank: nothing, not an error.
	if n := len(list(carl, TxFilter{Bank: f.aliceItem})); n != 0 {
		t.Fatalf("carl filtered by alice's bank: %d rows", n)
	}
	if _, _, err := f.db.Transactions(ctx, alice, f.testHH, TxFilter{Bank: "not-a-bank"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bad bank: %v", err)
	}
}

// Shared transactions without balances (#83): dave sees alice's rows, but not
// her bank, and can't filter by it.
func TestBankHiddenWithoutBalances(t *testing.T) {
	f := sharingFamily(t)
	ctx := context.Background()
	mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'transactions')`, f.testHH, alice, dave)
	got, _, err := f.db.Transactions(ctx, dave, f.testHH, TxFilter{Owner: alice})
	if err != nil || len(got) == 0 {
		t.Fatalf("dave sees %d of alice's transactions, %v", len(got), err)
	}
	for _, tx := range got {
		if tx.BankName != nil || tx.AccountMask != nil {
			t.Fatalf("bank shown without balances: %+v", tx)
		}
	}
	if byBank, _, _ := f.db.Transactions(ctx, dave, f.testHH, TxFilter{Bank: f.aliceItem}); len(byBank) != 0 {
		t.Fatalf("dave filtered by alice's hidden bank: %d rows", len(byBank))
	}
}
