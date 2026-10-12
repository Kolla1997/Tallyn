package api

import (
	"errors"
	"log"
	"net/http"
	"net/url"
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
		f := txFilter(q)
		f.Limit, _ = strconv.Atoi(q.Get("limit"))
		f.Offset, _ = strconv.Atoi(q.Get("offset"))
		list, more, err := store.Transactions(r.Context(), uid, q.Get("household_id"), f)
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

// txFilter reads the filters shared by the list and its summary.
func txFilter(q url.Values) db.TxFilter {
	return db.TxFilter{
		Owner:    q.Get("owner"),
		Query:    q.Get("q"),
		Category: q.Get("category"),
		Month:    q.Get("month"),
		Day:      q.Get("day"),
	}
}

// txSummary totals every transaction matching the same filters as the list
// (#58): money in, spent, transfers, by category and top merchants.
func txSummary(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		q := r.URL.Query()
		list, err := store.Summary(r.Context(), uid, q.Get("household_id"), txFilter(q))
		if errors.Is(err, db.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err != nil {
			log.Printf("api: transactions summary: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"summary": list})
	}
}

// txDaily returns spending per day for a year (#75): totals, counts and the
// top three purchases, with the same person, search and category filters.
func txDaily(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		q := r.URL.Query()
		f := txFilter(q)
		f.Month, f.Day = "", ""
		f.Year = q.Get("year")
		if f.Year == "" {
			f.Year = time.Now().UTC().Format("2006")
		}
		list, err := store.Daily(r.Context(), uid, q.Get("household_id"), f)
		if errors.Is(err, db.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err != nil {
			log.Printf("api: transactions daily: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"year": f.Year, "days": list})
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
