package db

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// Download your data (#54): only the person's own rows. Alice is an owner, so
// RLS lets her read Carl's (her child's) bank and spending, and Carl shares
// nothing back; none of that may reach her file. All data is fake.
func TestExportOnlyYours(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	var aliceTxn string
	if err := f.admin.QueryRow(ctx, `select t.id from transactions t join accounts a on a.id = t.account_id where a.owner_user_id = $1`, alice).Scan(&aliceTxn); err != nil {
		t.Fatal(err)
	}
	mustExec(t, f.admin, `insert into transaction_details (transaction_id, city, region) values ($1, 'Faketown', 'TX')`, aliceTxn)
	mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'balances')`, f.testHH, alice, carl)
	mustExec(t, f.admin, `insert into budgets (household_id, member_user_id, category, period, amount_minor, currency, created_by)
		values ($1, null, 'FOOD_AND_DRINK', 'month', 50000, 'USD', $2), ($1, $3, null, 'week', 2000, 'USD', $2)`, f.testHH, alice, carl)
	mustExec(t, f.admin, `insert into consents (user_id, document, version) values ($1, 'terms', '2026-10-01'), ($2, 'terms', '2026-10-01')`, alice, carl)
	mustExec(t, f.admin, `update profiles set display_name = 'Carl' where id = $1`, carl)
	mustExec(t, f.admin, `insert into goals (household_id, owner_user_id, name, target_minor, currency, visibility, saved_minor) values ($1, $2, 'Beach trip', 500000, 'USD', 'everyone', 340000), ($1, $3, 'Carl''s laptop', 90000, 'USD', 'me', 0)`, f.testHH, alice, carl)

	if n := f.count(t, alice, `select count(*) from transactions`); n != 2 {
		t.Fatalf("setup: alice should be able to read 2 transactions (hers and Carl's), got %d", n)
	}

	e, err := f.db.Export(ctx, alice)
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	if len(e.Households) != 1 || e.Households[0].Name != "Test household" || e.Households[0].Role != "owner" {
		t.Errorf("households = %+v", e.Households)
	}
	if len(e.Banks) != 1 || len(e.Accounts) != 1 || len(e.Transactions) != 1 {
		t.Fatalf("banks, accounts, transactions = %d, %d, %d; want only alice's 1, 1, 1", len(e.Banks), len(e.Accounts), len(e.Transactions))
	}
	if tx := e.Transactions[0]; tx.AmountMinor != 1999 || tx.City == nil || *tx.City != "Faketown" {
		t.Errorf("transaction = %+v", tx)
	}
	if len(e.Sharing) != 1 || e.Sharing[0].SharedWith != "Carl" || e.Sharing[0].What != "balances" {
		t.Errorf("sharing = %+v", e.Sharing)
	}
	if len(e.Budgets) != 2 || e.Budgets[0].For != "household" || e.Budgets[1].For != "Carl" || e.Budgets[1].Category != nil {
		t.Errorf("budgets = %+v", e.Budgets)
	}
	if len(e.Goals) != 1 || e.Goals[0].Name != "Beach trip" || e.Goals[0].SavedMinor != 340000 {
		t.Errorf("goals = %+v, want only alice's own", e.Goals)
	}
	if len(e.Agreements) != 1 {
		t.Errorf("agreements = %+v, want only alice's", e.Agreements)
	}

	// Nothing secret or internal: no tokens, Plaid ids or cursors.
	raw, _ := json.Marshal(e)
	for _, banned := range []string{"deadbeef", "item-", "acct-", "txn-", "access_token", "cursor", "code_hash", carl} {
		if strings.Contains(string(raw), banned) {
			t.Errorf("export contains %q", banned)
		}
	}

	// Carl's own file has his bank and nothing of Alice's.
	c, err := f.db.Export(ctx, carl)
	if err != nil {
		t.Fatalf("Export carl: %v", err)
	}
	if len(c.Accounts) != 1 || len(c.Transactions) != 1 || len(c.Sharing) != 0 || len(c.Budgets) != 0 {
		t.Errorf("carl's export = %d accounts, %d transactions, %d shares, %d budgets", len(c.Accounts), len(c.Transactions), len(c.Sharing), len(c.Budgets))
	}
}
