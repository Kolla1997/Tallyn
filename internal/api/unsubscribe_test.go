package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/email"
)

// Unsubscribe links (#269): no sign-in, the signed link is the proof. All
// IDs are fake.
type unsubStore struct {
	stubStore
	calls []string
	err   error
}

func (s *unsubStore) SetEmail(_ context.Context, user, hh, kind, kid string, on bool) error {
	state := "off"
	if on {
		state = "on"
	}
	s.calls = append(s.calls, strings.Join([]string{user, hh, kind, kid, state}, " "))
	return s.err
}

func TestUnsubscribeLinks(t *testing.T) {
	key := email.DeriveLinkKey([]byte("test-only"))
	s := &unsubStore{}
	// No RequireAuth: these routes must work signed out.
	h := NewRouter(Deps{WebDir: t.TempDir(), Store: s, LinkKey: key})
	tok := url.QueryEscape(email.Sign(key, email.Link{UserID: "u1", HouseholdID: "h1", Kind: db.EmailPaymentDue}))
	do := func(method, q, ctype, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/email/unsubscribe?t="+q, strings.NewReader(body))
		if ctype != "" {
			r.Header.Set("Content-Type", ctype)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}

	// Opening the link (a mail scanner, or the page) changes nothing.
	if w := do("GET", tok, "", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"payment_due"`) || len(s.calls) != 0 {
		t.Fatalf("GET = %d %s, calls %v", w.Code, w.Body, s.calls)
	}
	if w := do("POST", tok, "application/json", `{"on":false}`); w.Code != 200 {
		t.Fatalf("button = %d %s", w.Code, w.Body)
	}
	if w := do("POST", tok, "application/json", `{"on":true}`); w.Code != 200 {
		t.Fatalf("turn back on = %d", w.Code)
	}
	if w := do("POST", tok, "application/x-www-form-urlencoded", "List-Unsubscribe=One-Click"); w.Code != 200 {
		t.Fatalf("one-click = %d", w.Code)
	}
	want := "u1 h1 payment_due  off|u1 h1 payment_due  on|u1 h1 payment_due  off"
	if got := strings.Join(s.calls, "|"); got != want {
		t.Errorf("calls = %s", got)
	}

	// A changed or made-up link does nothing.
	bad := url.QueryEscape(email.Sign(email.DeriveLinkKey([]byte("other")), email.Link{UserID: "u1", HouseholdID: "h1", Kind: db.EmailPaymentDue}))
	for _, q := range []string{"", "nope", bad} {
		if w := do("POST", q, "application/json", `{"on":false}`); w.Code != http.StatusBadRequest {
			t.Errorf("bad link %q = %d", q, w.Code)
		}
	}
	if w := do("POST", tok, "application/x-www-form-urlencoded", "something=else"); w.Code != http.StatusBadRequest {
		t.Errorf("form without One-Click = %d", w.Code)
	}
	if len(s.calls) != 3 {
		t.Errorf("bad requests changed settings: %v", s.calls)
	}

	// Left the household since: the link no longer works.
	s.err = db.ErrForbidden
	if w := do("POST", tok, "application/json", `{"on":false}`); w.Code != http.StatusGone {
		t.Errorf("after leaving = %d", w.Code)
	}

	// Without the key the route says so.
	h = NewRouter(Deps{WebDir: t.TempDir(), Store: s})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/email/unsubscribe?t="+tok, nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("no key = %d", w.Code)
	}
}
