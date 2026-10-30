package api

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// POST /api/households/{id}/members/{user}/reset-2fa: an owner resets a
// teen's two-step sign-in (#120). Needs a fresh 2FA code (step-up, ADR 0009);
// the browser also asks for the teen's name typed out. The database checks
// who may reset whom, then the teen's authenticators go with the server-only
// key (ADR 0013). The password stays.
func resetMember2FA(store BackupCodeStore, factors FactorRemover) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok || !recentCode(w, r) {
			return
		}
		member := r.PathValue("user")
		err := store.ResetMember2FA(r.Context(), uid, r.PathValue("id"), member, func(ctx context.Context) error {
			return factors.RemoveFactors(ctx, member)
		})
		switch {
		case errors.Is(err, db.ErrForbidden):
			writeError(w, http.StatusForbidden, "forbidden")
			return
		case err != nil:
			log.Printf("api: reset 2FA of %s by %s: %v", member, uid, err)
			writeError(w, http.StatusBadGateway, "reset_failed")
			return
		}
		log.Printf("api: %s reset the 2FA of %s", uid, member)
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /api/recovery/2fa-reset: who last reset the signed-in person's 2FA, and
// when, or null. Reachable with only a password, for the note above setting
// up a new authenticator (#120).
func my2FAReset(store BackupCodeStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		reset, err := store.My2FAReset(r.Context(), uid)
		if err != nil {
			log.Printf("api: 2FA reset note: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"reset": reset})
	}
}
