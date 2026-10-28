package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Plan from your income (#133). The rules live in the database
// (db/plans_test.go); these check the routes pass things through.
type planStore struct {
	stubStore
	gotHH, gotMember string
	gotToday         time.Time
	saved            db.NewPlan
	saveErr          error
	deleted          string
}

func (s *planStore) Plans(_ context.Context, _, hh string, today time.Time) ([]db.Plan, error) {
	s.gotHH, s.gotToday = hh, today
	return []db.Plan{{ID: "p1", MonthlyIncomeMinor: 640000, Template: "50-30-20"}}, nil
}
func (s *planStore) PlanSuggestion(_ context.Context, _, hh, member string, _ time.Time) (int64, error) {
	s.gotHH, s.gotMember = hh, member
	return 500000, nil
}
func (s *planStore) SavePlan(_ context.Context, _, hh string, p db.NewPlan) (string, error) {
	s.gotHH, s.saved = hh, p
	return "p1", s.saveErr
}
func (s *planStore) DeletePlan(_ context.Context, _, id string) error { s.deleted = id; return nil }

func TestPlanRoutes(t *testing.T) {
	s := &planStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	today := time.Now().UTC().Format("2006-01-02")

	rec := send(h, "GET", "/api/plans?household_id="+testHH+"&today="+today, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"monthly_income_minor":640000`) || s.gotHH != testHH || s.gotToday.Format("2006-01-02") != today {
		t.Fatalf("GET plans: %d %s", rec.Code, rec.Body)
	}
	rec = send(h, "GET", "/api/plans/suggestion?household_id="+testHH+"&member="+testUser, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"monthly_income_minor":500000`) || s.gotMember != testUser {
		t.Fatalf("GET suggestion: %d %s", rec.Code, rec.Body)
	}
	rec = send(h, "PUT", "/api/plans", `{"household_id":"`+testHH+`","monthly_income_minor":640000,"template":"50-30-20","shares":{"needs":50,"wants":30,"save":20}}`)
	if rec.Code != http.StatusOK || s.saved.Template != "50-30-20" || s.saved.Shares["save"] != 20 {
		t.Fatalf("PUT plan: %d %s %+v", rec.Code, rec.Body, s.saved)
	}
	s.saveErr = db.ErrInvalid
	if rec := send(h, "PUT", "/api/plans", `{"household_id":"`+testHH+`"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad plan: %d, want 400", rec.Code)
	}
	s.saveErr = db.ErrForbidden
	if rec := send(h, "PUT", "/api/plans", `{"household_id":"`+testHH+`"}`); rec.Code != http.StatusForbidden {
		t.Errorf("not allowed: %d, want 403", rec.Code)
	}
	if rec := send(h, "DELETE", "/api/plans/p1", ""); rec.Code != http.StatusNoContent || s.deleted != "p1" {
		t.Errorf("DELETE plan: %d", rec.Code)
	}
}
