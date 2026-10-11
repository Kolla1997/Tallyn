package api

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// transactions returns one page of the household's transactions the caller
// may see (#9, #42), optionally for one member (owner), matching a merchant
// search (q), a category or a month. RLS decides what's visible; filters only narrow it.
func transactions(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		q := r.URL.Query()
		limit, _ := strconv.Atoi(q.Get("limit"))
		offset, _ := strconv.Atoi(q.Get("offset"))
		list, more, err := store.Transactions(r.Context(), uid, q.Get("household_id"), db.TxFilter{
			Owner:    q.Get("owner"),
			Query:    q.Get("q"),
			Category: q.Get("category"),
			Month:    q.Get("month"),
			Limit:    limit,
			Offset:   offset,
		})
		if errors.Is(err, db.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err != nil {
			log.Printf("api: transactions: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"transactions": list, "more": more})
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
