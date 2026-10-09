package api

import (
	"errors"
	"log"
	"net/http"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// sharing returns the household's members and what the caller shares with
// each of them, and what each shares with the caller (#28).
func sharing(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		s, err := store.Sharing(r.Context(), uid, r.URL.Query().Get("household_id"))
		switch {
		case errors.Is(err, db.ErrInvalid):
			writeError(w, http.StatusBadRequest, "bad_request")
		case errors.Is(err, db.ErrForbidden):
			writeError(w, http.StatusForbidden, "forbidden")
		case err != nil:
			log.Printf("api: sharing: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
		default:
			writeJSON(w, http.StatusOK, s)
		}
	}
}

// setSharing replaces what the caller shares with one member. The caller can
// only ever share their own money; the database enforces it.
func setSharing(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			HouseholdID  string   `json:"household_id"`
			ViewerUserID string   `json:"viewer_user_id"`
			Categories   []string `json:"categories"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		err := store.SetSharing(r.Context(), uid, in.HouseholdID, in.ViewerUserID, in.Categories)
		switch {
		case errors.Is(err, db.ErrInvalid):
			writeError(w, http.StatusBadRequest, "invalid_sharing")
		case errors.Is(err, db.ErrForbidden):
			writeError(w, http.StatusForbidden, "forbidden")
		case err != nil:
			log.Printf("api: set sharing: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}
}

// setMe updates the caller's display name, which other members see.
func setMe(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			DisplayName string `json:"display_name"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		err := store.SetDisplayName(r.Context(), uid, in.DisplayName)
		switch {
		case errors.Is(err, db.ErrInvalid):
			writeError(w, http.StatusBadRequest, "invalid_name")
		case err != nil:
			log.Printf("api: set name: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}
}
