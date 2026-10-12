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
	banksync "github.com/Kolla1997/Tallyn/internal/sync"
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

	// DATABASE_URL must be the tallyn_api login (#30, ADR 0006). The server
	// refuses to start with a login that could step outside the user's role,
	// such as Supabase's postgres.
	var store api.Store
	if u := os.Getenv("DATABASE_URL"); u != "" {
		d, err := db.Open(ctx, u)
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		defer d.Close()
		if err := d.CheckAPILogin(ctx); err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		store = d
	} else {
		log.Printf("tallyn: DATABASE_URL not set, /api/ routes will answer 503")
	}

	// Bank linking needs both Plaid keys and the token encryption key (#8).
	// A malformed key stops the server: better than failing on the first link.
	var box *tokencrypt.Box
	var plaidClient *plaid.Client
	if key := os.Getenv("TOKEN_ENCRYPTION_KEY"); key != "" && key != "replace-me" {
		b, err := tokencrypt.New(key)
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		box = b
	}
	if id := os.Getenv("PLAID_CLIENT_ID"); id != "" && id != "replace-me" {
		c, err := plaid.New(getenv("PLAID_ENV", "sandbox"), id, os.Getenv("PLAID_SECRET"), os.Getenv("PLAID_REDIRECT_URI"))
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		plaidClient = c
	}
	// Interfaces only get non-nil values, so nil really means "not configured".
	var bankAPI api.Plaid
	var tokens api.Tokens
	if plaidClient != nil && box != nil {
		bankAPI, tokens = plaidClient, box
	} else {
		log.Printf("tallyn: PLAID_CLIENT_ID or TOKEN_ENCRYPTION_KEY not set, bank linking will answer 503")
	}

	// Bank sync (#9): every 6 hours, plus right after a bank is linked. It has
	// its own login, DATABASE_URL_SYNC as tallyn_sync (#30), and is the only
	// code that gets the system database access (db.System).
	var syncNow, reconnected func(string)
	syncURL := os.Getenv("DATABASE_URL_SYNC")
	switch {
	case syncURL == "":
		log.Printf("tallyn: DATABASE_URL_SYNC not set, bank sync is off")
	case plaidClient == nil || box == nil:
		log.Printf("tallyn: bank sync is off until bank linking is configured")
	default:
		every, err := time.ParseDuration(getenv("SYNC_EVERY", "6h"))
		if err != nil || every < time.Minute {
			log.Fatalf("tallyn: SYNC_EVERY must be a duration of at least 1m (got %q)", os.Getenv("SYNC_EVERY"))
		}
		system, err := db.OpenSystem(ctx, syncURL)
		if err != nil {
			log.Fatalf("tallyn: %v", err)
		}
		defer system.Close()
		syncer := banksync.New(system, plaidClient, box, every)
		syncNow = syncer.SyncNow
		reconnected = syncer.Reconnected
		go syncer.Run(ctx)
		log.Printf("tallyn: bank sync every %s", every)
	}

	srv := &http.Server{
		Addr: ":" + port,
		Handler: api.NewRouter(api.Deps{
			WebDir:      webDir,
			RequireAuth: requireAuth,
			Store:       store,
			Plaid:       bankAPI,
			Tokens:      tokens,
			SyncNow:     syncNow,
			Reconnected: reconnected,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}

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
