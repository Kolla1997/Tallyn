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
	"time"

	"github.com/Kolla1997/Tallyn/internal/auth"
	"github.com/Kolla1997/Tallyn/internal/db"
)

// Store is the data the API reads and writes. *db.DB implements it.
type Store interface {
	Me(ctx context.Context, userID string) (db.Me, error)
	Consents(ctx context.Context, userID string) ([]db.Consent, error)
	Accept(ctx context.Context, userID string, versions map[string]string) error
	CreateHousehold(ctx context.Context, userID, name, homeCurrency string) (db.MyHousehold, error)
	CanLink(ctx context.Context, userID, householdID string) (bool, error)
	LinkBank(ctx context.Context, userID, householdID string, b db.NewBank) (string, error)
	Banks(ctx context.Context, userID, householdID string) ([]db.Bank, error)
	UnlinkTarget(ctx context.Context, userID, bankID string) (plaidItemID string, sealed []byte, err error)
	DeleteBank(ctx context.Context, userID, bankID string) error
	Transactions(ctx context.Context, userID, householdID string, f db.TxFilter) ([]db.Transaction, bool, error)
	Spending(ctx context.Context, userID, householdID, month string) ([]db.Spend, error)
	Summary(ctx context.Context, userID, householdID string, f db.TxFilter) ([]db.TxSummary, error)
	Daily(ctx context.Context, userID, householdID string, f db.TxFilter) ([]db.DaySpend, error)
	Sharing(ctx context.Context, userID, householdID string) (db.Sharing, error)
	SetSharing(ctx context.Context, userID, householdID, viewerID string, categories []string) error
	SetDisplayName(ctx context.Context, userID, name string) error
	Members(ctx context.Context, userID, householdID string) ([]db.Member, error)
	SetMemberRole(ctx context.Context, userID, householdID, memberID, role string) error
	RemoveMember(ctx context.Context, userID, householdID, memberID string) error
	Invites(ctx context.Context, userID, householdID string) ([]db.Invite, error)
	CreateInvite(ctx context.Context, userID, householdID, email, role string) (db.Invite, string, error)
	RevokeInvite(ctx context.Context, userID, inviteID string) error
	AcceptInvite(ctx context.Context, userID, token string) (string, error)
	Budgets(ctx context.Context, userID, householdID string, today time.Time) ([]db.Budget, []db.BudgetCounter, error)
	CreateBudget(ctx context.Context, userID, householdID string, b db.NewBudget) (string, error)
	UpdateBudget(ctx context.Context, userID, budgetID string, b db.NewBudget) error
	DeleteBudget(ctx context.Context, userID, budgetID string) error
	SetCountInBudgets(ctx context.Context, userID, householdID string, on bool) error
	Export(ctx context.Context, userID string) (db.Export, error) // #54
}

// Deps is what the router needs. Nil fields switch off the routes that need
// them (they answer 503), so nothing is ever served half-configured.
type Deps struct {
	WebDir      string
	RequireAuth func(http.Handler) http.Handler // auth.Verifier.Require
	Store       Store                           // *db.DB
	Plaid       Plaid                           // *plaid.Client
	Tokens      Tokens                          // *tokencrypt.Box
	SyncNow     func(bankID string)             // sync.Syncer.SyncNow; optional
	Reconnected func(bankID string)             // sync.Syncer.Reconnected; optional (#51)
	SupabaseURL string                          // allowed in the Content-Security-Policy (#24)

	// Backup codes and recovery (#23, ADR 0013). RequireSignedIn lets a
	// password sign-in (no 2FA yet) reach the one recovery route; the backup
	// code is its second factor. Without all four, those routes answer 503.
	RequireSignedIn func(http.Handler) http.Handler // auth.Verifier.RequireSignedIn
	BackupCodes     BackupCodeStore                 // *db.DB
	Factors         FactorRemover                   // *supabaseadmin.Client
	CodeKey         []byte                          // DeriveBackupCodeKey(token key)
}

// NewRouter returns the server's handler: JSON API under /api/ and the
// React app (with SPA fallback to index.html) for everything else.
//
// Every /api/ route except the health check sits behind RequireAuth, so new
// routes are protected by default. If auth or the database isn't configured,
// protected routes answer 503. Bank routes also need Plaid and Tokens.
func NewRouter(d Deps) http.Handler {
	requireAuth := d.RequireAuth
	if requireAuth == nil || d.Store == nil {
		requireAuth = auth.Unavailable
	}
	lim := newLimits()
	api := http.NewServeMux()
	api.HandleFunc("GET /api/me", me(d.Store))
	api.HandleFunc("PUT /api/me", setMe(d.Store))
	api.HandleFunc("GET /api/me/export", exportData(d.Store, lim.exports)) // #54
	api.HandleFunc("GET /api/consent", consent(d.Store))
	api.HandleFunc("POST /api/consent", acceptConsent(d.Store))
	api.HandleFunc("GET /api/sharing", sharing(d.Store))
	api.HandleFunc("PUT /api/sharing", setSharing(d.Store))
	api.HandleFunc("GET /api/households/{id}/members", members(d.Store))
	api.HandleFunc("PUT /api/households/{id}/members/{user}", setMemberRole(d.Store))
	api.HandleFunc("DELETE /api/households/{id}/members/{user}", removeMember(d.Store))
	api.HandleFunc("GET /api/households/{id}/invites", invites(d.Store))
	api.Handle("POST /api/households/{id}/invites", limited(lim.invites, createInvite(d.Store)))
	api.HandleFunc("DELETE /api/invites/{id}", revokeInvite(d.Store))
	api.Handle("POST /api/invites/accept", limited(lim.accepts, acceptInvite(d.Store)))
	api.HandleFunc("POST /api/households", createHousehold(d.Store))
	b := banks{store: d.Store, plaid: d.Plaid, tokens: d.Tokens, syncNow: d.SyncNow, reconnected: d.Reconnected}
	api.Handle("POST /api/plaid/link-token", limited(lim.plaid, b.needsPlaid(b.linkToken)))
	api.Handle("POST /api/plaid/exchange", limited(lim.plaid, b.needsPlaid(b.exchange)))
	api.HandleFunc("GET /api/banks", b.list)
	api.HandleFunc("DELETE /api/banks/{id}", b.needsPlaid(b.unlink))
	api.Handle("POST /api/banks/{id}/reconnect-token", limited(lim.plaid, b.needsPlaid(b.reconnectToken)))
	api.HandleFunc("POST /api/banks/{id}/reconnected", b.needsPlaid(b.reconnectDone))
	api.HandleFunc("GET /api/transactions", transactions(d.Store))
	api.HandleFunc("GET /api/transactions/summary", txSummary(d.Store))
	api.HandleFunc("GET /api/transactions/daily", txDaily(d.Store))
	api.HandleFunc("GET /api/spending", spending(d.Store))
	api.HandleFunc("GET /api/budgets", budgets(d.Store)) // #13
	api.HandleFunc("POST /api/budgets", createBudget(d.Store))
	api.HandleFunc("PUT /api/budgets/counting", setBudgetCounting(d.Store))
	api.HandleFunc("PUT /api/budgets/{id}", updateBudget(d.Store))
	api.HandleFunc("DELETE /api/budgets/{id}", deleteBudget(d.Store))
	api.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found")
	})
	recovery := http.Handler(unavailable("recovery_unavailable"))
	if d.BackupCodes != nil && len(d.CodeKey) == 32 {
		api.HandleFunc("GET /api/backup-codes", backupCodeStatus(d.BackupCodes))
		api.HandleFunc("POST /api/backup-codes", newBackupCodeSet(d.BackupCodes, d.CodeKey))
		if d.Factors != nil && d.RequireSignedIn != nil {
			recovery = d.RequireSignedIn(limited(lim.recovery, recoverWithBackupCode(d.BackupCodes, d.Factors, d.CodeKey)))
		}
	} else {
		api.Handle("/api/backup-codes", unavailable("backup_codes_unavailable"))
	}

	mux := http.NewServeMux()
	mux.Handle("GET /api/health", noStore(http.HandlerFunc(health)))
	// Outside the 2FA-only /api/ below: a password sign-in plus a backup code (#23).
	mux.Handle("POST /api/recovery/backup-code", noStore(recovery))
	// API answers are never cached; limits count per signed-in person (#24).
	mux.Handle("/api/", noStore(requireAuth(limited(lim.all, api))))
	mux.Handle("/", spa(d.WebDir))
	return securityHeaders(d.SupabaseURL, mux)
}

// unavailable answers 503 with code: for routes whose setup is missing.
func unavailable(code string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusServiceUnavailable, code)
	}
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// me returns the signed-in person's profile and households.
func me(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		m, err := store.Me(r.Context(), uid)
		if errors.Is(err, db.ErrNoProfile) {
			writeError(w, http.StatusNotFound, "no_profile")
			return
		}
		if err != nil {
			log.Printf("api: me: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, m)
	}
}

// createHousehold makes a household with the caller as its owner.
func createHousehold(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Name         string `json:"name"`
			HomeCurrency string `json:"home_currency"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		h, err := store.CreateHousehold(r.Context(), uid, strings.TrimSpace(in.Name), strings.TrimSpace(in.HomeCurrency))
		if errors.Is(err, db.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "invalid_household")
			return
		}
		if err != nil {
			log.Printf("api: create household: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusCreated, h)
	}
}

// userID returns the verified session's user, or writes a 401.
func userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	s, ok := auth.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	return s.UserID, true
}

// readJSON decodes a small JSON body into v, or writes a 400.
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return false
	}
	return true
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
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
			// Always check for a new app version (#24).
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, index)
			return
		}
		// Built files have a content hash in their name: cache them a year.
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}
