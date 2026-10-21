package api

import (
	"net/http"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Budgets (#13, ADR 0014): for the household or one person, weekly or
// monthly. The database decides who may see and change what; progress is
// spending totals only.

// localToday is the family's own date, sent by the browser so "this week"
// and "this month" follow their calendar, not the server's. It must be
// within a day of the server's date; otherwise the server's date is used.
func localToday(r *http.Request) time.Time {
	now := time.Now().UTC()
	server := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	t, err := time.Parse("2006-01-02", r.URL.Query().Get("today"))
	if err != nil || t.Sub(server) > 24*time.Hour || server.Sub(t) > 24*time.Hour {
		return server
	}
	return t
}

// GET /api/budgets?household_id=&today=YYYY-MM-DD
func budgets(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		today := localToday(r)
		list, counting, err := store.Budgets(r.Context(), uid, r.URL.Query().Get("household_id"), today)
		if err != nil {
			memberError(w, "budgets", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"today": today.Format("2006-01-02"), "budgets": list, "counting": counting})
	}
}

// POST /api/budgets
func createBudget(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			HouseholdID string `json:"household_id"`
			db.NewBudget
		}
		if !readJSON(w, r, &in) {
			return
		}
		id, err := store.CreateBudget(r.Context(), uid, in.HouseholdID, in.NewBudget)
		if err != nil {
			memberError(w, "create budget", err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// PUT /api/budgets/{id}: category, period and amount (not whom it covers).
func updateBudget(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Category    string `json:"category"`
			Period      string `json:"period"`
			AmountMinor int64  `json:"amount_minor"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.UpdateBudget(r.Context(), uid, r.PathValue("id"), db.NewBudget{Category: in.Category, Period: in.Period, AmountMinor: in.AmountMinor}); err != nil {
			memberError(w, "update budget", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /api/budgets/{id}
func deleteBudget(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		if err := store.DeleteBudget(r.Context(), uid, r.PathValue("id")); err != nil {
			memberError(w, "delete budget", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// PUT /api/budgets/counting: whether your own spending counts in household
// budgets (totals only). Only ever for yourself.
func setBudgetCounting(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			HouseholdID string `json:"household_id"`
			Count       bool   `json:"count"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.SetCountInBudgets(r.Context(), uid, in.HouseholdID, in.Count); err != nil {
			memberError(w, "budget counting", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
