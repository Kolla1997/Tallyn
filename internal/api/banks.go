package api

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// Plaid is the part of the Plaid API the bank routes use. *plaid.Client implements it.
type Plaid interface {
	CreateLinkToken(ctx context.Context, userID string) (string, error)
	ExchangePublicToken(ctx context.Context, publicToken string) (accessToken, itemID string, err error)
	Accounts(ctx context.Context, accessToken string) (plaid.Item, []plaid.Account, error)
	InstitutionName(ctx context.Context, institutionID string) (string, error)
	RemoveItem(ctx context.Context, accessToken string) error
}

// Tokens encrypts access tokens before storage. *tokencrypt.Box implements it.
type Tokens interface {
	Seal(plaintext, ad []byte) ([]byte, error)
	Open(sealed, ad []byte) ([]byte, error)
}

// banks holds the bank-linking routes (#8, ADR 0004).
//
// Access tokens exist in plain text only in memory, between Plaid and
// Tokens.Seal (link) or Tokens.Open and Plaid (unlink). They're never logged,
// returned to the browser or stored unencrypted.
type banks struct {
	store  Store
	plaid  Plaid
	tokens Tokens
}

func (b banks) needsPlaid(h http.HandlerFunc) http.HandlerFunc {
	if b.plaid == nil || b.tokens == nil {
		return func(w http.ResponseWriter, _ *http.Request) {
			writeError(w, http.StatusServiceUnavailable, "bank_linking_not_configured")
		}
	}
	return h
}

// linkToken starts Plaid Link. Only owners and adults of the household get one.
func (b banks) linkToken(w http.ResponseWriter, r *http.Request) {
	uid, ok := userID(w, r)
	if !ok {
		return
	}
	var in struct {
		HouseholdID string `json:"household_id"`
	}
	if !readJSON(w, r, &in) || !b.mayLink(w, r, uid, in.HouseholdID) {
		return
	}
	tok, err := b.plaid.CreateLinkToken(r.Context(), uid)
	if err != nil {
		log.Printf("api: link token: %v", err)
		writeError(w, http.StatusBadGateway, "bank_service_error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"link_token": tok})
}

// exchange finishes Plaid Link: swap the public token, fetch the accounts,
// encrypt the access token and save it all through link_plaid_item.
func (b banks) exchange(w http.ResponseWriter, r *http.Request) {
	uid, ok := userID(w, r)
	if !ok {
		return
	}
	var in struct {
		HouseholdID string `json:"household_id"`
		PublicToken string `json:"public_token"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if !strings.HasPrefix(in.PublicToken, "public-") || len(in.PublicToken) > 200 {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	// Check before calling Plaid, so nobody can create items they can't save.
	if !b.mayLink(w, r, uid, in.HouseholdID) {
		return
	}

	accessToken, itemID, err := b.plaid.ExchangePublicToken(r.Context(), in.PublicToken)
	if err != nil {
		log.Printf("api: exchange: %v", err)
		writeError(w, http.StatusBadGateway, "bank_service_error")
		return
	}

	// From here on a live access token exists at Plaid. If we can't save it,
	// revoke it so nothing is left connected (or billed) without a record.
	saved := false
	defer func() {
		if !saved {
			b.revokeQuietly(accessToken, itemID)
		}
	}()

	item, accounts, err := b.plaid.Accounts(r.Context(), accessToken)
	if err != nil || len(accounts) == 0 {
		log.Printf("api: exchange: accounts for item %s: %v (%d accounts)", itemID, err, len(accounts))
		writeError(w, http.StatusBadGateway, "bank_service_error")
		return
	}
	name := item.InstitutionName
	if name == "" && item.InstitutionID != "" {
		name, _ = b.plaid.InstitutionName(r.Context(), item.InstitutionID) // display only
	}
	sealed, err := b.tokens.Seal([]byte(accessToken), []byte(itemID))
	if err != nil {
		log.Printf("api: exchange: encrypt: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}

	id, err := b.store.LinkBank(r.Context(), uid, in.HouseholdID, db.NewBank{
		PlaidItemID:       itemID,
		AccessTokenSealed: sealed,
		InstitutionID:     item.InstitutionID,
		InstitutionName:   name,
		Accounts:          accounts,
	})
	switch {
	case errors.Is(err, db.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, db.ErrAlreadyLinked):
		writeError(w, http.StatusConflict, "already_linked")
	case err != nil:
		log.Printf("api: exchange: save item %s: %v", itemID, err)
		writeError(w, http.StatusInternalServerError, "internal")
	default:
		saved = true
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// list returns the household's banks and accounts that the caller may see.
func (b banks) list(w http.ResponseWriter, r *http.Request) {
	uid, ok := userID(w, r)
	if !ok {
		return
	}
	list, err := b.store.Banks(r.Context(), uid, r.URL.Query().Get("household_id"))
	if err != nil {
		log.Printf("api: banks: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"banks": list})
}

// unlink revokes the bank at Plaid first, then deletes our copy. If Plaid
// can't be reached, the bank stays so the person can try again: deleting only
// our row would leave the access token valid at Plaid.
func (b banks) unlink(w http.ResponseWriter, r *http.Request) {
	uid, ok := userID(w, r)
	if !ok {
		return
	}
	bankID := r.PathValue("id")
	itemID, sealed, err := b.store.UnlinkTarget(r.Context(), uid, bankID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if err != nil {
		log.Printf("api: unlink %s: %v", bankID, err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	accessToken, err := b.tokens.Open(sealed, []byte(itemID))
	if err != nil {
		log.Printf("api: unlink %s: cannot decrypt the access token (wrong TOKEN_ENCRYPTION_KEY?)", bankID)
		writeError(w, http.StatusInternalServerError, "cannot_revoke")
		return
	}
	if err := b.plaid.RemoveItem(r.Context(), string(accessToken)); err != nil && !plaid.IsItemGone(err) {
		log.Printf("api: unlink %s: %v", bankID, err)
		writeError(w, http.StatusBadGateway, "bank_service_error")
		return
	}
	if err := b.store.DeleteBank(r.Context(), uid, bankID); err != nil {
		log.Printf("api: unlink %s: delete after Plaid removal: %v", bankID, err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (b banks) mayLink(w http.ResponseWriter, r *http.Request, uid, householdID string) bool {
	ok, err := b.store.CanLink(r.Context(), uid, householdID)
	if err != nil {
		log.Printf("api: can link: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return false
	}
	if !ok {
		writeError(w, http.StatusForbidden, "forbidden")
	}
	return ok
}

// revokeQuietly removes an item we couldn't save. It runs even if the
// request was cancelled.
func (b banks) revokeQuietly(accessToken, itemID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := b.plaid.RemoveItem(ctx, accessToken); err != nil && !plaid.IsItemGone(err) {
		log.Printf("api: could not revoke unsaved item %s: %v", itemID, err)
	}
}
