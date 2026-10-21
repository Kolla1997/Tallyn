package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Budgets routes (#13). The database rules are tested in internal/db.

type budgetStore struct {
	stubStore
	gotUser, gotHH, gotID string
	gotToday              time.Time
	gotBudget             db.NewBudget
	gotCount              *bool
	err                   error
}

func (s *budgetStore) Budgets(_ context.Context, uid, hh string, today time.Time) ([]db.Budget, []db.BudgetCounter, error) {
	s.gotUser, s.gotHH, s.gotToday = uid, hh, today
	cat := "FOOD_AND_DRINK"
	return []db.Budget{{ID: "b1", Category: &cat, Period: "month", AmountMinor: 60000, Currency: "USD", SpentMinor: 1234, Days: []db.DayTotal{{Date: "2026-10-01", AmountMinor: 1234}}}},
		[]db.BudgetCounter{{UserID: testUser, Counted: true}}, s.err
}
func (s *budgetStore) CreateBudget(_ context.Context, uid, hh string, b db.NewBudget) (string, error) {
	s.gotUser, s.gotHH, s.gotBudget = uid, hh, b
	return "new-id", s.err
}
func (s *budgetStore) UpdateBudget(_ context.Context, uid, id string, b db.NewBudget) error {
	s.gotUser, s.gotID, s.gotBudget = uid, id, b
	return s.err
}
func (s *budgetStore) DeleteBudget(_ context.Context, uid, id string) error {
	s.gotUser, s.gotID = uid, id
	return s.err
}
func (s *budgetStore) SetCountInBudgets(_ context.Context, uid, hh string, on bool) error {
	s.gotUser, s.gotHH, s.gotCount = uid, hh, &on
	return s.err
}

func TestBudgetRoutes(t *testing.T) {
	s := &budgetStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	today := time.Now().UTC().Format("2006-01-02")

	rec := send(h, "GET", "/api/budgets?household_id="+testHH+"&today="+today, "")
	if rec.Code != http.StatusOK || s.gotUser != testUser || s.gotHH != testHH || s.gotToday.Format("2006-01-02") != today {
		t.Fatalf("GET: %d user %q hh %q today %v", rec.Code, s.gotUser, s.gotHH, s.gotToday)
	}
	var out struct {
		Today    string
		Budgets  []db.Budget
		Counting []db.BudgetCounter
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Today != today || len(out.Budgets) != 1 || out.Budgets[0].SpentMinor != 1234 || len(out.Budgets[0].Days) != 1 || len(out.Counting) != 1 {
		t.Fatalf("GET body: %s", rec.Body)
	}
	// A date far from the server's is ignored: the server's date is used.
	send(h, "GET", "/api/budgets?household_id="+testHH+"&today=2001-01-01", "")
	if s.gotToday.Format("2006-01-02") != today {
		t.Errorf("far-off today accepted: %v", s.gotToday)
	}

	body := `{"household_id":"` + testHH + `","member_user_id":"","category":"FOOD_AND_DRINK","period":"month","amount_minor":60000}`
	if rec := send(h, "POST", "/api/budgets", body); rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), "new-id") || s.gotBudget.AmountMinor != 60000 || s.gotBudget.Period != "month" {
		t.Fatalf("POST: %d %s %+v", rec.Code, rec.Body, s.gotBudget)
	}
	if rec := send(h, "POST", "/api/budgets", `{"household_id":"x","created_by":"someone"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown field: %d, want 400", rec.Code)
	}

	// Editing never changes whom it covers.
	if rec := send(h, "PUT", "/api/budgets/b1", `{"member_user_id":"someone","period":"week","amount_minor":5000}`); rec.Code != http.StatusBadRequest {
		t.Errorf("PUT with member: %d, want 400", rec.Code)
	}
	if rec := send(h, "PUT", "/api/budgets/b1", `{"category":"","period":"week","amount_minor":5000}`); rec.Code != http.StatusNoContent || s.gotID != "b1" || s.gotBudget.MemberUserID != "" || s.gotBudget.Period != "week" {
		t.Errorf("PUT: %d id %q %+v", rec.Code, s.gotID, s.gotBudget)
	}
	if rec := send(h, "DELETE", "/api/budgets/b1", ""); rec.Code != http.StatusNoContent || s.gotID != "b1" {
		t.Errorf("DELETE: %d", rec.Code)
	}
	// Counting: the literal route wins over /{id}, and only for yourself.
	if rec := send(h, "PUT", "/api/budgets/counting", `{"household_id":"`+testHH+`","count":true}`); rec.Code != http.StatusNoContent || s.gotCount == nil || !*s.gotCount || s.gotUser != testUser {
		t.Errorf("counting: %d %v", rec.Code, s.gotCount)
	}
	if rec := send(h, "PUT", "/api/budgets/counting", `{"household_id":"`+testHH+`","user_id":"someone-else","count":true}`); rec.Code != http.StatusBadRequest {
		t.Errorf("counting for someone else: %d, want 400", rec.Code)
	}

	for err, want := range map[error]int{db.ErrForbidden: 403, db.ErrNotFound: 404, db.ErrInvalid: 400} {
		s.err = err
		if rec := send(h, "POST", "/api/budgets", body); rec.Code != want {
			t.Errorf("%v: %d, want %d", err, rec.Code, want)
		}
	}
}
