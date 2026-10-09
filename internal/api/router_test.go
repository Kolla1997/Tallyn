package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/auth"
	"github.com/Kolla1997/Tallyn/internal/db"
)

const testUser = "11111111-1111-4111-8111-111111111111" // fake

// fakeAuth stands in for auth.Verifier.Require: "Bearer ok" is a verified
// session for testUser, anything else is a 401.
func fakeAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer ok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithSession(r.Context(), auth.Session{UserID: testUser, AAL: "aal2"})))
	})
}

type fakeStore struct {
	stubStore
	me     db.Me
	err    error
	gotUID string
}

func (s *fakeStore) Me(_ context.Context, userID string) (db.Me, error) {
	s.gotUID = userID
	return s.me, s.err
}

func get(h http.Handler, path, authz string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if authz != "" {
		req.Header.Set("Authorization", authz)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealth(t *testing.T) {
	// Public, even when auth isn't configured.
	rec := get(NewRouter(Deps{WebDir: t.TempDir()}), "/api/health", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got != "{\"status\":\"ok\"}\n" {
		t.Fatalf("body = %q", got)
	}
}

func TestSPAFallback(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<p>tallyn</p>"), 0o644); err != nil {
		t.Fatal(err)
	}
	rec := get(NewRouter(Deps{WebDir: dir}), "/accounts/123", "")
	if rec.Code != http.StatusOK || rec.Body.String() != "<p>tallyn</p>" {
		t.Fatalf("got %d %q, want index.html", rec.Code, rec.Body.String())
	}
}

func TestAPIRequiresAuth(t *testing.T) {
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &fakeStore{}})
	for _, path := range []string{"/api/me", "/api/nope", "/api/"} {
		if rec := get(h, path, ""); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s without a session: status = %d, want 401", path, rec.Code)
		}
	}
	// POST to the health path isn't the public route, so it needs a session too.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/health", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("POST /api/health: status = %d, want 401", rec.Code)
	}
}

func TestAPIUnavailableWithoutConfig(t *testing.T) {
	for name, h := range map[string]http.Handler{
		"no auth":     NewRouter(Deps{WebDir: t.TempDir(), Store: &fakeStore{}}),
		"no database": NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth}),
	} {
		if rec := get(h, "/api/me", "Bearer ok"); rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s: status = %d, want 503", name, rec.Code)
		}
	}
}

func TestUnknownAPIRoute(t *testing.T) {
	rec := get(NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &fakeStore{}}), "/api/nope", "Bearer ok")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestMe(t *testing.T) {
	store := &fakeStore{me: db.Me{
		UserID:      testUser,
		DisplayName: "Test Person",
		Households:  []db.MyHousehold{{ID: "hh-1", Name: "Test household", HomeCurrency: "USD", Role: "owner"}},
	}}
	rec := get(NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: store}), "/api/me", "Bearer ok")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if store.gotUID != testUser {
		t.Fatalf("store got user %q, want the verified session's user", store.gotUID)
	}
	var got db.Me
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.DisplayName != "Test Person" || len(got.Households) != 1 || got.Households[0].Role != "owner" {
		t.Fatalf("body = %+v", got)
	}

	for err, want := range map[error]int{
		db.ErrNoProfile:          http.StatusNotFound,
		errors.New("db is down"): http.StatusInternalServerError,
	} {
		store.err = err
		if rec := get(NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: store}), "/api/me", "Bearer ok"); rec.Code != want {
			t.Fatalf("store error %v: status = %d, want %d", err, rec.Code, want)
		}
	}
}
