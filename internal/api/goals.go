package api

import (
	"net/http"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Savings goals (#14). The database decides who sees a goal and its
// progress; a goal never reveals a balance someone can't already see.

// GET /api/goals?household_id=&today=YYYY-MM-DD
func goals(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		list, err := store.Goals(r.Context(), uid, r.URL.Query().Get("household_id"))
		if err != nil {
			memberError(w, "goals", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"today": localToday(r).Format("2006-01-02"), "goals": list})
	}
}

// POST /api/goals
func createGoal(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			HouseholdID string `json:"household_id"`
			db.NewGoal
		}
		if !readJSON(w, r, &in) {
			return
		}
		id, err := store.CreateGoal(r.Context(), uid, in.HouseholdID, in.NewGoal)
		if err != nil {
			memberError(w, "create goal", err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// PUT /api/goals/{id}
func updateGoal(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in db.NewGoal
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.UpdateGoal(r.Context(), uid, r.PathValue("id"), in); err != nil {
			memberError(w, "update goal", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// PUT /api/goals/{id}/saved?today=YYYY-MM-DD {"saved_minor": n}: a goal kept
// by hand.
func setGoalSaved(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			SavedMinor int64 `json:"saved_minor"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.SetGoalSaved(r.Context(), uid, r.PathValue("id"), in.SavedMinor, localToday(r)); err != nil {
			memberError(w, "set goal saved", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DELETE /api/goals/{id}
func deleteGoal(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		if err := store.DeleteGoal(r.Context(), uid, r.PathValue("id")); err != nil {
			memberError(w, "delete goal", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
