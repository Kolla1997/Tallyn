package api

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// transactions returns the household's recent transactions the caller may
// see (#9). Time and location are included only where can_see_whereabouts allows.
func transactions(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		list, err := store.Transactions(r.Context(), uid, r.URL.Query().Get("household_id"), limit)
		if err != nil {
			log.Printf("api: transactions: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"transactions": list})
	}
}

// spending returns money out by category for a month (default: this month, UTC).
func spending(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		month := r.URL.Query().Get("month")
		if month == "" {
			month = time.Now().UTC().Format("2006-01")
		}
		list, err := store.Spending(r.Context(), uid, r.URL.Query().Get("household_id"), month)
		if errors.Is(err, db.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err != nil {
			log.Printf("api: spending: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"month": month, "spending": list})
	}
}
