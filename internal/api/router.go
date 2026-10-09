// Package api holds the HTTP handlers and routing for the Tallyn server.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/Kolla1997/Tallyn/internal/auth"
	"github.com/Kolla1997/Tallyn/internal/db"
)

// Store is the data the API reads. *db.DB implements it.
type Store interface {
	Me(ctx context.Context, userID string) (db.Me, error)
}

// NewRouter returns the server's handler: JSON API under /api/ and the
// React app (with SPA fallback to index.html) for everything else.
//
// Every /api/ route except the health check sits behind requireAuth
// (auth.Verifier.Require), so new routes are protected by default. If auth or
// the database isn't configured (nil), protected routes answer 503.
func NewRouter(webDir string, requireAuth func(http.Handler) http.Handler, store Store) http.Handler {
	if requireAuth == nil || store == nil {
		requireAuth = auth.Unavailable
	}
	api := http.NewServeMux()
	api.HandleFunc("GET /api/me", me(store))
	api.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
	})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", health)
	mux.Handle("/api/", requireAuth(api))
	mux.Handle("/", spa(webDir))
	return mux
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// me returns the signed-in person's profile and households.
func me(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s, ok := auth.FromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		m, err := store.Me(r.Context(), s.UserID)
		if errors.Is(err, db.ErrNoProfile) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no_profile"})
			return
		}
		if err != nil {
			log.Printf("api: me: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal"})
			return
		}
		writeJSON(w, http.StatusOK, m)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// spa serves files from dir and falls back to index.html for unknown paths,
// so client-side routes work on reload.
func spa(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		p := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if info, err := os.Stat(p); err != nil || info.IsDir() {
			index := filepath.Join(dir, "index.html")
			if _, err := os.Stat(index); err != nil {
				http.Error(w, "web app not built: run `cd web && npm run build`", http.StatusNotFound)
				return
			}
			http.ServeFile(w, r, index)
			return
		}
		files.ServeHTTP(w, r)
	})
}
