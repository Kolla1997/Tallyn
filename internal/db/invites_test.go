package db

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"
)

// Invitations and members (0008_invites.sql, ADR 0008). All people are fake.

const (
	erin = "00000000-0000-4000-8000-0000000000f1" // signed up, confirmed email, not a member yet
	fay  = "00000000-0000-4000-8000-0000000000f2" // signed up, email NOT confirmed
)

func inviteFixture(t *testing.T) *fixture {
	t.Helper()
	f := setup(t)
	addDave(t, f)
	mustExec(t, f.admin, `insert into auth.users (id, email) values ($1, 'erin@example.test')`, erin)
	mustExec(t, f.admin, `insert into auth.users (id, email, email_confirmed_at) values ($1, 'fay@example.test', null)`, fay)
	return f
}

func isMember(t *testing.T, f *fixture, hh, user string) (role string) {
	t.Helper()
	_ = f.admin.QueryRow(context.Background(), `select role from household_members where household_id = $1 and user_id = $2`, hh, user).Scan(&role)
	return role
}

func TestInviteAndJoin(t *testing.T) {
	f := inviteFixture(t)
	ctx := context.Background()

	inv, token, err := f.db.CreateInvite(ctx, alice, f.testHH, " Erin@Example.TEST ", "adult")
	if err != nil {
		t.Fatal(err)
	}
	if inv.Email != "erin@example.test" || inv.Role != "adult" || len(token) != 43 {
		t.Fatalf("invite = %+v, token length %d", inv, len(token))
	}

	t.Run("the token itself is never stored", func(t *testing.T) {
		var stored []byte
		_ = f.admin.QueryRow(ctx, `select token_hash from household_invites where id = $1`, inv.ID).Scan(&stored)
		if len(stored) != 32 || bytes.Contains([]byte(token), stored) {
			t.Fatalf("stored %x", stored)
		}
		var n int
		_ = f.admin.QueryRow(ctx, `select count(*) from household_invites where encode(token_hash, 'escape') like '%' || $1 || '%'`, token).Scan(&n)
		if n != 0 {
			t.Fatal("token found in the table")
		}
	})
	t.Run("owners see the open invite, without its token", func(t *testing.T) {
		list, err := f.db.Invites(ctx, alice, f.testHH)
		if err != nil || len(list) != 1 || list[0].ID != inv.ID {
			t.Fatalf("list = %+v, %v", list, err)
		}
		if list, _ := f.db.Invites(ctx, dave, f.testHH); len(list) != 0 {
			t.Fatal("an adult sees invites")
		}
	})
	t.Run("someone else can't use the link", func(t *testing.T) {
		for _, u := range []string{bob, dave} {
			if _, err := f.db.AcceptInvite(ctx, u, token); !errors.Is(err, ErrInviteInvalid) {
				t.Fatalf("err = %v, want ErrInviteInvalid", err)
			}
		}
	})
	t.Run("the invited person joins with the role", func(t *testing.T) {
		hh, err := f.db.AcceptInvite(ctx, erin, token)
		if err != nil || hh != f.testHH || isMember(t, f, f.testHH, erin) != "adult" {
			t.Fatalf("hh = %s, err = %v, role %q", hh, err, isMember(t, f, f.testHH, erin))
		}
	})
	t.Run("the link works once", func(t *testing.T) {
		if _, err := f.db.AcceptInvite(ctx, erin, token); !errors.Is(err, ErrInviteInvalid) {
			t.Fatalf("err = %v", err)
		}
		if list, _ := f.db.Invites(ctx, alice, f.testHH); len(list) != 0 {
			t.Fatal("a used invite is still listed as open")
		}
	})
	t.Run("joining shares nothing with the new member", func(t *testing.T) {
		want(t, f, erin, alice, false, false, false)
		want(t, f, erin, carl, true, true, false) // a child's money: parents and adults see it automatically
	})
}

func TestInvitesRefused(t *testing.T) {
	f := inviteFixture(t)
	ctx := context.Background()

	t.Run("only owners invite", func(t *testing.T) {
		for _, u := range []string{dave, carl, bob} {
			if _, _, err := f.db.CreateInvite(ctx, u, f.testHH, "x@example.test", "adult"); !errors.Is(err, ErrForbidden) {
				t.Fatalf("err = %v, want ErrForbidden", err)
			}
		}
	})
	t.Run("bad emails and roles", func(t *testing.T) {
		for _, tc := range [][2]string{
			{"not-an-email", "adult"}, {"", "adult"}, {"a@b", "child"}, {"x@example.test", "child"},
			{"x@example.test", "owner"}, {"Name <x@example.test>", "adult"},
		} {
			if _, _, err := f.db.CreateInvite(ctx, alice, f.testHH, tc[0], tc[1]); !errors.Is(err, ErrInvalid) {
				t.Fatalf("%v: err = %v, want ErrInvalid", tc, err)
			}
		}
	})
	t.Run("someone already in the household", func(t *testing.T) {
		if _, _, err := f.db.CreateInvite(ctx, alice, f.testHH, "dave@example.test", "adult"); !errors.Is(err, ErrAlreadyMember) {
			t.Fatalf("err = %v, want ErrAlreadyMember", err)
		}
	})
	t.Run("unconfirmed email", func(t *testing.T) {
		_, token, err := f.db.CreateInvite(ctx, alice, f.testHH, "fay@example.test", "teen")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.db.AcceptInvite(ctx, fay, token); !errors.Is(err, ErrInviteInvalid) {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("expired", func(t *testing.T) {
		inv, token, _ := f.db.CreateInvite(ctx, alice, f.testHH, "erin@example.test", "adult")
		mustExec(t, f.admin, `update household_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = $1`, inv.ID)
		if _, err := f.db.AcceptInvite(ctx, erin, token); !errors.Is(err, ErrInviteInvalid) {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("cancelled", func(t *testing.T) {
		inv, token, _ := f.db.CreateInvite(ctx, alice, f.testHH, "erin@example.test", "adult")
		if err := f.db.RevokeInvite(ctx, dave, inv.ID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("an adult cancelled an invite: %v", err)
		}
		if err := f.db.RevokeInvite(ctx, alice, inv.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := f.db.AcceptInvite(ctx, erin, token); !errors.Is(err, ErrInviteInvalid) {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("a new invite replaces the old one", func(t *testing.T) {
		_, old, _ := f.db.CreateInvite(ctx, alice, f.testHH, "erin@example.test", "viewer")
		_, fresh, _ := f.db.CreateInvite(ctx, alice, f.testHH, "erin@example.test", "teen")
		if _, err := f.db.AcceptInvite(ctx, erin, old); !errors.Is(err, ErrInviteInvalid) {
			t.Fatalf("old link still works: %v", err)
		}
		if _, err := f.db.AcceptInvite(ctx, erin, fresh); err != nil || isMember(t, f, f.testHH, erin) != "teen" {
			t.Fatalf("err = %v, role %q", err, isMember(t, f, f.testHH, erin))
		}
	})
	t.Run("garbage tokens", func(t *testing.T) {
		for _, tok := range []string{"", "nope", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "%%%"} {
			if _, err := f.db.AcceptInvite(ctx, erin, tok); !errors.Is(err, ErrInviteInvalid) {
				t.Fatalf("%q: err = %v", tok, err)
			}
		}
	})
	t.Run("at most 20 open invites", func(t *testing.T) {
		var err error
		for i := 0; i < 25 && err == nil; i++ {
			_, _, err = f.db.CreateInvite(ctx, alice, f.otherHH, fmt.Sprintf("p%d@example.test", i), "viewer")
		}
		if err == nil {
			// otherHH is bob's: alice isn't an owner there, so it must have failed at once
			t.Fatal("alice invited into bob's household")
		}
		for i := 0; i < 25; i++ {
			if _, _, err = f.db.CreateInvite(ctx, bob, f.otherHH, fmt.Sprintf("p%d@example.test", i), "viewer"); err != nil {
				break
			}
		}
		if !errors.Is(err, ErrInvalid) {
			t.Fatalf("err = %v, want the 21st invite refused", err)
		}
	})
	t.Run("even owners can't read the token hashes", func(t *testing.T) {
		err := f.db.AsUser(ctx, alice, func(tx pgx.Tx) error {
			var b []byte
			return tx.QueryRow(ctx, `select token_hash from public.household_invites limit 1`).Scan(&b)
		})
		if pgCode(err) != "42501" {
			t.Fatalf("err = %v, want permission denied", err)
		}
	})
}

func TestMemberManagement(t *testing.T) {
	f := inviteFixture(t)
	ctx := context.Background()

	if err := f.db.SetMemberRole(ctx, dave, f.testHH, carl, "adult"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an adult changed a role: %v", err)
	}
	if err := f.db.SetMemberRole(ctx, alice, f.testHH, dave, "child"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("child role: %v", err)
	}
	if err := f.db.SetMemberRole(ctx, alice, f.testHH, dave, "viewer"); err != nil || isMember(t, f, f.testHH, dave) != "viewer" {
		t.Fatalf("err = %v", err)
	}
	if err := f.db.SetMemberRole(ctx, alice, f.testHH, alice, "adult"); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("last owner stepped down: %v", err)
	}
	if err := f.db.RemoveMember(ctx, alice, f.testHH, alice); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("last owner left: %v", err)
	}
	if err := f.db.SetMemberRole(ctx, alice, f.testHH, dave, "owner"); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetMemberRole(ctx, alice, f.testHH, alice, "adult"); err != nil {
		t.Fatalf("with a second owner, alice can step down: %v", err)
	}
	if err := f.db.RemoveMember(ctx, carl, f.testHH, dave); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a child removed an owner: %v", err)
	}
	if err := f.db.RemoveMember(ctx, alice, f.testHH, alice); err != nil {
		t.Fatalf("an adult leaves: %v", err)
	}
	if isMember(t, f, f.testHH, alice) != "" {
		t.Fatal("alice is still a member")
	}
	members, err := f.db.Members(ctx, dave, f.testHH)
	if err != nil || len(members) != 2 || !members[0].IsYou {
		t.Fatalf("members = %+v, %v", members, err)
	}
}
