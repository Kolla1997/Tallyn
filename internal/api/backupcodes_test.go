package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/auth"
	"github.com/Kolla1997/Tallyn/internal/db"
)

// Backup codes and recovery (#23, ADR 0013).

type codeStore struct {
	hashes [][]byte
	used   map[string]bool
	err    error
	resets []string // members whose 2FA was reset (#120)
	note   *db.TwoFAReset
}

// ResetMember2FA allows only household "hh1" and member "teen", like the
// database's rule, and keeps nothing if removing the factors fails.
func (s *codeStore) ResetMember2FA(ctx context.Context, uid, hh, member string, removeFactors func(context.Context) error) error {
	if hh != "hh1" || member != "teen" {
		return db.ErrForbidden
	}
	if err := removeFactors(ctx); err != nil {
		return err
	}
	s.resets = append(s.resets, member)
	return nil
}

func (s *codeStore) My2FAReset(context.Context, string) (*db.TwoFAReset, error) {
	return s.note, s.err
}

func (s *codeStore) BackupCodeStatus(_ context.Context, uid string) (db.BackupCodeStatus, error) {
	left := 0
	for _, h := range s.hashes {
		if !s.used[string(h)] {
			left++
		}
	}
	return db.BackupCodeStatus{Left: left, Total: len(s.hashes)}, s.err
}

func (s *codeStore) ReplaceBackupCodes(_ context.Context, uid string, hashes [][]byte) error {
	s.hashes, s.used = hashes, map[string]bool{}
	return s.err
}

func (s *codeStore) UseBackupCode(_ context.Context, uid string, hash []byte) (bool, error) {
	for _, h := range s.hashes {
		if bytes.Equal(h, hash) && !s.used[string(h)] {
			s.used[string(h)] = true
			return true, nil
		}
	}
	return false, s.err
}

type fakeFactors struct {
	removed []string
	err     error
}

func (f *fakeFactors) RemoveFactors(_ context.Context, uid string) error {
	if f.err != nil {
		return f.err
	}
	f.removed = append(f.removed, uid)
	return nil
}

// signedInOnly is RequireSignedIn for tests: "Bearer pw" is a password-only
// (aal1) session.
func signedInOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer pw" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithSession(r.Context(), auth.Session{UserID: testUser, AAL: "aal1"})))
	})
}

var testCodeKey = bytes.Repeat([]byte{7}, 32)

func codeRouter(t *testing.T, s *codeStore, f FactorRemover) http.Handler {
	t.Helper()
	return NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &fakeStore{}, RequireSignedIn: signedInOnly, BackupCodes: s, Factors: f, CodeKey: testCodeKey})
}

func sendAs(h http.Handler, bearer, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearer)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestNewBackupCodes(t *testing.T) {
	codes, err := newBackupCodes(200)
	if err != nil {
		t.Fatal(err)
	}
	shape := regexp.MustCompile(`^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$`)
	seen := map[string]bool{}
	for _, c := range codes {
		if !shape.MatchString(c) {
			t.Fatalf("code %q has the wrong shape (no 0, O, 1, I or L)", c)
		}
		if seen[c] {
			t.Fatalf("code %q came twice", c)
		}
		seen[c] = true
	}
}

func TestNormalizeAndHashCode(t *testing.T) {
	for in, want := range map[string]string{"7KQ4-M9TX": "7KQ4M9TX", "7kq4 m9tx": "7KQ4M9TX", " 7KQ4M9TX ": "7KQ4M9TX", "7KQ4-M9T0": "", "7KQ4": "", "": ""} {
		if got := normalizeCode(in); got != want {
			t.Fatalf("normalizeCode(%q) = %q, want %q", in, got, want)
		}
	}
	a, b := hashCode(testCodeKey, "7KQ4M9TX"), hashCode(bytes.Repeat([]byte{8}, 32), "7KQ4M9TX")
	if len(a) != 32 || bytes.Equal(a, b) || !bytes.Equal(a, hashCode(testCodeKey, "7KQ4M9TX")) {
		t.Fatal("hash must be 32 bytes, stable, and depend on the key")
	}
	if k := DeriveBackupCodeKey(bytes.Repeat([]byte{1}, 32)); len(k) != 32 || bytes.Equal(k, bytes.Repeat([]byte{1}, 32)) {
		t.Fatal("derived key must be 32 bytes and differ from the token key")
	}
}

func TestBackupCodeRoutes(t *testing.T) {
	s := &codeStore{}
	h := codeRouter(t, s, &fakeFactors{})

	// A new set needs a fresh 2FA code (step-up).
	if rec := send(h, "POST", "/api/backup-codes", ""); rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "reauth_required") {
		t.Fatalf("stale code: status %d %s, want 403 reauth_required", rec.Code, rec.Body)
	}
	rec := sendFresh(h, "POST", "/api/backup-codes", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("new set: status %d", rec.Code)
	}
	var out struct{ Codes []string }
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Codes) != 10 || len(s.hashes) != 10 || !bytes.Equal(s.hashes[3], hashCode(testCodeKey, normalizeCode(out.Codes[3]))) {
		t.Fatalf("want 10 codes shown and their 10 keyed hashes stored, got %d codes, %d hashes", len(out.Codes), len(s.hashes))
	}
	if rec := send(h, "GET", "/api/backup-codes", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"left":10`) || strings.Contains(rec.Body.String(), out.Codes[0]) {
		t.Fatalf("status: %d %s", rec.Code, rec.Body)
	}
	// Password-only sessions can't see or make codes.
	if rec := sendAs(h, "pw", "GET", "/api/backup-codes", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("aal1 status: %d, want 401", rec.Code)
	}
}

func TestRecoverWithBackupCode(t *testing.T) {
	s := &codeStore{}
	f := &fakeFactors{}
	h := codeRouter(t, s, f)
	rec := sendFresh(h, "POST", "/api/backup-codes", "")
	var out struct{ Codes []string }
	_ = json.Unmarshal(rec.Body.Bytes(), &out)

	// Not signed in at all: refused.
	if rec := sendAs(h, "nobody", "POST", "/api/recovery/backup-code", `{"code":"`+out.Codes[0]+`"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no session: %d, want 401", rec.Code)
	}
	// A wrong code changes nothing.
	if rec := sendAs(h, "pw", "POST", "/api/recovery/backup-code", `{"code":"ZZZZ-ZZZZ"}`); rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "wrong_code") || len(f.removed) != 0 {
		t.Fatalf("wrong code: %d %s, removed %v", rec.Code, rec.Body, f.removed)
	}
	// A right code (any case, no hyphen) removes the authenticators, once.
	typed := strings.ToLower(strings.ReplaceAll(out.Codes[0], "-", ""))
	if rec := sendAs(h, "pw", "POST", "/api/recovery/backup-code", `{"code":"`+typed+`"}`); rec.Code != http.StatusNoContent || len(f.removed) != 1 || f.removed[0] != testUser {
		t.Fatalf("right code: %d %s, removed %v", rec.Code, rec.Body, f.removed)
	}
	if rec := sendAs(h, "pw", "POST", "/api/recovery/backup-code", `{"code":"`+out.Codes[0]+`"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("used code again: %d, want 400", rec.Code)
	}
	// The other codes still work.
	if st, _ := s.BackupCodeStatus(context.Background(), testUser); st.Left != 9 {
		t.Fatalf("left = %d, want 9", st.Left)
	}
}

func TestRecoveryFailsSafely(t *testing.T) {
	s := &codeStore{}
	h := codeRouter(t, s, &fakeFactors{err: errors.New("supabase down")})
	rec := sendFresh(h, "POST", "/api/backup-codes", "")
	var out struct{ Codes []string }
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if rec := sendAs(h, "pw", "POST", "/api/recovery/backup-code", `{"code":"`+out.Codes[0]+`"}`); rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "recovery_failed") {
		t.Fatalf("status %d %s, want 502 recovery_failed", rec.Code, rec.Body)
	}
	if st, _ := s.BackupCodeStatus(context.Background(), testUser); st.Left != 9 {
		t.Fatalf("left = %d, want 9 to try again", st.Left)
	}
}

func TestRecoveryRateLimit(t *testing.T) {
	h := codeRouter(t, &codeStore{}, &fakeFactors{})
	for i := 0; i < 5; i++ {
		if rec := sendAs(h, "pw", "POST", "/api/recovery/backup-code", `{"code":"ZZZZ-ZZZZ"}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("try %d: %d, want 400", i+1, rec.Code)
		}
	}
	if rec := sendAs(h, "pw", "POST", "/api/recovery/backup-code", `{"code":"ZZZZ-ZZZZ"}`); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("6th try: %d, want 429", rec.Code)
	}
}

func TestRecoveryUnavailableWithoutSetup(t *testing.T) {
	// No server key: codes still work in Settings, recovery answers 503.
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &fakeStore{}, RequireSignedIn: signedInOnly, BackupCodes: &codeStore{}, CodeKey: testCodeKey})
	if rec := sendAs(h, "pw", "POST", "/api/recovery/backup-code", `{"code":"7KQ4-M9TX"}`); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("recovery: %d, want 503", rec.Code)
	}
	if rec := send(h, "GET", "/api/backup-codes", ""); rec.Code != http.StatusOK {
		t.Fatalf("status: %d, want 200", rec.Code)
	}
	// No key or store: both answer 503.
	h = NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &fakeStore{}})
	for _, p := range [][2]string{{"GET", "/api/backup-codes"}, {"POST", "/api/recovery/backup-code"}} {
		if rec := sendAs(h, "ok", p[0], p[1], `{}`); rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s %s: %d, want 503", p[0], p[1], rec.Code)
		}
	}
}
