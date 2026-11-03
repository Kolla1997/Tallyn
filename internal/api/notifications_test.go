package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// In-app notifications (#267). Who gets what lives in the database
// (db/notifications_test.go); these check the routes pass things through.
type notifStore struct {
	stubStore
	readID *string
	err    error
}

func (s *notifStore) Notifications(context.Context, string) ([]db.Notification, error) {
	return []db.Notification{{ID: "n1", Kind: "reconnect", NeedsAction: true, Data: json.RawMessage(`{"bank":"Fake Bank"}`)}}, s.err
}
func (s *notifStore) MarkNotificationsRead(_ context.Context, _, id string) error {
	s.readID = &id
	return s.err
}

func TestNotificationRoutes(t *testing.T) {
	s := &notifStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	if rec := send(h, "GET", "/api/notifications", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"bank":"Fake Bank"`) {
		t.Fatalf("GET: %d %s", rec.Code, rec.Body)
	}
	if rec := send(h, "POST", "/api/notifications/read", `{"id":"n1"}`); rec.Code != http.StatusNoContent || s.readID == nil || *s.readID != "n1" {
		t.Fatalf("mark one: %d", rec.Code)
	}
	if rec := send(h, "POST", "/api/notifications/read", `{}`); rec.Code != http.StatusNoContent || *s.readID != "" {
		t.Fatalf("mark all: %d", rec.Code)
	}
	s.err = db.ErrInvalid
	if rec := send(h, "POST", "/api/notifications/read", `{"id":"x"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad id: %d, want 400", rec.Code)
	}
}
