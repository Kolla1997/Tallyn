// Package auth verifies Supabase Auth sessions on every API request.
//
// The React app signs in with supabase-js and sends the access token as
// `Authorization: Bearer <token>` (ADR 0003). Require checks the token's
// signature against Supabase's public signing keys (JWKS), its expiry, issuer,
// audience and role, and that 2FA was completed (aal2). Only then does the
// verified user ID reach the handler, which passes it to db.AsUser so RLS
// applies (ADR 0002). Household roles are enforced by RLS, not here.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Supabase signs access tokens with ES256 (recommended) or RS256 keys.
// The legacy shared secret (HS256) is never accepted.
var validMethods = []string{"ES256", "RS256"}

// Errors returned by Verify. Each one maps to a 401.
var (
	ErrNoToken     = errors.New("auth: no bearer token")
	ErrInvalid     = errors.New("auth: invalid token")
	ErrMFARequired = errors.New("auth: 2FA not completed")
)

// Session is what a verified access token says about the caller.
type Session struct {
	UserID    string // auth.users.id, a UUID
	SessionID string
	AAL       string    // "aal2" for every session that reaches a handler
	TOTPAt    time.Time // when this session last entered a 2FA code; zero if never
}

type claims struct {
	jwt.RegisteredClaims
	Role        string `json:"role"`
	AAL         string `json:"aal"`
	SessionID   string `json:"session_id"`
	IsAnonymous bool   `json:"is_anonymous"`
	// AMR lists how and when the session authenticated. Supabase updates the
	// TOTP entry's timestamp each time the user enters a new code, which is
	// what step-up checks (#38) rely on.
	AMR []struct {
		Method    string `json:"method"`
		Timestamp int64  `json:"timestamp"`
	} `json:"amr"`
}

var uuidRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Verifier checks Supabase access tokens.
type Verifier struct {
	parser  *jwt.Parser
	keyfunc jwt.Keyfunc
}

// New returns a Verifier for the Supabase project at supabaseURL
// (e.g. https://abcd.supabase.co). It fetches the project's public signing
// keys from /auth/v1/.well-known/jwks.json and refreshes them in the
// background until ctx ends, so key rotation needs no deploy.
func New(ctx context.Context, supabaseURL string) (*Verifier, error) {
	base := strings.TrimRight(supabaseURL, "/")
	if !strings.HasPrefix(base, "https://") && !strings.HasPrefix(base, "http://") {
		return nil, fmt.Errorf("auth: SUPABASE_URL must be an http(s) URL (got %q)", supabaseURL)
	}
	issuer := base + "/auth/v1"
	kf, err := keyfunc.NewDefaultOverrideCtx(ctx, []string{issuer + "/.well-known/jwks.json"}, keyfunc.Override{
		HTTPTimeout: 10 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("auth: load signing keys: %w", err)
	}
	return newVerifier(issuer, kf.KeyfuncCtx(ctx)), nil
}

func newVerifier(issuer string, kf jwt.Keyfunc) *Verifier {
	return &Verifier{
		parser: jwt.NewParser(
			jwt.WithValidMethods(validMethods),
			jwt.WithIssuer(issuer),
			jwt.WithAudience("authenticated"),
			jwt.WithExpirationRequired(),
			jwt.WithLeeway(30*time.Second),
		),
		keyfunc: kf,
	}
}

// Verify checks a raw access token and returns the session it describes.
// A valid token without 2FA returns ErrMFARequired.
func (v *Verifier) Verify(token string) (Session, error) {
	if token == "" {
		return Session{}, ErrNoToken
	}
	var c claims
	if _, err := v.parser.ParseWithClaims(token, &c, v.keyfunc); err != nil {
		return Session{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if c.Role != "authenticated" || c.IsAnonymous || !uuidRE.MatchString(c.Subject) {
		return Session{}, fmt.Errorf("%w: not a signed-in user", ErrInvalid)
	}
	if c.AAL != "aal2" {
		return Session{}, ErrMFARequired
	}
	var totpAt time.Time
	for _, a := range c.AMR {
		if a.Method == "totp" || a.Method == "mfa/totp" {
			if t := time.Unix(a.Timestamp, 0); t.After(totpAt) {
				totpAt = t
			}
		}
	}
	return Session{UserID: c.Subject, SessionID: c.SessionID, AAL: c.AAL, TOTPAt: totpAt}, nil
}

// Require lets a request through only with a verified, 2FA-completed session,
// which handlers read with FromContext. Everything else gets a 401.
func (v *Verifier) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s, err := v.Verify(bearer(r))
		if err != nil {
			code := "unauthorized"
			if errors.Is(err, ErrMFARequired) {
				code = "mfa_required"
			}
			w.Header().Set("WWW-Authenticate", `Bearer realm="tallyn"`)
			writeError(w, http.StatusUnauthorized, code)
			return
		}
		next.ServeHTTP(w, r.WithContext(WithSession(r.Context(), s)))
	})
}

// Unavailable answers 503 on every request. The server uses it in place of
// Require when auth isn't configured, so nothing is served unauthenticated.
func Unavailable(http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusServiceUnavailable, "auth_not_configured")
	})
}

type sessionKey struct{}

// FromContext returns the session that Require verified.
func FromContext(ctx context.Context) (Session, bool) {
	s, ok := ctx.Value(sessionKey{}).(Session)
	return s, ok
}

// WithSession returns ctx carrying s. For tests of handlers behind Require.
func WithSession(ctx context.Context, s Session) context.Context {
	return context.WithValue(ctx, sessionKey{}, s)
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func writeError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}
