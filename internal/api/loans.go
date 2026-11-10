package api

import (
	"net/http"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Loans Plaid can't see (#306). Owners only; the database decides. A loan is
// deleted through its bill (DELETE /api/bills/{id}).

// GET /api/loans?household_id=&today=YYYY-MM-DD
func loans(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		list, err := store.Loans(r.Context(), uid, r.URL.Query().Get("household_id"), localToday(r))
		if err != nil {
			memberError(w, "loans", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"loans": list})
	}
}

// POST /api/loans
func createLoan(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			HouseholdID string `json:"household_id"`
			db.NewLoan
		}
		if !readJSON(w, r, &in) {
			return
		}
		id, err := store.CreateLoan(r.Context(), uid, in.HouseholdID, in.NewLoan, localToday(r))
		if err != nil {
			memberError(w, "create loan", err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// PUT /api/loans/{id}
func updateLoan(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in db.NewLoan
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.UpdateLoan(r.Context(), uid, r.PathValue("id"), in); err != nil {
			memberError(w, "update loan", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// PUT /api/loans/{id}/balance {"balance_minor": n, "on": "YYYY-MM-DD"}
func setLoanBalance(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			BalanceMinor int64  `json:"balance_minor"`
			On           string `json:"on"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		on, err := time.Parse("2006-01-02", in.On)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err := store.SetLoanBalance(r.Context(), uid, r.PathValue("id"), in.BalanceMinor, on); err != nil {
			memberError(w, "loan balance", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// POST /api/loans/{id}/extra {"paid_minor": n, "paid_on": "YYYY-MM-DD"}
func addLoanExtra(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			PaidMinor int64  `json:"paid_minor"`
			PaidOn    string `json:"paid_on"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		on, err := time.Parse("2006-01-02", in.PaidOn)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err := store.AddLoanExtra(r.Context(), uid, r.PathValue("id"), in.PaidMinor, on); err != nil {
			memberError(w, "loan extra", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
