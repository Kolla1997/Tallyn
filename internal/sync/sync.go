// Package sync keeps linked banks up to date: every few hours it pulls new,
// changed and removed transactions and current balances from Plaid, and about
// once a day credit card details (#27), and saves them through the database's
// system role (ADR 0005).
//
// Security:
//   - Only this package gets the system database access (db.System).
//   - Access tokens are decrypted one bank at a time, in memory, only for the
//     Plaid call. They're never logged.
//   - Logs carry counts and our own bank IDs only: no merchants, amounts,
//     places or tokens.
package sync

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// Store is the system database access. *db.System implements it.
type Store interface {
	ItemsToSync(ctx context.Context) ([]db.SyncItem, error)
	Item(ctx context.Context, id string) (db.SyncItem, error)
	SaveSync(ctx context.Context, item db.SyncItem, r plaid.SyncResult) (db.SyncStats, error)
	SetStatus(ctx context.Context, id, status string) error
	SaveCreditCards(ctx context.Context, item db.SyncItem, cards []plaid.CreditCard) error
	SaveAccounts(ctx context.Context, item db.SyncItem, accounts []plaid.Account) error
}

// Plaid fetches transaction changes and card details. *plaid.Client implements it.
type Plaid interface {
	SyncTransactions(ctx context.Context, accessToken, cursor string) (plaid.SyncResult, error)
	Liabilities(ctx context.Context, accessToken string) ([]plaid.CreditCard, error)
	Accounts(ctx context.Context, accessToken string) (plaid.Item, []plaid.Account, error)
}

// cardsEvery is how often card details are fetched: Plaid refreshes them
// about once a day, and each call counts against the bank's rate limit.
const cardsEvery = 20 * time.Hour

// Tokens decrypts access tokens. *tokencrypt.Box implements it.
type Tokens interface {
	Open(sealed, ad []byte) ([]byte, error)
}

// Outcome of syncing one bank.
type Outcome string

const (
	Synced       Outcome = "synced"
	NotReady     Outcome = "not_ready"    // new link, Plaid's first pull still running
	NeedsReauth  Outcome = "needs_reauth" // the person must log in to their bank again
	Disconnected Outcome = "disconnected" // removed at Plaid
	Failed       Outcome = "failed"       // try again next run
)

// Syncer runs the bank sync.
type Syncer struct {
	store   Store
	plaid   Plaid
	tokens  Tokens
	every   time.Duration
	perBank time.Duration
	retries []time.Duration // after a new link while Plaid isn't ready yet
	now     chan request
}

type request struct {
	bankID  string
	attempt int
}

// New returns a Syncer that syncs every bank each `every` (6 hours, decided 2026-10-09).
func New(store Store, p Plaid, tokens Tokens, every time.Duration) *Syncer {
	return &Syncer{
		store:   store,
		plaid:   p,
		tokens:  tokens,
		every:   every,
		perBank: 2 * time.Minute,
		retries: []time.Duration{1 * time.Minute, 5 * time.Minute, 30 * time.Minute},
		now:     make(chan request, 64),
	}
}

// Run syncs every bank now and then every s.every, and syncs single banks on
// request (SyncNow), until ctx ends. Everything runs on this one goroutine, so
// two syncs of the same bank never overlap in this process. Across processes,
// SaveSync's cursor check drops the slower one.
func (s *Syncer) Run(ctx context.Context) {
	ticker := time.NewTicker(s.every)
	defer ticker.Stop()
	s.SyncAll(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.SyncAll(ctx)
		case r := <-s.now:
			s.syncRequested(ctx, r)
		}
	}
}

// SyncNow asks for one bank to be synced soon, e.g. right after it's linked.
// It never blocks: if the queue is full, the next scheduled run covers it.
func (s *Syncer) SyncNow(bankID string) {
	s.enqueue(request{bankID: bankID})
}

func (s *Syncer) enqueue(r request) {
	select {
	case s.now <- r:
	default:
		log.Printf("sync: queue full, bank %s waits for the next run", r.bankID)
	}
}

func (s *Syncer) syncRequested(ctx context.Context, r request) {
	item, err := s.store.Item(ctx, r.bankID)
	if errors.Is(err, db.ErrNotFound) {
		return // unlinked meanwhile
	}
	if err != nil {
		log.Printf("sync: bank %s: load: %v", r.bankID, err)
		return
	}
	if item.Status != "active" {
		return
	}
	if s.SyncOne(ctx, item) == NotReady && r.attempt < len(s.retries) {
		next := request{bankID: r.bankID, attempt: r.attempt + 1}
		time.AfterFunc(s.retries[r.attempt], func() { s.enqueue(next) })
	}
}

// SyncAll syncs every active bank, one at a time. A failing bank doesn't stop
// the others. It returns how many banks ended in each outcome.
func (s *Syncer) SyncAll(ctx context.Context) map[Outcome]int {
	counts := map[Outcome]int{}
	items, err := s.store.ItemsToSync(ctx)
	if err != nil {
		log.Printf("sync: list banks: %v", err)
		return counts
	}
	for _, item := range items {
		if ctx.Err() != nil {
			break
		}
		counts[s.SyncOne(ctx, item)]++
	}
	if len(items) > 0 {
		log.Printf("sync: run done: %d banks %v", len(items), counts)
	}
	return counts
}

// SyncOne syncs one bank and saves the result, or marks the bank when it
// needs the person to log in again or was removed at Plaid.
func (s *Syncer) SyncOne(ctx context.Context, item db.SyncItem) Outcome {
	ctx, cancel := context.WithTimeout(ctx, s.perBank)
	defer cancel()

	token, err := s.tokens.Open(item.Sealed, []byte(item.PlaidItemID))
	if err != nil {
		log.Printf("sync: bank %s: cannot decrypt its access token (wrong TOKEN_ENCRYPTION_KEY?)", item.ID)
		return Failed
	}
	res, err := s.plaid.SyncTransactions(ctx, string(token), item.Cursor)
	switch {
	case plaid.NeedsLogin(err):
		s.setStatus(ctx, item.ID, "needs_reauth")
		return NeedsReauth
	case plaid.IsItemGone(err):
		s.setStatus(ctx, item.ID, "disconnected")
		return Disconnected
	case err != nil:
		log.Printf("sync: bank %s: %v", item.ID, err)
		return Failed
	case res.NotReady:
		return NotReady
	}

	st, err := s.store.SaveSync(ctx, item, res)
	switch {
	case errors.Is(err, db.ErrStaleCursor), errors.Is(err, db.ErrNotFound):
		return Failed // synced elsewhere meanwhile, or unlinked: nothing to do
	case err != nil:
		log.Printf("sync: bank %s: save: %v", item.ID, err)
		return Failed
	}
	log.Printf("sync: bank %s: %d added or changed, %d removed, %d skipped", item.ID, st.Upserted, st.Removed, st.Skipped)
	s.syncCards(ctx, item, string(token))
	return Synced
}

// syncCards refreshes balances and limits, then fetches the bank's credit card
// details, when they're a day old or were never fetched. A failure here never
// fails the bank's sync: transactions are already saved, and the next run
// tries again.
func (s *Syncer) syncCards(ctx context.Context, item db.SyncItem, token string) {
	if item.LiabilitiesSyncedAt != nil && time.Since(*item.LiabilitiesSyncedAt) < cardsEvery {
		return
	}
	// The transaction sync only sends balances with new transactions.
	if _, accounts, err := s.plaid.Accounts(ctx, token); err != nil {
		log.Printf("sync: bank %s: balances: %v", item.ID, err)
	} else if err := s.store.SaveAccounts(ctx, item, accounts); err != nil && !errors.Is(err, db.ErrNotFound) {
		log.Printf("sync: bank %s: save balances: %v", item.ID, err)
	}
	cards, err := s.plaid.Liabilities(ctx, token)
	switch {
	case plaid.NoLiabilities(err):
		var pe *plaid.Error
		errors.As(err, &pe)
		log.Printf("sync: bank %s: no card details (%s)", item.ID, pe.Code)
		cards = nil // no cards, or not shared: clear and wait a day
	case err != nil:
		log.Printf("sync: bank %s: card details: %v", item.ID, err)
		return
	}
	if err := s.store.SaveCreditCards(ctx, item, cards); err != nil && !errors.Is(err, db.ErrNotFound) {
		log.Printf("sync: bank %s: save card details: %v", item.ID, err)
		return
	}
	log.Printf("sync: bank %s: %d credit cards", item.ID, len(cards))
}

func (s *Syncer) setStatus(ctx context.Context, id, status string) {
	if err := s.store.SetStatus(ctx, id, status); err != nil {
		log.Printf("sync: bank %s: set status %s: %v", id, status, err)
		return
	}
	log.Printf("sync: bank %s: marked %s", id, status)
}
