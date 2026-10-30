package db

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

// An owner resets a teen's 2FA (#120, 0019_twofa_resets.sql): only an owner,
// only a teen in the same household; the record can't be read or changed
// through the app.
func TestReset2FA(t *testing.T) {
	f := setup(t)
	addDave(t, f) // adult in the Test household
	ctx := context.Background()
	mustExec(t, f.admin, `update household_members set role = 'teen' where user_id = $1`, carl)
	mustExec(t, f.admin, `update profiles set display_name = 'Alice' where id = $1`, alice)
	hashes := make([][]byte, 10)
	for i := range hashes {
		hashes[i] = bytes.Repeat([]byte{byte(i + 1)}, 32)
	}
	if err := f.db.ReplaceBackupCodes(ctx, carl, hashes); err != nil {
		t.Fatal(err)
	}
	removed := 0
	remove := func(context.Context) error { removed++; return nil }

	t.Run("who", func(t *testing.T) {
		for _, c := range []struct{ name, by, hh, member string }{
			{"an adult", dave, f.testHH, carl},
			{"the teen themselves", carl, f.testHH, carl},
			{"an owner of another household", bob, f.otherHH, carl},
			{"an owner, for an adult", alice, f.testHH, dave},
			{"an owner, for themselves", alice, f.testHH, alice},
			{"an owner, for someone outside", alice, f.testHH, bob},
			{"a bad id", alice, "nope", carl},
		} {
			if err := f.db.ResetMember2FA(ctx, c.by, c.hh, c.member, remove); !errors.Is(err, ErrForbidden) {
				t.Fatalf("%s: err = %v, want ErrForbidden", c.name, err)
			}
		}
		var left int
		_ = f.admin.QueryRow(ctx, `select count(*) from backup_codes where user_id = $1`, carl).Scan(&left)
		if removed != 0 || left != 10 {
			t.Fatalf("a refused reset changed something: removed %d, codes left %d", removed, left)
		}
	})

	t.Run("Supabase fails: nothing changes", func(t *testing.T) {
		err := f.db.ResetMember2FA(ctx, alice, f.testHH, carl, func(context.Context) error { return errors.New("down") })
		var n, left int
		_ = f.admin.QueryRow(ctx, `select count(*) from twofa_resets`).Scan(&n)
		_ = f.admin.QueryRow(ctx, `select count(*) from backup_codes where user_id = $1`, carl).Scan(&left)
		if err == nil || n != 0 || left != 10 {
			t.Fatalf("err %v, records %d, codes left %d", err, n, left)
		}
	})

	t.Run("an owner resets a teen", func(t *testing.T) {
		if err := f.db.ResetMember2FA(ctx, alice, f.testHH, carl, remove); err != nil {
			t.Fatal(err)
		}
		var by, member string
		var left int
		_ = f.admin.QueryRow(ctx, `select reset_by::text, member::text from twofa_resets`).Scan(&by, &member)
		_ = f.admin.QueryRow(ctx, `select count(*) from backup_codes where user_id = $1`, carl).Scan(&left)
		if removed != 1 || by != alice || member != carl || left != 0 {
			t.Fatalf("removed %d, record %s → %s, codes left %d", removed, by, member, left)
		}
	})

	t.Run("the teen sees who, nobody else does", func(t *testing.T) {
		r, err := f.db.My2FAReset(ctx, carl)
		if err != nil || r == nil || r.ResetByName != "Alice" || r.ResetAt.IsZero() {
			t.Fatalf("note = %+v, %v", r, err)
		}
		if r, err := f.db.My2FAReset(ctx, dave); err != nil || r != nil {
			t.Fatalf("dave's note = %+v, %v", r, err)
		}
	})

	t.Run("the record can't be read or changed through the app", func(t *testing.T) {
		for _, user := range []string{alice, carl, dave} {
			for name, sql := range map[string]string{
				"read":   `select count(*) from twofa_resets`,
				"insert": `insert into twofa_resets (household_id, reset_by, member) values ('` + f.testHH + `', '` + alice + `', '` + carl + `')`,
				"update": `update twofa_resets set reset_at = now()`,
				"delete": `delete from twofa_resets`,
			} {
				if _, err := f.execAs(user, sql); !errors.Is(mapErr(err), ErrForbidden) {
					t.Fatalf("%s could %s the record: %v", user, name, err)
				}
			}
		}
	})
}
