package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	NewRouter(t.TempDir()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))
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
	rec := httptest.NewRecorder()
	NewRouter(dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/accounts/123", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "<p>tallyn</p>" {
		t.Fatalf("got %d %q, want index.html", rec.Code, rec.Body.String())
	}
}

func TestUnknownAPIRoute(t *testing.T) {
	rec := httptest.NewRecorder()
	NewRouter(t.TempDir()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/nope", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
