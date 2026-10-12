package db

import (
	"context"
	"errors"
	"testing"
)

// Consents (#36): you record and read only your own, the database sets the
// time, and records can't be changed or deleted.
func TestConsents(t *testing.T) {
	f := setup(t)
	ctx := context.Background()

	if err := f.db.Accept(ctx, alice, map[string]string{"terms": "0.1-draft", "privacy": "0.1-draft"}); err != nil {
		t.Fatal(err)
	}
	// Agreeing again is harmless.
	if err := f.db.Accept(ctx, alice, map[string]string{"terms": "0.1-draft"}); err != nil {
		t.Fatal(err)
	}
	got, err := f.db.Consents(ctx, alice)
	if err != nil || len(got) != 2 {
		t.Fatalf("alice's consents = %+v, %v; want 2", got, err)
	}
	if got[0].AcceptedAt.IsZero() {
		t.Error("accepted_at should come from the database")
	}
	if other, _ := f.db.Consents(ctx, bob); len(other) != 0 {
		t.Errorf("bob sees %d of alice's consents", len(other))
	}
	for name, v := range map[string]map[string]string{
		"unknown document": {"cookies": "1"},
		"bad version":      {"terms": "1'; drop table x --"},
		"empty version":    {"privacy": ""},
	} {
		if err := f.db.Accept(ctx, alice, v); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}

	// Straight SQL as alice: can't write someone else's, backdate, change or delete.
	for name, sql := range map[string]string{
		"insert for bob":  `insert into public.consents (user_id, document, version) values ('` + bob + `', 'terms', 'x')`,
		"set accepted_at": `insert into public.consents (user_id, document, version, accepted_at) values ('` + alice + `', 'terms', 'y', '2000-01-01')`,
		"update own":      `update public.consents set version = 'z' where user_id = '` + alice + `'`,
		"delete own":      `delete from public.consents where user_id = '` + alice + `'`,
	} {
		if n, err := f.execAs(alice, sql); err == nil && n > 0 {
			t.Errorf("%s: allowed (%d rows), want refused", name, n)
		}
	}
	if got, _ := f.db.Consents(ctx, alice); len(got) != 2 {
		t.Errorf("after attempts: %d consents, want 2", len(got))
	}
}
