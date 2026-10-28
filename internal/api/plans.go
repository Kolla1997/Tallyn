package api

import (
	"net/http"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Plan from your income (#133): one plan for the household and one per
// person, with each bucket's money this month. Same rules as budgets (ADR
// 0014); the database decides who may see and change what.

// GET /api/plans?household_id=&today=YYYY-MM-DD
func plans(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		today := localToday(r)
		list, err := store.Plans(r.Context(), uid, r.URL.Query().Get("household_id"), today)
		if err != nil {
			memberError(w, "plans", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"today": today.Format("2006-01-02"), "plans": list})
	}
}

// GET /api/plans/suggestion?household_id=&member=&today=: a suggested monthly
// income from the last 3 full months of pay (member empty: the household).
func planSuggestion(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		q := r.URL.Query()
		n, err := store.PlanSuggestion(r.Context(), uid, q.Get("household_id"), q.Get("member"), localToday(r))
		if err != nil {
			memberError(w, "plan suggestion", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int64{"monthly_income_minor": n})
	}
}

// PUT /api/plans: sets the household's or a person's plan, replacing it.
func savePlan(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			HouseholdID string `json:"household_id"`
			db.NewPlan
		}
		if !readJSON(w, r, &in) {
			return
		}
		id, err := store.SavePlan(r.Context(), uid, in.HouseholdID, in.NewPlan)
		if err != nil {
			memberError(w, "save plan", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"id": id})
	}
}

// DELETE /api/plans/{id}
func deletePlan(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		if err := store.DeletePlan(r.Context(), uid, r.PathValue("id")); err != nil {
			memberError(w, "delete plan", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
