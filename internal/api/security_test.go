package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Security headers (#24): on the app, the API and errors alike; HSTS only
// over HTTPS; caching per kind of response.
func TestSecurityHeaders(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "index-abc123.js"), []byte("1"), 0o600); err != nil {
		t.Fatal(err)
	}
	h := NewRouter(Deps{WebDir: dir, RequireAuth: fakeAuth, Store: &fakeStore{}, SupabaseURL: "https://fake-project.supabase.co/some/path"})

	for _, tc := range []struct{ path, auth, cache string }{
		{"/", "", "no-cache"},
		{"/accounts", "", "no-cache"},
		{"/assets/index-abc123.js", "", "public, max-age=31536000, immutable"},
		{"/api/health", "", "no-store"},
		{"/api/me", "Bearer ok", "no-store"},
		{"/api/me", "", "no-store"}, // a 401 too
	} {
		rec := get(h, tc.path, tc.auth)
		hd := rec.Header()
		csp := hd.Get("Content-Security-Policy")
		for _, want := range []string{
			"default-src 'self'", "script-src 'self' https://cdn.plaid.com", "frame-src https://cdn.plaid.com",
			"frame-ancestors 'none'", "object-src 'none'", "connect-src 'self' https://*.plaid.com https://fake-project.supabase.co",
			"img-src 'self' data: https://plaid-merchant-logos.plaid.com https://plaid-counterparty-logos.plaid.com",
		} {
			if !strings.Contains(csp, want) {
				t.Errorf("%s: CSP missing %q: %s", tc.path, want, csp)
			}
		}
		if strings.Contains(csp, "/some/path") {
			t.Errorf("%s: CSP should name the Supabase origin only: %s", tc.path, csp)
		}
		if hd.Get("X-Frame-Options") != "DENY" || hd.Get("X-Content-Type-Options") != "nosniff" ||
			hd.Get("Referrer-Policy") == "" || hd.Get("Permissions-Policy") == "" {
			t.Errorf("%s: headers = %v", tc.path, hd)
		}
		if hd.Get("Strict-Transport-Security") != "" {
			t.Errorf("%s: HSTS over plain HTTP", tc.path)
		}
		if got := hd.Get("Cache-Control"); got != tc.cache {
			t.Errorf("%s (%q): Cache-Control = %q, want %q", tc.path, tc.auth, got, tc.cache)
		}
	}

	// Behind an HTTPS proxy: HSTS on.
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if !strings.HasPrefix(rec.Header().Get("Strict-Transport-Security"), "max-age=31536000") {
		t.Fatalf("HSTS over HTTPS = %q", rec.Header().Get("Strict-Transport-Security"))
	}

	// No Supabase URL (or not https): the policy simply leaves it out.
	if csp := contentSecurityPolicy("http://insecure.example"); strings.Contains(csp, "insecure.example") {
		t.Fatalf("non-https origin allowed: %s", csp)
	}
}

func TestLimiter(t *testing.T) {
	now := time.Date(2026, 10, 12, 12, 0, 0, 0, time.UTC)
	l := newLimiter(2, time.Minute)
	l.now = func() time.Time { return now }
	for i := 0; i < 2; i++ {
		if ok, _ := l.allow("u1"); !ok {
			t.Fatalf("call %d refused", i+1)
		}
	}
	ok, wait := l.allow("u1")
	if ok || wait != time.Minute {
		t.Fatalf("third call: ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.allow("u2"); !ok {
		t.Fatal("another person shares the count")
	}
	now = now.Add(time.Minute)
	if ok, _ := l.allow("u1"); !ok {
		t.Fatal("not reset after the window")
	}
}

// Accepting invites is limited to 10 per 10 minutes per person: the 11th
// gets 429 with Retry-After, before the handler runs.
func TestInviteAcceptRateLimit(t *testing.T) {
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &fakeStore{}})
	for i := 0; i < 10; i++ {
		if rec := send(h, "POST", "/api/invites/accept", `{}`); rec.Code == http.StatusTooManyRequests {
			t.Fatalf("call %d limited", i+1)
		}
	}
	rec := send(h, "POST", "/api/invites/accept", `{}`)
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") == "" || !strings.Contains(rec.Body.String(), "too_many_requests") {
		t.Fatalf("11th: %d %v %s", rec.Code, rec.Header(), rec.Body)
	}
	// Other routes still answer.
	if rec := get(h, "/api/me", "Bearer ok"); rec.Code == http.StatusTooManyRequests {
		t.Fatal("the invite limit spilled onto other routes")
	}
}
