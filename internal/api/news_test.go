package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/email"
)

// Product news (#281). All IDs are fake.
type newsStore struct {
	consentStore
	calls []string
	now   db.News
}

func (s *newsStore) News(context.Context, string) (db.News, error) { return s.now, nil }
func (s *newsStore) SetNews(_ context.Context, user string, on bool, source, privacy string) error {
	s.calls = append(s.calls, fmt.Sprintf("%s %v %s %s", user, on, source, privacy))
	return nil
}
func (s *newsStore) SetEmail(context.Context, string, string, string, string, bool) error {
	s.calls = append(s.calls, "SetEmail")
	return nil
}

func TestNewsRoutes(t *testing.T) {
	s := &newsStore{now: db.News{On: true, Set: true}}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	if rec := send(h, "GET", "/api/me/news", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"on":true`) {
		t.Fatalf("GET = %d %s", rec.Code, rec.Body)
	}
	if rec := send(h, "PUT", "/api/me/news", `{"on":false}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT = %d", rec.Code)
	}
	if want := testUser + " false settings " + CurrentVersions["privacy"]; len(s.calls) != 1 || s.calls[0] != want {
		t.Errorf("calls %v, want %q", s.calls, want)
	}
	if rec := send(h, "PUT", "/api/me/news", `{}`); rec.Code != http.StatusBadRequest {
		t.Errorf("no choice = %d, want 400", rec.Code)
	}
}

func TestConsentWithNews(t *testing.T) {
	s := &newsStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	v := `"terms":"` + CurrentVersions["terms"] + `","privacy":"` + CurrentVersions["privacy"] + `"`
	send(h, "POST", "/api/consent", `{`+v+`}`)
	if len(s.calls) != 0 {
		t.Fatalf("a choice was saved without the box: %v", s.calls)
	}
	send(h, "POST", "/api/consent", `{`+v+`,"news":false}`)
	if want := testUser + " false signup " + CurrentVersions["privacy"]; len(s.calls) != 1 || s.calls[0] != want {
		t.Errorf("calls %v, want %q", s.calls, want)
	}
}

func TestUnsubscribeNews(t *testing.T) {
	key := email.DeriveLinkKey([]byte("test-only"))
	s := &newsStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), Store: s, LinkKey: key})
	tok := url.QueryEscape(email.Sign(key, email.Link{UserID: "u1", Kind: db.EmailNews}))
	r := httptest.NewRequest("POST", "/api/email/unsubscribe?t="+tok, strings.NewReader(`{"on":false}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || len(s.calls) != 1 || s.calls[0] != "u1 false stop_link "+CurrentVersions["privacy"] {
		t.Fatalf("%d %s, calls %v: only product news must change", w.Code, w.Body, s.calls)
	}
}
