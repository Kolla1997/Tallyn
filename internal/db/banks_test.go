package db

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

// All data below is fake. Needs TALLYN_TEST_DATABASE_URL (see db_test.go).

const dave = "00000000-0000-4000-8000-00000000000d" // adult in the Test household

func addDave(t *testing.T, f *fixture) {
	t.Helper()
	ctx := context.Background()
	mustExec(t, f.admin, `insert into auth.users (id, email) values ($1, 'dave@example.test')`, dave)
	if err := f.db.AsUser(ctx, alice, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into household_members (household_id, user_id, role) values ($1, $2, 'adult')`, f.testHH, dave)
		return err
	}); err != nil {
		t.Fatalf("alice adds dave: %v", err)
	}
}

type fakeAccount struct {
	PlaidAccountID string `json:"plaid_account_id"`
	Name           string `json:"name"`
	Mask           string `json:"mask,omitempty"`
	Type           string `json:"type"`
	Currency       string `json:"currency"`
	CurrentMinor   *int64 `json:"current_balance_minor"`
	AvailableMinor *int64 `json:"available_balance_minor"`
}

// sealed stands in for a tokencrypt ciphertext: version + nonce + tag + body.
var sealed = append([]byte{1}, bytes.Repeat([]byte{0xAB}, 40)...)

func newBank(itemID string, accounts ...fakeAccount) NewBank {
	if accounts == nil {
		bal := int64(123456)
		accounts = []fakeAccount{{PlaidAccountID: "acct-" + itemID, Name: "Checking", Mask: "0000", Type: "depository", Currency: "USD", CurrentMinor: &bal}}
	}
	return NewBank{PlaidItemID: itemID, AccessTokenSealed: sealed, InstitutionID: "ins_fake", InstitutionName: "Fake Bank", Accounts: accounts}
}

func TestLinkBank(t *testing.T) {
	f := setup(t)
	addDave(t, f)
	ctx := context.Background()

	t.Run("owner links for themselves", func(t *testing.T) {
		id, err := f.db.LinkBank(ctx, alice, f.testHH, newBank("item-alice-2"))
		if err != nil {
			t.Fatal(err)
		}
		var owner string
		var bal int64
		_ = f.admin.QueryRow(ctx, `select i.owner_user_id, a.current_balance_minor from plaid_items i join accounts a on a.plaid_item_id = i.id where i.id = $1`, id).Scan(&owner, &bal)
		if owner != alice || bal != 123456 {
			t.Fatalf("owner = %s, balance = %d", owner, bal)
		}
	})
	t.Run("adult links for themselves", func(t *testing.T) {
		if _, err := f.db.LinkBank(ctx, dave, f.testHH, newBank("item-dave")); err != nil {
			t.Fatal(err)
		}
	})
	for name, tc := range map[string]struct{ user, hh string }{
		"child can't link":                      {carl, f.testHH},
		"non-member can't link":                 {bob, f.testHH},
		"owner can't link in another household": {alice, f.otherHH},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := f.db.LinkBank(ctx, tc.user, tc.hh, newBank("item-x")); !errors.Is(err, ErrForbidden) {
				t.Fatalf("err = %v, want ErrForbidden", err)
			}
		})
	}
	t.Run("same Plaid item twice", func(t *testing.T) {
		if _, err := f.db.LinkBank(ctx, alice, f.testHH, newBank("item-alice-2")); !errors.Is(err, ErrAlreadyLinked) {
			t.Fatalf("err = %v, want ErrAlreadyLinked", err)
		}
	})

	bad := map[string]NewBank{
		"no accounts":      {PlaidItemID: "item-b1", AccessTokenSealed: sealed, Accounts: []fakeAccount{}},
		"token too short":  {PlaidItemID: "item-b2", AccessTokenSealed: []byte{1, 2, 3}, Accounts: newBank("b2").Accounts},
		"no token":         {PlaidItemID: "item-b3", Accounts: newBank("b3").Accounts},
		"empty item ID":    newBank(""),
		"bad currency":     newBank("item-b4", fakeAccount{PlaidAccountID: "b4", Name: "X", Type: "depository", Currency: "us dollars"}),
		"account no name":  newBank("item-b5", fakeAccount{PlaidAccountID: "b5", Type: "depository", Currency: "USD"}),
		"full card number": newBank("item-b6", fakeAccount{PlaidAccountID: "b6", Name: "X", Mask: "4111111111111111", Type: "credit", Currency: "USD"}),
	}
	for name, b := range bad {
		t.Run("rejects "+name, func(t *testing.T) {
			if _, err := f.db.LinkBank(ctx, alice, f.testHH, b); !errors.Is(err, ErrInvalid) {
				t.Fatalf("err = %v, want ErrInvalid", err)
			}
		})
	}

	t.Run("a failed link leaves nothing behind", func(t *testing.T) {
		var n int
		_ = f.admin.QueryRow(ctx, `select count(*) from plaid_items where plaid_item_id in ('item-b1', 'item-b2', 'item-b3', 'item-b4', 'item-b5', 'item-b6', 'item-x', '')`).Scan(&n)
		if n != 0 {
			t.Fatalf("%d half-saved items", n)
		}
	})

	t.Run("link_plaid_item isn't callable without signing in", func(t *testing.T) {
		_, err := f.admin.Exec(ctx, `set role anon`)
		if err != nil {
			t.Fatal(err)
		}
		defer f.admin.Exec(ctx, `reset role`)
		_, err = f.admin.Exec(ctx, `select public.link_plaid_item($1, 'item-anon', '\x00', null, null, '[]'::jsonb)`, f.testHH)
		if pgCode(err) != "42501" {
			t.Fatalf("err = %v, want permission denied", err)
		}
	})
}

func TestBanks(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	alices, err := f.db.Banks(ctx, alice, f.testHH)
	if err != nil {
		t.Fatal(err)
	}
	if len(alices) != 2 {
		t.Fatalf("alice (owner) sees %d banks, want 2", len(alices))
	}
	for _, b := range alices {
		if !b.CanUnlink || len(b.Accounts) != 1 || b.Accounts[0].CurrentMinor == nil {
			t.Fatalf("alice's view: %+v", b)
		}
	}

	carls, err := f.db.Banks(ctx, carl, f.testHH)
	if err != nil {
		t.Fatal(err)
	}
	if len(carls) != 1 || carls[0].ID != f.carlItem || !carls[0].CanUnlink {
		t.Fatalf("carl (child) should see only his own bank: %+v", carls)
	}

	if bobs, _ := f.db.Banks(ctx, bob, f.testHH); len(bobs) != 0 {
		t.Fatalf("bob sees %d banks in another household", len(bobs))
	}
	if none, err := f.db.Banks(ctx, alice, "not-a-uuid"); err != nil || len(none) != 0 {
		t.Fatalf("bad ID: %v, %v", none, err)
	}
}

func TestUnlink(t *testing.T) {
	f := setup(t)
	addDave(t, f)
	ctx := context.Background()

	t.Run("linker gets the encrypted token", func(t *testing.T) {
		item, tok, err := f.db.UnlinkTarget(ctx, carl, f.carlItem)
		if err != nil || item != "item-c" || !bytes.Equal(tok, []byte{0xde, 0xad, 0xbe, 0xef}) {
			t.Fatalf("got %q %x %v", item, tok, err)
		}
	})
	t.Run("owner may unlink a member's bank", func(t *testing.T) {
		if _, _, err := f.db.UnlinkTarget(ctx, alice, f.carlItem); err != nil {
			t.Fatal(err)
		}
	})
	for name, tc := range map[string]struct{ user, item string }{
		"child can't unlink the owner's bank": {carl, f.aliceItem},
		"adult can't unlink someone else's":   {dave, f.aliceItem},
		"other household can't":               {bob, f.aliceItem},
		"not a UUID":                          {alice, "nope"},
		"unknown ID":                          {alice, "00000000-0000-4000-8000-0000000000ff"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, tok, err := f.db.UnlinkTarget(ctx, tc.user, tc.item); !errors.Is(err, ErrNotFound) || tok != nil {
				t.Fatalf("err = %v, token = %x; want ErrNotFound and no token", err, tok)
			}
			if err := f.db.DeleteBank(ctx, tc.user, tc.item); !errors.Is(err, ErrNotFound) {
				t.Fatalf("DeleteBank: err = %v, want ErrNotFound", err)
			}
		})
	}
	t.Run("delete removes the bank and its accounts", func(t *testing.T) {
		if err := f.db.DeleteBank(ctx, carl, f.carlItem); err != nil {
			t.Fatal(err)
		}
		var n int
		_ = f.admin.QueryRow(ctx, `select count(*) from accounts where plaid_item_id = $1`, f.carlItem).Scan(&n)
		if n != 0 {
			t.Fatalf("%d accounts left", n)
		}
	})
}

func TestCreateHousehold(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	h, err := f.db.CreateHousehold(ctx, carl, "Carl's place", "usd")
	if err != nil || h.Role != "owner" || h.HomeCurrency != "USD" || h.ID == "" {
		t.Fatalf("got %+v, %v", h, err)
	}
	me, _ := f.db.Me(ctx, carl)
	if len(me.Households) != 2 {
		t.Fatalf("carl is in %d households, want 2", len(me.Households))
	}
	for name, args := range map[string][2]string{
		"bad currency": {"Home", "dollars"},
		"empty name":   {"", "USD"},
	} {
		if _, err := f.db.CreateHousehold(ctx, carl, args[0], args[1]); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if ok, _ := f.db.CanLink(ctx, carl, h.ID); !ok {
		t.Fatal("the new owner should be able to link")
	}
	if ok, _ := f.db.CanLink(ctx, carl, f.testHH); ok {
		t.Fatal("carl is a child in the Test household and can't link there")
	}
}
