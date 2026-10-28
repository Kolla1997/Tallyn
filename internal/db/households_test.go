package db

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// Renaming a household (#53): owners only, trimmed, 1–80 characters.
func TestRenameHousehold(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	got, err := f.db.RenameHousehold(ctx, alice, f.testHH, "  The Riveras  ")
	if err != nil || got != "The Riveras" {
		t.Fatalf("owner rename = %q, %v; want the trimmed name", got, err)
	}
	var name string
	_ = f.admin.QueryRow(ctx, `select name from households where id = $1`, f.testHH).Scan(&name)
	if name != "The Riveras" {
		t.Errorf("saved name = %q", name)
	}
	// Carl is a child in the household; Bob isn't in it at all.
	for who, user := range map[string]string{"a child": carl, "an outsider": bob} {
		if _, err := f.db.RenameHousehold(ctx, user, f.testHH, "Mine now"); !errors.Is(err, ErrForbidden) {
			t.Errorf("%s renames: %v, want ErrForbidden", who, err)
		}
	}
	_ = f.admin.QueryRow(ctx, `select name from households where id = $1`, f.testHH).Scan(&name)
	if name != "The Riveras" {
		t.Errorf("name changed to %q by someone who may not", name)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("é", 81)} {
		if _, err := f.db.RenameHousehold(ctx, alice, f.testHH, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("name %q: %v, want ErrInvalid", bad, err)
		}
	}
	if got, err := f.db.RenameHousehold(ctx, alice, f.testHH, strings.Repeat("é", 80)); err != nil || got != strings.Repeat("é", 80) {
		t.Errorf("80 characters: %v", err)
	}
}
