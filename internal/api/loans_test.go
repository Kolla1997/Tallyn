package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Loans (#306). The rules and maths live in db (loans_test.go); these check the routes.
type loanStore struct {
	stubStore
	created db.NewLoan
	balance int64
	extra   int64
	err     error
}

func (s *loanStore) Loans(context.Context, string, string, time.Time) ([]db.ManualLoan, error) {
	return []db.ManualLoan{{ID: "l1", Name: "Toyota car loan", PaymentMinor: 47064, BalanceMinor: 2047664}}, s.err
}
func (s *loanStore) CreateLoan(_ context.Context, _, _ string, l db.NewLoan, _ time.Time) (string, error) {
	s.created = l
	return "l1", s.err
}
func (s *loanStore) UpdateLoan(context.Context, string, string, db.NewLoan) error { return s.err }
func (s *loanStore) SetLoanBalance(_ context.Context, _, _ string, n int64, _ time.Time) error {
	s.balance = n
	return s.err
}
func (s *loanStore) AddLoanExtra(_ context.Context, _, _ string, n int64, _ time.Time) error {
	s.extra = n
	return s.err
}

func TestLoanRoutes(t *testing.T) {
	s := &loanStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	if rec := send(h, "GET", "/api/loans?household_id="+testHH, ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"payment_minor":47064`) {
		t.Fatalf("GET loans: %d %s", rec.Code, rec.Body)
	}
	rec := send(h, "POST", "/api/loans", `{"household_id":"`+testHH+`","name":"Toyota car loan","principal_minor":2500000,"apr":"4.9","months":60,"first_due":"2025-12-05"}`)
	if rec.Code != http.StatusCreated || s.created.APR != "4.9" || s.created.Months != 60 {
		t.Fatalf("POST loan: %d %+v", rec.Code, s.created)
	}
	if rec := send(h, "PUT", "/api/loans/l1/balance", `{"balance_minor":2000000,"on":"2026-11-09"}`); rec.Code != http.StatusNoContent || s.balance != 2000000 {
		t.Errorf("PUT balance: %d", rec.Code)
	}
	if rec := send(h, "POST", "/api/loans/l1/extra", `{"paid_minor":50000,"paid_on":"2026-11-09"}`); rec.Code != http.StatusNoContent || s.extra != 50000 {
		t.Errorf("POST extra: %d", rec.Code)
	}
	if rec := send(h, "POST", "/api/loans/l1/extra", `{"paid_minor":50000,"paid_on":"soon"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad date: %d", rec.Code)
	}
	s.err = db.ErrForbidden
	if rec := send(h, "GET", "/api/loans?household_id="+testHH, ""); rec.Code != http.StatusForbidden {
		t.Errorf("not an owner: %d", rec.Code)
	}
}
