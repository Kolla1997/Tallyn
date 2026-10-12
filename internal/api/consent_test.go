package api

import (
	"context"
	"net/http"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
)

type consentStore struct {
	stubStore
	have     []db.Consent
	accepted map[string]string
}

func (s *consentStore) Consents(context.Context, string) ([]db.Consent, error) { return s.have, nil }
func (s *consentStore) Accept(_ context.Context, _ string, v map[string]string) error {
	s.accepted = v
	return nil
}

func TestConsentRoutes(t *testing.T) {
	s := &consentStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})

	if rec := send(h, "GET", "/api/consent", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"needed":true`) {
		t.Fatalf("no consents yet: %d %s", rec.Code, rec.Body)
	}
	body := `{"terms":"` + CurrentVersions["terms"] + `","privacy":"` + CurrentVersions["privacy"] + `"}`
	if rec := send(h, "POST", "/api/consent", body); rec.Code != http.StatusNoContent || s.accepted["terms"] != CurrentVersions["terms"] {
		t.Fatalf("accept: %d, stored %v", rec.Code, s.accepted)
	}
	s.accepted = nil
	if rec := send(h, "POST", "/api/consent", `{"terms":"0.0-old","privacy":"`+CurrentVersions["privacy"]+`"}`); rec.Code != http.StatusConflict || s.accepted != nil {
		t.Fatalf("old version: %d, want 409 and nothing stored", rec.Code)
	}
	s.have = []db.Consent{{Document: "terms", Version: CurrentVersions["terms"]}, {Document: "privacy", Version: CurrentVersions["privacy"]}}
	if rec := send(h, "GET", "/api/consent", ""); !strings.Contains(rec.Body.String(), `"needed":false`) {
		t.Fatalf("after agreeing: %s", rec.Body)
	}
	s.have = []db.Consent{{Document: "terms", Version: "0.0-old"}, {Document: "privacy", Version: CurrentVersions["privacy"]}}
	if rec := send(h, "GET", "/api/consent", ""); !strings.Contains(rec.Body.String(), `"needed":true`) {
		t.Fatalf("an older terms version should ask again: %s", rec.Body)
	}
}

// The versions people agree to must be the versions in legal/*.md.
func TestConsentVersionsMatchDocuments(t *testing.T) {
	re := regexp.MustCompile(`(?m)^version:\s*"?([^"\n]+)"?\s*$`)
	for doc, want := range CurrentVersions {
		b, err := os.ReadFile("../../legal/" + doc + ".md")
		if err != nil {
			t.Fatal(err)
		}
		m := re.FindSubmatch(b)
		if m == nil || string(m[1]) != want {
			t.Errorf("legal/%s.md version = %q, CurrentVersions says %q", doc, m, want)
		}
	}
}
