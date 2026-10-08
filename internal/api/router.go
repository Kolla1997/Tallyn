// Package api holds the HTTP handlers and routing for the Tallyn server.
package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// NewRouter returns the server's handler: JSON API under /api/ and the
// React app (with SPA fallback to index.html) for everything else.
func NewRouter(webDir string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", health)
	// TODO(#7): require a verified Supabase session on /api/ routes (internal/auth).
	mux.Handle("/", spa(webDir))
	return mux
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
