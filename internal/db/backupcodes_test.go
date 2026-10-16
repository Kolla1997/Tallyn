package db

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

// Backup codes (#23, 0014_backup_codes.sql): only keyed hashes are stored,
// you see only your own count (never a hash), each code works once, and a new
// set replaces the old. Nobody can use or replace someone else's codes.
func TestBackupCodes(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	set := func(b byte) [][]byte {
		hs := make([][]byte, 10)
		for i := range hs {
			hs[i] = bytes.Repeat([]byte{b + byte(i)}, 32)
		}
		return hs
	}

	if s, err := f.db.BackupCodeStatus(ctx, alice); err != nil || s.Total != 0 || s.CreatedAt != nil {
		t.Fatalf("before: %+v, %v", s, err)
	}
	first := set(1)
	if err := f.db.ReplaceBackupCodes(ctx, alice, first); err != nil {
		t.Fatal(err)
	}
	if s, _ := f.db.BackupCodeStatus(ctx, alice); s.Left != 10 || s.Total != 10 || s.CreatedAt == nil {
		t.Fatalf("after: %+v", s)
	}
	for name, hs := range map[string][][]byte{"nine": first[:9], "short hash": append(set(1)[:9], []byte{1})} {
		if err := f.db.ReplaceBackupCodes(ctx, alice, hs); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}

	// Each code works once; a wrong code or bob's try changes nothing.
	if ok, err := f.db.UseBackupCode(ctx, alice, first[2]); !ok || err != nil {
		t.Fatalf("first use: %v, %v", ok, err)
	}
	if ok, _ := f.db.UseBackupCode(ctx, alice, first[2]); ok {
		t.Error("a used code worked again")
	}
	if ok, _ := f.db.UseBackupCode(ctx, alice, bytes.Repeat([]byte{99}, 32)); ok {
		t.Error("a wrong code worked")
	}
	if ok, _ := f.db.UseBackupCode(ctx, bob, first[3]); ok {
		t.Error("bob used alice's code")
	}
	if s, _ := f.db.BackupCodeStatus(ctx, alice); s.Left != 9 {
		t.Errorf("left = %d, want 9", s.Left)
	}
	if s, _ := f.db.BackupCodeStatus(ctx, bob); s.Total != 0 {
		t.Errorf("bob sees %d of alice's codes", s.Total)
	}

	// A new set replaces the old one: old codes stop working.
	if err := f.db.ReplaceBackupCodes(ctx, alice, set(50)); err != nil {
		t.Fatal(err)
	}
	if ok, _ := f.db.UseBackupCode(ctx, alice, first[4]); ok {
		t.Error("an old code worked after a new set")
	}
	if s, _ := f.db.BackupCodeStatus(ctx, alice); s.Left != 10 || s.Total != 10 {
		t.Errorf("after new set: %+v", s)
	}

	// Straight SQL as alice: no hashes, no writes except through the functions.
	for name, sql := range map[string]string{
		"read hashes":    `select code_hash from public.backup_codes`,
		"insert":         `insert into public.backup_codes (user_id, code_hash) values ('` + alice + `', '\x` + "00000000000000000000000000000000000000000000000000000000000000ff" + `')`,
		"unuse a code":   `update public.backup_codes set used_at = null`,
		"delete own":     `delete from public.backup_codes where user_id = '` + alice + `'`,
		"read bob's set": `select 1 from public.backup_codes where user_id = '` + bob + `'`,
	} {
		n, err := f.execAs(alice, sql)
		if name == "read bob's set" {
			if err != nil || n != 0 {
				t.Errorf("%s: %d rows, %v; want 0 rows", name, n, err)
			}
			continue
		}
		if err == nil && n > 0 {
			t.Errorf("%s: allowed (%d rows), want refused", name, n)
		}
		if name == "read hashes" && err == nil {
			t.Errorf("%s: allowed, want permission denied", name)
		}
	}
}
