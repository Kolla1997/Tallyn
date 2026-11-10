package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Bills (#127). The rules live in the database (db/bills_test.go); these
// check the routes pass things through.
type billStore struct {
	stubStore
	month    time.Time
	created  db.NewBill
	paidID   string
	paidDue  time.Time
	paid     int64
	paidOn   time.Time
	paidTx   string
	unmarked time.Time
	deleted  string
	err      error
}

func (s *billStore) Bills(_ context.Context, _, _ string, month, _ time.Time) ([]db.Bill, []db.BillDue, error) {
	s.month = month
	return []db.Bill{{ID: "b1", Name: "Rent", AmountMinor: 150000, Currency: "USD", Frequency: "monthly", DueDay: 1}},
		[]db.BillDue{{BillID: "b1", Due: "2026-11-01", Status: "due", ExpectedMinor: 150000}}, s.err
}
func (s *billStore) CreateBill(_ context.Context, _, _ string, b db.NewBill) (string, error) {
	s.created = b
	return "b1", s.err
}
func (s *billStore) UpdateBill(context.Context, string, string, db.NewBill) error { return s.err }
func (s *billStore) DeleteBill(_ context.Context, _, id string) error             { s.deleted = id; return s.err }
func (s *billStore) MarkBillPaid(_ context.Context, _, id string, due time.Time, n int64, on time.Time, txID string) error {
	s.paidID, s.paidDue, s.paid, s.paidOn, s.paidTx = id, due, n, on, txID
	return s.err
}
func (s *billStore) UnmarkBillPaid(_ context.Context, _, _ string, due time.Time) error {
	s.unmarked = due
	return s.err
}

func TestBillRoutes(t *testing.T) {
	s := &billStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "GET", "/api/bills?household_id="+testHH+"&month=2026-11", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"Rent"`) || !strings.Contains(rec.Body.String(), `"status":"due"`) || s.month.Month() != time.November {
		t.Fatalf("GET bills: %d %s", rec.Code, rec.Body)
	}
	if rec := send(h, "GET", "/api/bills?household_id="+testHH+"&month=nope", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("bad month: %d, want 400", rec.Code)
	}
	rec = send(h, "POST", "/api/bills", `{"household_id":"`+testHH+`","name":"Rent","amount_minor":150000,"frequency":"monthly","due_day":1,"starts_on":"2026-11"}`)
	if rec.Code != http.StatusCreated || s.created.Name != "Rent" || s.created.DueDay != 1 {
		t.Fatalf("POST bill: %d %s %+v", rec.Code, rec.Body, s.created)
	}
	rec = send(h, "PUT", "/api/bills/b1/payments/2026-11-15", `{"paid_minor":7135,"paid_on":"2026-11-09","transaction_id":"t1"}`)
	if rec.Code != http.StatusNoContent || s.paidID != "b1" || s.paid != 7135 || s.paidDue.Day() != 15 || s.paidOn.Day() != 9 || s.paidTx != "t1" {
		t.Fatalf("PUT payment: %d %+v", rec.Code, s)
	}
	if rec := send(h, "PUT", "/api/bills/b1/payments/2026-11-15", `{"paid_minor":7135,"paid_on":"soon"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad paid_on: %d, want 400", rec.Code)
	}
	if rec := send(h, "DELETE", "/api/bills/b1/payments/2026-11-15", ""); rec.Code != http.StatusNoContent || s.unmarked.Day() != 15 {
		t.Errorf("DELETE payment: %d", rec.Code)
	}
	if rec := send(h, "DELETE", "/api/bills/b1", ""); rec.Code != http.StatusNoContent || s.deleted != "b1" {
		t.Errorf("DELETE bill: %d", rec.Code)
	}
	s.err = db.ErrForbidden
	if rec := send(h, "GET", "/api/bills?household_id="+testHH, ""); rec.Code != http.StatusForbidden {
		t.Errorf("not an owner: %d, want 403", rec.Code)
	}
}
