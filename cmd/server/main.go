// Command server runs the Tallyn API and serves the built React app (web/dist).
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Kolla1997/Tallyn/internal/api"
	"github.com/Kolla1997/Tallyn/internal/auth"
	"github.com/Kolla1997/Tallyn/internal/db"
)

func main() {
	port := getenv("PORT", "8080")
	webDir := getenv("WEB_DIR", "web/dist")

	ctx, stopBackground := context.WithCancel(context.Background())
	defer stopBackground()

	// Without Supabase settings the server still starts (health check and web
	// app), but every protected /api/ route answers 503. Nothing is served
	// unauthenticated.
	var requireAuth func(http.Handler) http.Handler
	if u := os.Getenv("SUPABASE_URL"); u != "" {
		v, err := auth.New(ctx, u)
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		requireAuth = v.Require
	} else {
		log.Printf("tallyn: SUPABASE_URL not set, /api/ routes will answer 503")
	}

	var store api.Store
	if u := os.Getenv("DATABASE_URL"); u != "" {
		d, err := db.Open(ctx, u)
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		defer d.Close()
		store = d
	} else {
		log.Printf("tallyn: DATABASE_URL not set, /api/ routes will answer 503")
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           api.NewRouter(webDir, requireAuth, store),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// TODO(#9): start the scheduled bank sync alongside the HTTP server.

	go func() {
		log.Printf("tallyn: listening on :%s (web: %s)", port, webDir)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("tallyn: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("tallyn: shutdown: %v", err)
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
