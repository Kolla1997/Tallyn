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

func TestTransactionsRoute(t *testing.T) {
	s := &txStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	rec := send(h, "GET", "/api/transactions?household_id="+testHH+"&limit=20&offset=40&owner=u1&q=fresh&category=FOOD_AND_DRINK", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Fake Grocer") || !strings.Contains(rec.Body.String(), `"more":true`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if s.got != (db.TxFilter{Owner: "u1", Query: "fresh", Category: "FOOD_AND_DRINK", Limit: 20, Offset: 40}) {
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
