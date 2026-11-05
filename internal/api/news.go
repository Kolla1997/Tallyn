package api

import (
	"log"
	"net/http"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Product news (#281): the Settings switch. The choice is per person, and
// every change is kept with the Privacy Policy version it was made under.
//
//	GET /api/me/news  {"on", "set", "changed_at"}
//	PUT /api/me/news  {"on": true|false}

func news(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		n, err := store.News(r.Context(), uid)
		if err != nil {
			log.Printf("api: news: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, n)
	}
}

func setNews(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			On *bool `json:"on"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if in.On == nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if err := store.SetNews(r.Context(), uid, *in.On, db.NewsSettings, CurrentVersions["privacy"]); err != nil {
			log.Printf("api: set news: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"on": *in.On})
	}
}
