package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// All data here is fake.

type txStore struct {
	stubStore
	got      db.TxFilter
	gotMonth string
	spendErr error
	txErr    error
}

func (s *txStore) Transactions(_ context.Context, uid, hh string, f db.TxFilter) ([]db.Transaction, bool, error) {
	s.got = f
	return []db.Transaction{{ID: "t1", Merchant: "Fake Grocer", AmountMinor: 1234, Currency: "USD", Date: "2026-10-01"}}, true, s.txErr
}
func (s *txStore) Spending(_ context.Context, uid, hh, month string) ([]db.Spend, error) {
	s.gotMonth = month
	return []db.Spend{{Category: "FOOD_AND_DRINK", Currency: "USD", AmountMinor: 1234, Count: 1}}, s.spendErr
}

func (s *txStore) Summary(_ context.Context, uid, hh string, f db.TxFilter) ([]db.TxSummary, error) {
	s.got = f
	return []db.TxSummary{{Currency: "USD", SpentMinor: 1234, Categories: []db.Spend{}, Merchants: []db.MerchantSpend{{Merchant: "Fake Grocer", AmountMinor: 1234, Count: 1}}}}, s.txErr
}

func (s *txStore) Daily(_ context.Context, uid, hh string, f db.TxFilter) ([]db.DaySpend, error) {
	s.got = f
	return []db.DaySpend{{Date: "2026-10-08", Currency: "USD", AmountMinor: 1633, Count: 2, Top: []db.DayTopBuy{{Merchant: "Fake Grocer", AmountMinor: 1200}}}}, s.txErr
}

func TestDailyRoute(t *testing.T) {
	s := &txStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "GET", "/api/transactions/daily?household_id="+testHH+"&year=2026&owner=u1&category=FOOD_AND_DRINK&month=2026-10&day=2026-10-08", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"date":"2026-10-08"`) || !strings.Contains(rec.Body.String(), "Fake Grocer") {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if s.got != (db.TxFilter{Owner: "u1", Category: "FOOD_AND_DRINK", Year: "2026"}) {
		t.Fatalf("filter = %+v (month and day ignored, year used)", s.got)
	}
	send(h, "GET", "/api/transactions/daily?household_id="+testHH, "")
	if s.got.Year != time.Now().UTC().Format("2006") {
		t.Fatalf("default year = %q", s.got.Year)
	}
	s.txErr = db.ErrInvalid
	if rec := send(h, "GET", "/api/transactions/daily?household_id="+testHH+"&year=x", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid: %d", rec.Code)
	}
}

func TestSummaryRoute(t *testing.T) {
	s := &txStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "GET", "/api/transactions/summary?household_id="+testHH+"&owner=u1&q=fresh&category=FOOD_AND_DRINK&month=2026-10", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"spent_minor":1234`) || !strings.Contains(rec.Body.String(), "Fake Grocer") {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if s.got != (db.TxFilter{Owner: "u1", Query: "fresh", Category: "FOOD_AND_DRINK", Month: "2026-10"}) {
		t.Fatalf("filter = %+v (same filters as the list, no paging)", s.got)
	}
	s.txErr = db.ErrInvalid
	if rec := send(h, "GET", "/api/transactions/summary?household_id="+testHH+"&month=bad", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid filter: %d", rec.Code)
	}
	if rec := get(h, "/api/transactions/summary?household_id="+testHH, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("without a session: %d", rec.Code)
	}
}

func TestTransactionsRoute(t *testing.T) {
	s := &txStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "GET", "/api/transactions?household_id="+testHH+"&limit=20&offset=40&owner=u1&q=fresh&category=FOOD_AND_DRINK&month=2026-10&day=2026-10-08", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Fake Grocer") || !strings.Contains(rec.Body.String(), `"more":true`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if s.got != (db.TxFilter{Owner: "u1", Query: "fresh", Category: "FOOD_AND_DRINK", Month: "2026-10", Day: "2026-10-08", Limit: 20, Offset: 40}) {
		t.Fatalf("filter = %+v", s.got)
	}
	s.txErr = db.ErrInvalid
	if rec := send(h, "GET", "/api/transactions?household_id="+testHH+"&owner=bad", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid filter: %d", rec.Code)
	}
	s.txErr = nil
	if rec := get(h, "/api/transactions?household_id="+testHH, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("without a session: %d", rec.Code)
	}
}

func TestSpendingRoute(t *testing.T) {
	s := &txStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "GET", "/api/spending?household_id="+testHH, "")
	if rec.Code != http.StatusOK || s.gotMonth != time.Now().UTC().Format("2006-01") {
		t.Fatalf("got %d, month %q", rec.Code, s.gotMonth)
	}
	send(h, "GET", "/api/spending?household_id="+testHH+"&month=2026-09", "")
	if s.gotMonth != "2026-09" {
		t.Fatalf("month = %q", s.gotMonth)
	}
	s.spendErr = db.ErrInvalid
	if rec := send(h, "GET", "/api/spending?household_id="+testHH+"&month=nope", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad month: %d", rec.Code)
	}
}

func TestLinkTriggersSync(t *testing.T) {
	body := `{"household_id":"` + testHH + `","public_token":"` + fakePublic + `"}`
	var synced []string
	syncNow := func(id string) { synced = append(synced, id) }

	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &bankStore{canLink: true}, Plaid: &fakePlaidAPI{}, Tokens: newTestBox(t), SyncNow: syncNow})
	if rec := send(h, "POST", "/api/plaid/exchange", body); rec.Code != http.StatusCreated {
		t.Fatalf("status = %d", rec.Code)
	}
	if len(synced) != 1 || synced[0] != fakeBankID {
		t.Fatalf("synced = %v, want the new bank", synced)
	}

	h = NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &bankStore{canLink: true, linkErr: db.ErrAlreadyLinked}, Plaid: &fakePlaidAPI{}, Tokens: newTestBox(t), SyncNow: syncNow})
	send(h, "POST", "/api/plaid/exchange", body)
	if len(synced) != 1 {
		t.Fatalf("a failed link must not trigger a sync: %v", synced)
	}
}
