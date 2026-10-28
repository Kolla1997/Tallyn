package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Savings goals (#14). The rules live in the database (db/goals_test.go);
// these check the routes pass things through.
type goalStore struct {
	stubStore
	created db.NewGoal
	savedID string
	saved   int64
	deleted string
	err     error
}

func (s *goalStore) Goals(context.Context, string, string) ([]db.Goal, error) {
	return []db.Goal{{ID: "g1", Name: "Beach trip", TargetMinor: 500000, Currency: "USD", Visibility: "me"}}, nil
}
func (s *goalStore) CreateGoal(_ context.Context, _, _ string, g db.NewGoal) (string, error) {
	s.created = g
	return "g1", s.err
}
func (s *goalStore) UpdateGoal(context.Context, string, string, db.NewGoal) error { return s.err }
func (s *goalStore) SetGoalSaved(_ context.Context, _, id string, n int64, _ time.Time) error {
	s.savedID, s.saved = id, n
	return s.err
}
func (s *goalStore) DeleteGoal(_ context.Context, _, id string) error { s.deleted = id; return s.err }

func TestGoalRoutes(t *testing.T) {
	s := &goalStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	if rec := send(h, "GET", "/api/goals?household_id="+testHH, ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"Beach trip"`) {
		t.Fatalf("GET goals: %d %s", rec.Code, rec.Body)
	}
	rec := send(h, "POST", "/api/goals", `{"household_id":"`+testHH+`","name":"Beach trip","target_minor":500000,"by_month":"2027-06","visibility":"me"}`)
	if rec.Code != http.StatusCreated || s.created.ByMonth != "2027-06" || s.created.TargetMinor != 500000 {
		t.Fatalf("POST goal: %d %s %+v", rec.Code, rec.Body, s.created)
	}
	if rec := send(h, "PUT", "/api/goals/g1/saved", `{"saved_minor":340000}`); rec.Code != http.StatusNoContent || s.savedID != "g1" || s.saved != 340000 {
		t.Fatalf("PUT saved: %d", rec.Code)
	}
	if rec := send(h, "DELETE", "/api/goals/g1", ""); rec.Code != http.StatusNoContent || s.deleted != "g1" {
		t.Fatalf("DELETE: %d", rec.Code)
	}
	s.err = db.ErrForbidden
	if rec := send(h, "PUT", "/api/goals/g1", `{"name":"x"}`); rec.Code != http.StatusForbidden {
		t.Errorf("not allowed: %d, want 403", rec.Code)
	}
}
