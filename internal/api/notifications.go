package api

import (
	"net/http"

	"github.com/Kolla1997/Tallyn/internal/db"
)

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

// GET /api/notifications/settings?household_id=: what you hear about in this
// household (#268).
func notificationSettings(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		s, err := store.NotificationSettingsFor(r.Context(), uid, r.URL.Query().Get("household_id"))
		if err != nil {
			memberError(w, "notification settings", err)
			return
		}
		writeJSON(w, http.StatusOK, s)
	}
}

// PUT /api/notifications/settings?household_id=
func saveNotificationSettings(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in db.NotificationSettings
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.SaveNotificationSettings(r.Context(), uid, r.URL.Query().Get("household_id"), in); err != nil {
			memberError(w, "save notification settings", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// POST /api/notifications/dismiss {"ids": [...]}: close alerts in the list,
// one (its ×) or a day's ("Close all").
func dismissNotifications(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			IDs []string `json:"ids"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.DismissNotifications(r.Context(), uid, in.IDs); err != nil {
			memberError(w, "dismiss notifications", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
