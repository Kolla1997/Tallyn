package sync

import (
	"bytes"
	"context"
	"errors"
	"log"
	"os"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// All tokens, IDs and merchants here are fake.

type fakeStore struct {
	mu      gosync.Mutex
	items   map[string]db.SyncItem
	saved   []string
	status  map[string]string
	saveErr error
}

func newStore(items ...db.SyncItem) *fakeStore {
	s := &fakeStore{items: map[string]db.SyncItem{}, status: map[string]string{}}
	for _, it := range items {
		s.items[it.ID] = it
	}
	return s
}

func (s *fakeStore) ItemsToSync(context.Context) ([]db.SyncItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []db.SyncItem
	for _, id := range []string{"bank-1", "bank-2", "bank-3"} {
		if it, ok := s.items[id]; ok && it.Status == "active" {
			out = append(out, it)
		}
	}
	return out, nil
}
func (s *fakeStore) Item(_ context.Context, id string) (db.SyncItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	it, ok := s.items[id]
	if !ok {
		return it, db.ErrNotFound
	}
	return it, nil
}
func (s *fakeStore) SaveSync(_ context.Context, it db.SyncItem, r plaid.SyncResult) (db.SyncStats, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.saveErr != nil {
		return db.SyncStats{}, s.saveErr
	}
	s.saved = append(s.saved, it.ID+"@"+r.NextCursor)
	return db.SyncStats{Upserted: len(r.Added)}, nil
}
func (s *fakeStore) SetStatus(_ context.Context, id, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status[id] = status
	return nil
}

type fakePlaid struct {
	mu      gosync.Mutex
	results map[string][]result // by access token, consumed in order
	tokens  []string
}

type result struct {
	r   plaid.SyncResult
	err error
}

func (p *fakePlaid) SyncTransactions(_ context.Context, token, cursor string) (plaid.SyncResult, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.tokens = append(p.tokens, token)
	q := p.results[token]
	if len(q) == 0 {
		return plaid.SyncResult{NextCursor: cursor + "+"}, nil
	}
	p.results[token] = q[1:]
	return q[0].r, q[0].err
}

// fakeTokens "decrypts" by stripping a prefix, and fails for anything else.
type fakeTokens struct{}

func (fakeTokens) Open(sealed, ad []byte) ([]byte, error) {
	if !bytes.HasPrefix(sealed, []byte("sealed:")) {
		return nil, errors.New("bad")
	}
	return bytes.TrimPrefix(sealed, []byte("sealed:")), nil
}

func bank(id string) db.SyncItem {
	return db.SyncItem{ID: id, PlaidItemID: "plaid-" + id, Sealed: []byte("sealed:access-" + id), Status: "active"}
}

func captureLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	return &buf
}

func TestSyncAll(t *testing.T) {
	logs := captureLog(t)
	store := newStore(bank("bank-1"), bank("bank-2"), bank("bank-3"))
	p := &fakePlaid{results: map[string][]result{
		"access-bank-1": {{r: plaid.SyncResult{Added: []plaid.Transaction{{Name: "SECRET MERCHANT", MerchantName: "Secret Merchant", AmountMinor: 4242}}, NextCursor: "c1"}}},
		"access-bank-2": {{err: &plaid.Error{Type: "ITEM_ERROR", Code: "ITEM_LOGIN_REQUIRED"}}},
		"access-bank-3": {{err: &plaid.Error{Type: "ITEM_ERROR", Code: "ITEM_NOT_FOUND"}}},
	}}
	s := New(store, p, fakeTokens{}, time.Hour)
	counts := s.SyncAll(context.Background())

	if counts[Synced] != 1 || counts[NeedsReauth] != 1 || counts[Disconnected] != 1 {
		t.Fatalf("counts = %v", counts)
	}
	if strings.Join(store.saved, ",") != "bank-1@c1" {
		t.Fatalf("saved = %v", store.saved)
	}
	if store.status["bank-2"] != "needs_reauth" || store.status["bank-3"] != "disconnected" {
		t.Fatalf("status = %v", store.status)
	}
	// Each bank's own decrypted token went to Plaid.
	if strings.Join(p.tokens, ",") != "access-bank-1,access-bank-2,access-bank-3" {
		t.Fatalf("tokens used = %v", p.tokens)
	}
	// Logs never carry tokens, merchants or amounts.
	for _, secret := range []string{"access-bank", "sealed:", "Secret Merchant", "SECRET", "4242"} {
		if strings.Contains(logs.String(), secret) {
			t.Fatalf("log leaks %q:\n%s", secret, logs.String())
		}
	}
}

func TestOneBadBankDoesntStopTheOthers(t *testing.T) {
	captureLog(t)
	bad := bank("bank-1")
	bad.Sealed = []byte("garbage") // can't be decrypted
	store := newStore(bad, bank("bank-2"), bank("bank-3"))
	p := &fakePlaid{results: map[string][]result{
		"access-bank-2": {{err: errors.New("plaid is down")}},
	}}
	counts := New(store, p, fakeTokens{}, time.Hour).SyncAll(context.Background())
	if counts[Failed] != 2 || counts[Synced] != 1 || len(store.saved) != 1 || store.saved[0] != "bank-3@+" {
		t.Fatalf("counts = %v, saved = %v", counts, store.saved)
	}
	if len(store.status) != 0 {
		t.Fatalf("a temporary failure must not change a bank's status: %v", store.status)
	}
}

func TestStaleSaveIsNotAnError(t *testing.T) {
	captureLog(t)
	store := newStore(bank("bank-1"))
	store.saveErr = db.ErrStaleCursor
	if got := New(store, &fakePlaid{}, fakeTokens{}, time.Hour).SyncOne(context.Background(), bank("bank-1")); got != Failed {
		t.Fatalf("outcome = %v", got)
	}
	if len(store.status) != 0 {
		t.Fatal("status changed")
	}
}

func TestSyncNowRetriesWhileNotReady(t *testing.T) {
	captureLog(t)
	store := newStore(bank("bank-1"))
	p := &fakePlaid{results: map[string][]result{
		"access-bank-1": {
			{r: plaid.SyncResult{NotReady: true}},
			{r: plaid.SyncResult{NotReady: true}},
			{r: plaid.SyncResult{NextCursor: "first"}},
		},
	}}
	s := New(store, p, fakeTokens{}, time.Hour)
	s.retries = []time.Duration{10 * time.Millisecond, 10 * time.Millisecond, 10 * time.Millisecond}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.every = time.Hour
	go s.Run(ctx)
	s.SyncNow("bank-1")

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		store.mu.Lock()
		done := len(store.saved) > 0 && store.saved[len(store.saved)-1] == "bank-1@first"
		store.mu.Unlock()
		if done {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("never synced after Plaid became ready: saved = %v", store.saved)
}

func TestSyncNowSkipsUnlinkedAndInactive(t *testing.T) {
	captureLog(t)
	inactive := bank("bank-2")
	inactive.Status = "needs_reauth"
	store := newStore(inactive)
	p := &fakePlaid{}
	s := New(store, p, fakeTokens{}, time.Hour)
	s.syncRequested(context.Background(), request{bankID: "bank-1"}) // not found
	s.syncRequested(context.Background(), request{bankID: "bank-2"}) // needs reauth
	if len(p.tokens) != 0 {
		t.Fatalf("called Plaid for %v", p.tokens)
	}
}

func TestSyncNowNeverBlocks(t *testing.T) {
	captureLog(t)
	s := New(newStore(), &fakePlaid{}, fakeTokens{}, time.Hour)
	done := make(chan struct{})
	go func() {
		for i := 0; i < 200; i++ { // queue holds 64; nobody is reading
			s.SyncNow("bank-1")
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("SyncNow blocked")
	}
}
