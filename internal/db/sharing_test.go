package db

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// Sharing rules (0007_sharing.sql, ADR 0007). All people and data are fake.
// The Test household: alice (owner), carl (child), dave (adult), mia (teen),
// rosa (viewer). bob owns another household.

const (
	mia  = "00000000-0000-4000-8000-0000000000e1"
	rosa = "00000000-0000-4000-8000-0000000000e2"
)

func addMember(t *testing.T, f *fixture, id, email, role string) {
	t.Helper()
	ctx := context.Background()
	mustExec(t, f.admin, `insert into auth.users (id, email) values ($1, $2)`, id, email)
	if err := f.db.AsUser(ctx, alice, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into household_members (household_id, user_id, role) values ($1, $2, $3)`, f.testHH, id, role)
		return err
	}); err != nil {
		t.Fatalf("add %s: %v", role, err)
	}
}

// sharingFamily sets up the full family, with alice's and carl's banks synced
// (one transaction each, with time and location).
func sharingFamily(t *testing.T) *fixture {
	t.Helper()
	f := setup(t)
	addDave(t, f)
	addMember(t, f, mia, "mia@example.test", "teen")
	addMember(t, f, rosa, "rosa@example.test", "viewer")
	ctx := context.Background()
	for _, b := range []struct{ item, txn, acct string }{{f.aliceItem, "txn-alice", "acct-a"}, {f.carlItem, "txn-carl", "acct-c"}} {
		if _, err := f.sys.SaveSync(ctx, syncItem(t, f, b.item), plaid.SyncResult{Added: []plaid.Transaction{whereaboutsTxn(b.txn, b.acct)}, NextCursor: "c"}); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

// sees reports what `viewer` can see of `owner`'s money right now.
func sees(t *testing.T, f *fixture, viewer, owner string) (balances, transactions, whereabouts bool) {
	t.Helper()
	ctx := context.Background()
	err := f.db.AsUser(ctx, viewer, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `select exists (select 1 from accounts where owner_user_id = $1)
			and exists (select 1 from plaid_items where owner_user_id = $1)`, owner).Scan(&balances); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `select exists (select 1 from transactions t
			where t.account_id in (select id from accounts where owner_user_id = $1)
			   or t.plaid_transaction_id = case $1::uuid when '`+alice+`' then 'txn-alice' when '`+carl+`' then 'txn-carl' end)`, owner).Scan(&transactions); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `select exists (select 1 from transaction_details d join transactions t on t.id = d.transaction_id
			where t.plaid_transaction_id = case $1::uuid when '`+alice+`' then 'txn-alice' when '`+carl+`' then 'txn-carl' end)`, owner).Scan(&whereabouts)
	})
	if err != nil {
		t.Fatalf("sees(%s, %s): %v", viewer, owner, err)
	}
	return
}

func want(t *testing.T, f *fixture, viewer, owner string, wb, wt, ww bool) {
	t.Helper()
	b, tr, w := sees(t, f, viewer, owner)
	if b != wb || tr != wt || w != ww {
		t.Fatalf("viewer %s, owner %s: balances %v transactions %v whereabouts %v; want %v %v %v", viewer[len(viewer)-2:], owner[len(owner)-2:], b, tr, w, wb, wt, ww)
	}
}

func TestDefaultVisibility(t *testing.T) {
	f := sharingFamily(t)
	cases := []struct {
		name          string
		viewer, owner string
		b, tr, w      bool
	}{
		{"alice sees her own", alice, alice, true, true, true},
		{"alice (owner) sees her child automatically", alice, carl, true, true, true},
		{"dave (adult) sees the child automatically", dave, carl, true, true, true},
		{"dave (adult) sees nothing of alice until she shares", dave, alice, false, false, false},
		{"rosa (viewer) sees nothing of alice", rosa, alice, false, false, false},
		{"rosa (viewer) sees nothing of the child either", rosa, carl, false, false, false},
		{"mia (teen) sees nothing of alice", mia, alice, false, false, false},
		{"mia (teen) sees nothing of her brother", mia, carl, false, false, false},
		{"carl (child) sees his own", carl, carl, true, true, true},
		{"carl (child) sees nothing of alice", carl, alice, false, false, false},
		{"bob (other household) sees nothing", bob, alice, false, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) { want(t, f, tc.viewer, tc.owner, tc.b, tc.tr, tc.w) })
	}
}

func TestSharingStepByStep(t *testing.T) {
	f := sharingFamily(t)
	ctx := context.Background()
	set := func(cats ...string) {
		t.Helper()
		if err := f.db.SetSharing(ctx, alice, f.testHH, dave, cats); err != nil {
			t.Fatalf("SetSharing(%v): %v", cats, err)
		}
	}

	set(ShareBalances)
	want(t, f, dave, alice, true, false, false)

	set(ShareBalances, ShareTransactions)
	want(t, f, dave, alice, true, true, false)
	if got, _ := f.db.Spending(ctx, dave, f.testHH, "2026-10"); len(got) == 0 {
		t.Fatal("shared transactions should count in dave's spending")
	}

	set(ShareBalances, ShareTransactions, ShareWhereabouts)
	want(t, f, dave, alice, true, true, true)

	// Transactions without balances: dave sees them, not the accounts.
	set(ShareTransactions)
	want(t, f, dave, alice, false, true, false)
	list, _, err := f.db.Transactions(ctx, dave, f.testHH, TxFilter{})
	if err != nil || !slices.ContainsFunc(list, func(tr Transaction) bool { return tr.Merchant == "Fake Grocer" && tr.AccountName == "" }) {
		t.Fatalf("dave should see alice's transaction without its account: %+v, %v", list, err)
	}

	// Revoking takes effect at once.
	set()
	want(t, f, dave, alice, false, false, false)

	// Sharing with dave doesn't share with rosa.
	set(ShareBalances, ShareTransactions)
	want(t, f, rosa, alice, false, false, false)
}

func TestWhereaboutsNeedTransactions(t *testing.T) {
	f := sharingFamily(t)
	ctx := context.Background()
	if err := f.db.SetSharing(ctx, alice, f.testHH, dave, []string{ShareWhereabouts}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("whereabouts alone: err = %v, want ErrInvalid", err)
	}
	// Even if a whereabouts row got in on its own, it shows nothing.
	mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'whereabouts')`, f.testHH, alice, dave)
	want(t, f, dave, alice, false, false, false)
}

func TestSharingIsTheOwnersChoice(t *testing.T) {
	f := sharingFamily(t)
	ctx := context.Background()

	t.Run("can't share someone else's money", func(t *testing.T) {
		err := f.db.AsUser(ctx, dave, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'balances')`, f.testHH, alice, dave)
			return err
		})
		if pgCode(err) != "42501" {
			t.Fatalf("err = %v, want permission denied", err)
		}
	})
	t.Run("can't remove someone else's share", func(t *testing.T) {
		if err := f.db.SetSharing(ctx, alice, f.testHH, dave, []string{ShareBalances}); err != nil {
			t.Fatal(err)
		}
		var n int64
		if err := f.db.AsUser(ctx, dave, func(tx pgx.Tx) error {
			tag, err := tx.Exec(ctx, `delete from shares where owner_user_id = $1`, alice)
			n = tag.RowsAffected()
			return err
		}); err != nil || n != 0 {
			t.Fatalf("dave deleted %d of alice's shares (%v)", n, err)
		}
		want(t, f, dave, alice, true, false, false)
	})
	t.Run("can't share with a teen or child", func(t *testing.T) {
		for _, kid := range []string{mia, carl} {
			if err := f.db.SetSharing(ctx, alice, f.testHH, kid, []string{ShareBalances}); !errors.Is(err, ErrForbidden) {
				t.Fatalf("err = %v, want ErrForbidden", err)
			}
		}
	})
	t.Run("can't share with someone outside the household", func(t *testing.T) {
		if err := f.db.SetSharing(ctx, alice, f.testHH, bob, []string{ShareBalances}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("err = %v, want ErrInvalid", err)
		}
	})
	t.Run("can't share with yourself", func(t *testing.T) {
		if err := f.db.SetSharing(ctx, alice, f.testHH, alice, []string{ShareBalances}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("err = %v, want ErrInvalid", err)
		}
	})
	t.Run("a non-member can't share into the household", func(t *testing.T) {
		if err := f.db.SetSharing(ctx, bob, f.testHH, dave, []string{ShareBalances}); !errors.Is(err, ErrForbidden) && !errors.Is(err, ErrInvalid) {
			t.Fatalf("err = %v, want refusal", err)
		}
	})
	t.Run("a teen can share with a viewer, and it works", func(t *testing.T) {
		if err := f.db.SetSharing(ctx, mia, f.testHH, rosa, []string{ShareBalances}); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("a share given to a teen has no effect", func(t *testing.T) {
		mustExec(t, f.admin, `insert into shares (household_id, owner_user_id, viewer_user_id, category) values ($1, $2, $3, 'balances'), ($1, $2, $3, 'transactions')`, f.testHH, alice, mia)
		want(t, f, mia, alice, false, false, false)
	})
	t.Run("unknown categories are refused", func(t *testing.T) {
		if err := f.db.SetSharing(ctx, alice, f.testHH, dave, []string{"passwords"}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("err = %v", err)
		}
	})
}

func TestSharingScreenData(t *testing.T) {
	f := sharingFamily(t)
	ctx := context.Background()
	if err := f.db.SetDisplayName(ctx, alice, " Alice "); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetSharing(ctx, alice, f.testHH, dave, []string{ShareBalances, ShareTransactions}); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetSharing(ctx, dave, f.testHH, alice, []string{ShareBalances}); err != nil {
		t.Fatal(err)
	}

	s, err := f.db.Sharing(ctx, alice, f.testHH)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Members) != 5 || !s.Members[0].IsYou || s.Members[0].DisplayName != "Alice" {
		t.Fatalf("members = %+v", s.Members)
	}
	if !slices.Equal(s.Given[dave], []string{"balances", "transactions"}) || !slices.Equal(s.Received[dave], []string{"balances"}) {
		t.Fatalf("given %v, received %v", s.Given, s.Received)
	}

	// rosa sees neither direction of alice and dave's sharing.
	r, err := f.db.Sharing(ctx, rosa, f.testHH)
	if err != nil || len(r.Given) != 0 || len(r.Received) != 0 {
		t.Fatalf("rosa sees %+v (%v)", r, err)
	}
	if _, err := f.db.Sharing(ctx, bob, f.testHH); !errors.Is(err, ErrForbidden) {
		t.Fatalf("bob: err = %v, want ErrForbidden", err)
	}
}

func TestLeavingRemovesShares(t *testing.T) {
	f := sharingFamily(t)
	ctx := context.Background()
	if err := f.db.SetSharing(ctx, alice, f.testHH, dave, []string{ShareBalances}); err != nil {
		t.Fatal(err)
	}
	if err := f.db.AsUser(ctx, dave, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `delete from household_members where household_id = $1 and user_id = $2`, f.testHH, dave)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = f.admin.QueryRow(ctx, `select count(*) from shares where viewer_user_id = $1`, dave).Scan(&n)
	if n != 0 {
		t.Fatalf("%d shares left after dave left", n)
	}
}

func TestUnlinkRules(t *testing.T) {
	f := sharingFamily(t)
	ctx := context.Background()
	daveItem, err := f.db.LinkBank(ctx, dave, f.testHH, newBank("item-dave"))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name       string
		user, item string
		allowed    bool
	}{
		{"you unlink your own", dave, daveItem, true},
		{"an owner unlinks a child's", alice, f.carlItem, true},
		{"an owner can't unlink a partner's", alice, daveItem, false},
		{"an adult can't unlink a child's", dave, f.carlItem, false},
		{"an adult can't unlink the owner's", dave, f.aliceItem, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := f.db.UnlinkTarget(ctx, tc.user, tc.item)
			if tc.allowed != (err == nil) {
				t.Fatalf("err = %v, allowed %v", err, tc.allowed)
			}
		})
	}
	// Even when dave can see alice's bank (shared), he can't unlink it.
	if err := f.db.SetSharing(ctx, alice, f.testHH, dave, []string{ShareBalances}); err != nil {
		t.Fatal(err)
	}
	banks, _ := f.db.Banks(ctx, dave, f.testHH)
	for _, b := range banks {
		if b.ID == f.aliceItem && b.CanUnlink {
			t.Fatal("dave sees an Unlink option on alice's shared bank")
		}
	}
	if err := f.db.DeleteBank(ctx, dave, f.aliceItem); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete: err = %v", err)
	}
}
