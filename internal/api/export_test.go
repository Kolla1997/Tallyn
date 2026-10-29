package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Download your data (#54). All data is fake.
type exportStore struct {
	stubStore
	calls int
}

func (s *exportStore) Export(_ context.Context, uid string) (db.Export, error) {
	s.calls++
	city, merchant := "Faketown", "=HYPERLINK(\"x\")"
	return db.Export{
		ExportedAt: time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC),
		Profile:    db.ExportProfile{Name: "Sam"},
		Transactions: []db.ExportTransaction{
			{Date: time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC), Name: "Fake Grocer", AmountMinor: 1999, Currency: "USD", Account: "Checking", City: &city},
			{Date: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), Name: "Refund", Merchant: &merchant, AmountMinor: -500, Currency: "JPY", Account: "Checking"},
		},
	}, nil
}

func unzip(t *testing.T, body []byte) map[string]string {
	t.Helper()
	z, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("not a zip: %v", err)
	}
	files := map[string]string{}
	for _, f := range z.File {
		r, _ := f.Open()
		b, _ := io.ReadAll(r)
		files[f.Name] = string(b)
	}
	return files
}

func TestExportZip(t *testing.T) {
	s := &exportStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := sendFresh(h, "GET", "/api/me/export", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="coinroof-data-2026-10-24.zip"` {
		t.Errorf("Content-Disposition = %q", got)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", rec.Header().Get("Cache-Control"))
	}
	files := unzip(t, rec.Body.Bytes())
	for _, name := range []string{"coinroof-data.json", "transactions.csv", "README.txt"} {
		if files[name] == "" {
			t.Errorf("zip is missing %s", name)
		}
	}
	var e db.Export
	if err := json.Unmarshal([]byte(files["coinroof-data.json"]), &e); err != nil {
		t.Fatalf("json: %v", err)
	}
	if e.Profile.Email != "sam@example.test" || len(e.Transactions) != 2 {
		t.Errorf("json profile %+v, %d transactions", e.Profile, len(e.Transactions))
	}
	csv := files["transactions.csv"]
	for _, want := range []string{"2026-10-02,,Fake Grocer,,-19.99,USD", "Faketown", ",500,JPY", `'=HYPERLINK`} {
		if !strings.Contains(csv, want) {
			t.Errorf("csv missing %q:\n%s", want, csv)
		}
	}
}

// A full copy of someone's finances needs a code from the last few minutes.
func TestExportNeedsFreshCode(t *testing.T) {
	s := &exportStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "GET", "/api/me/export", "")
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "reauth_required") {
		t.Fatalf("old code: %d %s, want 403 reauth_required", rec.Code, rec.Body)
	}
	if s.calls != 0 {
		t.Error("reached the store without a fresh code")
	}
}

// Three downloads an hour; a refused code doesn't use one up.
func TestExportRateLimit(t *testing.T) {
	s := &exportStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	send(h, "GET", "/api/me/export", "") // refused: old code
	for i := 0; i < 3; i++ {
		if rec := sendFresh(h, "GET", "/api/me/export", ""); rec.Code != http.StatusOK {
			t.Fatalf("download %d: %d", i+1, rec.Code)
		}
	}
	rec := sendFresh(h, "GET", "/api/me/export", "")
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("4th download: %d (Retry-After %q), want 429 with Retry-After", rec.Code, rec.Header().Get("Retry-After"))
	}
	if s.calls != 3 {
		t.Errorf("store calls = %d, want 3", s.calls)
	}
}

func TestDecimal(t *testing.T) {
	for _, c := range []struct {
		minor int64
		cur   string
		want  string
	}{{123456, "USD", "1234.56"}, {-5, "USD", "-0.05"}, {1200, "JPY", "1200"}, {1234, "KWD", "1.234"}, {150000, "BTC", "1500.00"}, {42, "X1", "42"}} {
		if got := decimal(c.minor, c.cur); got != c.want {
			t.Errorf("decimal(%d, %s) = %q, want %q", c.minor, c.cur, got, c.want)
		}
	}
}
