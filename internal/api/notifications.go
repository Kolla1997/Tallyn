package api

import "net/http"

// In-app notifications (#267). Triggers in the database write them; each
// person only ever sees and marks their own.

// GET /api/notifications: the newest alerts, newest first.
func notifications(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		list, err := store.Notifications(r.Context(), uid)
		if err != nil {
			memberError(w, "notifications", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"notifications": list})
	}
}

// POST /api/notifications/read {"id": "..."}: one alert, or all of them
// when id is empty.
func markNotificationsRead(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			ID string `json:"id"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.MarkNotificationsRead(r.Context(), uid, in.ID); err != nil {
			memberError(w, "mark notifications read", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
