package api

import (
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// An owner resets a teen's 2FA (#120). Who may reset whom is the database's
// rule (db.TestReset2FA); here: the step-up, the factors, and failures.
func TestReset2FAProof(t *testing.T) {
	const path = "/api/households/hh1/members/teen/reset-2fa"

	t.Run("needs a fresh 2FA code", func(t *testing.T) {
		s, f := &codeStore{}, &fakeFactors{}
		rec := send(codeRouter(t, s, f), "POST", path, "")
		if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "reauth_required") || len(s.resets)+len(f.removed) != 0 {
			t.Fatalf("stale code: status %d %s, resets %v, removed %v", rec.Code, rec.Body, s.resets, f.removed)
		}
	})
	t.Run("removes the teen's authenticators and keeps the record", func(t *testing.T) {
		s, f := &codeStore{}, &fakeFactors{}
		if rec := sendFresh(codeRouter(t, s, f), "POST", path, ""); rec.Code != http.StatusNoContent {
			t.Fatalf("status %d %s", rec.Code, rec.Body)
		}
		if len(f.removed) != 1 || f.removed[0] != "teen" || len(s.resets) != 1 {
			t.Fatalf("removed %v, resets %v", f.removed, s.resets)
		}
	})
	t.Run("refused by the rules: nothing removed", func(t *testing.T) {
		s, f := &codeStore{}, &fakeFactors{}
		rec := sendFresh(codeRouter(t, s, f), "POST", "/api/households/hh1/members/adult/reset-2fa", "")
		if rec.Code != http.StatusForbidden || len(f.removed) != 0 {
			t.Fatalf("status %d, removed %v", rec.Code, f.removed)
		}
	})
	t.Run("Supabase fails: no record, says so", func(t *testing.T) {
		s, f := &codeStore{}, &fakeFactors{err: errors.New("supabase down")}
		rec := sendFresh(codeRouter(t, s, f), "POST", path, "")
		if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "reset_failed") || len(s.resets) != 0 {
			t.Fatalf("status %d %s, resets %v", rec.Code, rec.Body, s.resets)
		}
	})
	t.Run("switched off without the server key", func(t *testing.T) {
		h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &fakeStore{}, BackupCodes: &codeStore{}, CodeKey: testCodeKey})
		if rec := sendFresh(h, "POST", path, ""); rec.Code == http.StatusNoContent {
			t.Fatal("reset ran without the server key")
		}
	})
}

func TestReset2FANote(t *testing.T) {
	at := time.Date(2026, 10, 30, 9, 0, 0, 0, time.UTC)
	s := &codeStore{note: &db.TwoFAReset{ResetByName: "Sam", ResetAt: at}}
	h := codeRouter(t, s, &fakeFactors{})

	// A password sign-in is enough: the teen has no authenticator yet.
	rec := sendAs(h, "pw", "GET", "/api/recovery/2fa-reset", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"reset_by_name":"Sam"`) || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status %d %s, cache %q", rec.Code, rec.Body, rec.Header().Get("Cache-Control"))
	}
	if rec := sendAs(h, "nope", "GET", "/api/recovery/2fa-reset", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("signed out: status %d", rec.Code)
	}
	s.note = nil
	if rec := sendAs(h, "pw", "GET", "/api/recovery/2fa-reset", ""); !strings.Contains(rec.Body.String(), `"reset":null`) {
		t.Fatalf("no reset: %s", rec.Body)
	}
}
