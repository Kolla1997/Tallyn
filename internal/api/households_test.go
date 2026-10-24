package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Renaming a household (#53). The rules live in the database
// (db/households_test.go); this checks the route.
type renameStore struct {
	stubStore
	gotHH, gotName string
	err            error
}

func (s *renameStore) RenameHousehold(_ context.Context, _, hh, name string) (string, error) {
	s.gotHH, s.gotName = hh, name
	return strings.TrimSpace(name), s.err
}

func TestRenameHouseholdRoute(t *testing.T) {
	s := &renameStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "PUT", "/api/households/"+testHH, `{"name":" The Riveras "}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"The Riveras"`) || s.gotHH != testHH {
		t.Fatalf("rename: %d %s", rec.Code, rec.Body)
	}
	for err, want := range map[error]int{db.ErrForbidden: http.StatusForbidden, db.ErrInvalid: http.StatusBadRequest} {
		s.err = err
		if rec := send(h, "PUT", "/api/households/"+testHH, `{"name":"x"}`); rec.Code != want {
			t.Errorf("%v: %d, want %d", err, rec.Code, want)
		}
	}
}
