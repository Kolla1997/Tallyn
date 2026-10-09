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
	"github.com/Kolla1997/Tallyn/internal/plaid"
	"github.com/Kolla1997/Tallyn/internal/tokencrypt"
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

	// Bank linking needs both Plaid keys and the token encryption key (#8).
	// A malformed key stops the server: better than failing on the first link.
	var plaidClient api.Plaid
	var tokens api.Tokens
	if key := os.Getenv("TOKEN_ENCRYPTION_KEY"); key != "" && key != "replace-me" {
		box, err := tokencrypt.New(key)
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		tokens = box
	}
	if id := os.Getenv("PLAID_CLIENT_ID"); id != "" && id != "replace-me" {
		c, err := plaid.New(getenv("PLAID_ENV", "sandbox"), id, os.Getenv("PLAID_SECRET"), os.Getenv("PLAID_REDIRECT_URI"))
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		plaidClient = c
	}
	if plaidClient == nil || tokens == nil {
		log.Printf("tallyn: PLAID_CLIENT_ID or TOKEN_ENCRYPTION_KEY not set, bank linking will answer 503")
	}

	srv := &http.Server{
		Addr: ":" + port,
		Handler: api.NewRouter(api.Deps{
			WebDir:      webDir,
			RequireAuth: requireAuth,
			Store:       store,
			Plaid:       plaidClient,
			Tokens:      tokens,
		}),
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
