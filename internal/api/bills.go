package api

import (
	"net/http"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Bills Plaid can't see (#127). Only household owners; the database decides.

// GET /api/bills?household_id=&month=YYYY-MM&today=YYYY-MM-DD
func bills(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		today := localToday(r)
		month := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, time.UTC)
		if m := r.URL.Query().Get("month"); m != "" {
			t, err := time.Parse("2006-01", m)
			if err != nil {
				writeError(w, http.StatusBadRequest, "bad_request")
				return
			}
			month = t
		}
		list, dues, err := store.Bills(r.Context(), uid, r.URL.Query().Get("household_id"), month, today)
		if err != nil {
			memberError(w, "bills", err)
			return
		}
		// This month also carries what's still unpaid from the 3 months before (#126).
		earlier := []db.BillDue{}
		if month.Year() == today.Year() && month.Month() == today.Month() {
			if earlier, err = store.EarlierUnpaid(r.Context(), uid, r.URL.Query().Get("household_id"), today); err != nil {
				memberError(w, "bills", err)
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"today": today.Format("2006-01-02"), "month": month.Format("2006-01"), "bills": list, "dues": dues, "earlier": earlier})
	}
}

// POST /api/bills
func createBill(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			HouseholdID string `json:"household_id"`
			db.NewBill
		}
		if !readJSON(w, r, &in) {
			return
		}
		id, err := store.CreateBill(r.Context(), uid, in.HouseholdID, in.NewBill)
		if err != nil {
			memberError(w, "create bill", err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// PUT /api/bills/{id}
func updateBill(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in db.NewBill
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.UpdateBill(r.Context(), uid, r.PathValue("id"), in); err != nil {
			memberError(w, "update bill", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /api/bills/{id}
func deleteBill(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		if err := store.DeleteBill(r.Context(), uid, r.PathValue("id")); err != nil {
			memberError(w, "delete bill", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// PUT /api/bills/{id}/payments/{due} {"paid_minor": n, "paid_on": "YYYY-MM-DD", "transaction_id": optional}
func markBillPaid(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		due, err := time.Parse("2006-01-02", r.PathValue("due"))
		var in struct {
			PaidMinor     int64  `json:"paid_minor"`
			PaidOn        string `json:"paid_on"`
			TransactionID string `json:"transaction_id"` // the matched bank transaction, if any
		}
		if !readJSON(w, r, &in) {
			return
		}
		on, err2 := time.Parse("2006-01-02", in.PaidOn)
		if err != nil || err2 != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err := store.MarkBillPaid(r.Context(), uid, r.PathValue("id"), due, in.PaidMinor, on, in.TransactionID); err != nil {
			memberError(w, "mark bill paid", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /api/bills/{id}/payments/{due}
func unmarkBillPaid(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		due, err := time.Parse("2006-01-02", r.PathValue("due"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err := store.UnmarkBillPaid(r.Context(), uid, r.PathValue("id"), due); err != nil {
			memberError(w, "unmark bill paid", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
