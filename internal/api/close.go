package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/Kolla1997/Tallyn/internal/auth"
	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// AccountDeleter deletes a person's Supabase sign-in (#56, ADR 0015).
// *supabaseadmin.Client implements it.
type AccountDeleter interface {
	DeleteUser(ctx context.Context, userID string) error
}

// DeriveClosingKey makes the key for hashing a closed account's email from
// the token encryption key, like DeriveBackupCodeKey.
func DeriveClosingKey(tokenKey []byte) []byte {
	m := hmac.New(sha256.New, tokenKey)
	m.Write([]byte("tallyn closed-account email key v1"))
	return m.Sum(nil)
}

type closer struct {
	store    Store
	plaid    Plaid
	tokens   Tokens
	accounts AccountDeleter
	key      []byte
}

// close answers POST /api/me/close {"email": "..."} (#56). In order, and
// stopping at the first problem:
//  1. a 2FA code from the last few minutes, and the typed email matches;
//  2. not the only owner of a household with other people in it;
//  3. each of the person's own banks is removed at Plaid, then deleted here
//     (a bank Plaid already lost counts as removed);
//  4. the closing record is written, and households they're alone in go;
//  5. the Supabase sign-in is deleted, and everything else goes by cascade.
//
// Steps 3–5 are safe to run again, so a closing that fails part-way can be
// finished by trying again.
func (c closer) close(w http.ResponseWriter, r *http.Request) {
	uid, ok := userID(w, r)
	if !ok || !recentCode(w, r) {
		return
	}
	if c.plaid == nil || c.tokens == nil || c.accounts == nil || len(c.key) == 0 {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	s, _ := auth.FromContext(r.Context())
	email := strings.ToLower(strings.TrimSpace(s.Email))
	if email == "" || strings.ToLower(strings.TrimSpace(body.Email)) != email {
		writeError(w, http.StatusBadRequest, "email_mismatch")
		return
	}

	blocker, err := c.store.ClosingBlocker(r.Context(), uid)
	if err != nil {
		log.Printf("api: close: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	if blocker != "" {
		writeError(w, http.StatusConflict, blocker)
		return
	}

	banks, err := c.store.ClosingBanks(r.Context(), uid)
	if err != nil {
		log.Printf("api: close: banks: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	for _, b := range banks {
		token, err := c.tokens.Open(b.Sealed, []byte(b.PlaidItemID))
		if err != nil {
			log.Printf("api: close: bank %s: cannot decrypt the access token", b.ID)
			writeError(w, http.StatusInternalServerError, "cannot_revoke")
			return
		}
		if err := c.plaid.RemoveItem(r.Context(), string(token)); err != nil && !plaid.IsItemGone(err) {
			log.Printf("api: close: bank %s: %v", b.ID, err)
			writeError(w, http.StatusBadGateway, "bank_service_error")
			return
		}
		if err := c.store.DeleteBank(r.Context(), uid, b.ID); err != nil && !errors.Is(err, db.ErrNotFound) {
			log.Printf("api: close: bank %s: delete after Plaid removal: %v", b.ID, err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
	}

	m := hmac.New(sha256.New, c.key)
	m.Write([]byte(email))
	if err := c.store.PrepareClosing(r.Context(), uid, m.Sum(nil)); err != nil {
		if errors.Is(err, db.ErrLastOwner) {
			writeError(w, http.StatusConflict, "last_owner")
			return
		}
		log.Printf("api: close: record: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	if err := c.accounts.DeleteUser(r.Context(), uid); err != nil {
		log.Printf("api: close: delete sign-in: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	log.Printf("api: close: an account was closed (%d banks removed)", len(banks))
	w.WriteHeader(http.StatusNoContent)
}
