package api

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// All data here is fake.

type shareStore struct {
	stubStore
	gotUser, gotViewer, gotName string
	gotCats                     []string
	err                         error
}

func (s *shareStore) Sharing(_ context.Context, uid, hh string) (db.Sharing, error) {
	return db.Sharing{Members: []db.Member{{UserID: uid, Role: "owner", IsYou: true}}, Given: map[string][]string{}, Received: map[string][]string{}}, s.err
}
func (s *shareStore) SetSharing(_ context.Context, uid, hh, viewer string, cats []string) error {
	s.gotUser, s.gotViewer, s.gotCats = uid, viewer, cats
	return s.err
}
func (s *shareStore) SetDisplayName(_ context.Context, uid, name string) error {
	s.gotUser, s.gotName = uid, name
	return s.err
}

func TestSharingRoutes(t *testing.T) {
	s := &shareStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})

	if rec := send(h, "GET", "/api/sharing?household_id="+testHH, ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"is_you":true`) {
		t.Fatalf("GET: %d %s", rec.Code, rec.Body)
	}

	body := `{"household_id":"` + testHH + `","viewer_user_id":"v1","categories":["balances","transactions"]}`
	if rec := send(h, "PUT", "/api/sharing", body); rec.Code != http.StatusNoContent {
		t.Fatalf("PUT: %d", rec.Code)
	}
	// The sharer is always the verified session's user, never something in the body.
	if s.gotUser != testUser || s.gotViewer != "v1" || !slices.Equal(s.gotCats, []string{"balances", "transactions"}) {
		t.Fatalf("got user %q viewer %q cats %v", s.gotUser, s.gotViewer, s.gotCats)
	}
	if rec := send(h, "PUT", "/api/sharing", `{"household_id":"x","owner_user_id":"someone-else","viewer_user_id":"v1","categories":[]}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("an owner field in the body must be rejected: %d", rec.Code)
	}

	s.err = db.ErrForbidden
	if rec := send(h, "PUT", "/api/sharing", body); rec.Code != http.StatusForbidden {
		t.Fatalf("forbidden: %d", rec.Code)
	}
	s.err = db.ErrInvalid
	if rec := send(h, "PUT", "/api/sharing", body); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid: %d", rec.Code)
	}

	s.err = nil
	if rec := send(h, "PUT", "/api/me", `{"display_name":"Alex"}`); rec.Code != http.StatusNoContent || s.gotName != "Alex" || s.gotUser != testUser {
		t.Fatalf("PUT /api/me: %d, name %q", rec.Code, s.gotName)
	}
	if rec := get(h, "/api/sharing?household_id="+testHH, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("without a session: %d", rec.Code)
	}
}

// Saving your name (#114): only ever your own, a name the database refuses
// is a 400, anything else a 500, and the body can't name another person.
func TestSetMe(t *testing.T) {
	s := &shareStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})

	if rec := send(h, "PUT", "/api/me", `{"display_name":"Alex"}`); rec.Code != http.StatusNoContent || s.gotUser != testUser || s.gotName != "Alex" {
		t.Fatalf("save: %d, user %q, name %q", rec.Code, s.gotUser, s.gotName)
	}
	if rec := send(h, "PUT", "/api/me", `{"display_name":"Alex","user_id":"someone-else"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("a user_id in the body must be rejected: %d", rec.Code)
	}
	if rec := send(h, "PUT", "/api/me", `not json`); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad JSON: %d", rec.Code)
	}
	s.gotName = "unchanged"
	if rec := send(h, "PUT", "/api/me", `{"display_name":"   "}`); rec.Code != http.StatusBadRequest || s.gotName != "unchanged" {
		t.Fatalf("a blank name must be refused before saving (#154): %d, saved %q", rec.Code, s.gotName)
	}
	s.err = db.ErrInvalid // e.g. longer than 80 characters
	if rec := send(h, "PUT", "/api/me", `{"display_name":"x"}`); rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "invalid_name") {
		t.Fatalf("invalid: %d %s", rec.Code, rec.Body)
	}
	s.err = errors.New("database down")
	if rec := send(h, "PUT", "/api/me", `{"display_name":"x"}`); rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "database down") {
		t.Fatalf("error: %d %s, and the cause must not leak", rec.Code, rec.Body)
	}
	if rec := sendAs(h, "nobody", "PUT", "/api/me", `{"display_name":"x"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", rec.Code)
	}
}
