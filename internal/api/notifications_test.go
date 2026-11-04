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
	saved  db.NotificationSettings
	closed []string
	err    error
}

func (s *notifStore) DismissNotifications(_ context.Context, _ string, ids []string) error {
	s.closed = ids
	return s.err
}
func (s *notifStore) NotificationSettingsFor(context.Context, string, string) (db.NotificationSettings, error) {
	return db.NotificationSettings{BigPurchase: true, BigPurchaseMinor: 50000}, s.err
}
func (s *notifStore) SaveNotificationSettings(_ context.Context, _, _ string, in db.NotificationSettings) error {
	s.saved = in
	return s.err
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

func TestNotificationSettingsRoutes(t *testing.T) {
	s := &notifStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	if rec := send(h, "GET", "/api/notifications/settings?household_id="+testHH, ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"big_purchase_minor":50000`) {
		t.Fatalf("GET: %d %s", rec.Code, rec.Body)
	}
	rec := send(h, "PUT", "/api/notifications/settings?household_id="+testHH, `{"big_purchase":true,"big_purchase_minor":75000,"low_balance":false,"low_balance_minor":10000,"joined":true,"share_with":null}`)
	if rec.Code != http.StatusNoContent || s.saved.BigPurchaseMinor != 75000 || s.saved.LowBalance {
		t.Fatalf("PUT: %d %+v", rec.Code, s.saved)
	}
	s.err = db.ErrForbidden
	if rec := send(h, "PUT", "/api/notifications/settings?household_id="+testHH, `{}`); rec.Code != http.StatusForbidden {
		t.Errorf("not allowed: %d, want 403", rec.Code)
	}
}

func TestDismissRoute(t *testing.T) {
	s := &notifStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	if rec := send(h, "POST", "/api/notifications/dismiss", `{"ids":["n1","n2"]}`); rec.Code != http.StatusNoContent || len(s.closed) != 2 {
		t.Fatalf("dismiss: %d %v", rec.Code, s.closed)
	}
	s.err = db.ErrInvalid
	if rec := send(h, "POST", "/api/notifications/dismiss", `{"ids":[]}`); rec.Code != http.StatusBadRequest {
		t.Errorf("no ids: %d, want 400", rec.Code)
	}
}
