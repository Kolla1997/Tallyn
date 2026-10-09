package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// All IDs and keys below are fake and generated per test run.
const (
	testIssuer = "https://fake-project.supabase.co/auth/v1"
	testUser   = "11111111-1111-4111-8111-111111111111"
)

func genEC(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

// goodClaims is what Supabase puts in a 2FA-completed access token.
func goodClaims() jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"iss":          testIssuer,
		"sub":          testUser,
		"aud":          "authenticated",
		"exp":          now.Add(time.Hour).Unix(),
		"iat":          now.Unix(),
		"role":         "authenticated",
		"aal":          "aal2",
		"session_id":   "22222222-2222-4222-8222-222222222222",
		"is_anonymous": false,
	}
}

func sign(t *testing.T, method jwt.SigningMethod, key any, c jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(method, c)
	tok.Header["kid"] = "test-key"
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func verifierFor(pub any) *Verifier {
	return newVerifier(testIssuer, func(*jwt.Token) (any, error) { return pub, nil })
}

func TestVerify(t *testing.T) {
	key := genEC(t)
	v := verifierFor(&key.PublicKey)

	with := func(change func(jwt.MapClaims)) string {
		c := goodClaims()
		change(c)
		return sign(t, jwt.SigningMethodES256, key, c)
	}

	t.Run("2FA-completed token is accepted", func(t *testing.T) {
		s, err := v.Verify(with(func(jwt.MapClaims) {}))
		if err != nil {
			t.Fatalf("err = %v", err)
		}
		if s.UserID != testUser || s.AAL != "aal2" || s.SessionID == "" {
			t.Fatalf("session = %+v", s)
		}
	})

	t.Run("password-only token needs 2FA", func(t *testing.T) {
		_, err := v.Verify(with(func(c jwt.MapClaims) { c["aal"] = "aal1" }))
		if !errors.Is(err, ErrMFARequired) {
			t.Fatalf("err = %v, want ErrMFARequired", err)
		}
	})
	t.Run("token without aal needs 2FA", func(t *testing.T) {
		_, err := v.Verify(with(func(c jwt.MapClaims) { delete(c, "aal") }))
		if !errors.Is(err, ErrMFARequired) {
			t.Fatalf("err = %v, want ErrMFARequired", err)
		}
	})

	other := genEC(t)
	hsKey := []byte("fake-shared-secret-for-tests-only")
	rejected := map[string]string{
		"empty":                 "",
		"garbage":               "not.a.jwt",
		"expired":               with(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() }),
		"no expiry":             with(func(c jwt.MapClaims) { delete(c, "exp") }),
		"wrong issuer":          with(func(c jwt.MapClaims) { c["iss"] = "https://other.supabase.co/auth/v1" }),
		"wrong audience":        with(func(c jwt.MapClaims) { c["aud"] = "anon" }),
		"anon role":             with(func(c jwt.MapClaims) { c["role"] = "anon" }),
		"service role":          with(func(c jwt.MapClaims) { c["role"] = "service_role" }),
		"anonymous user":        with(func(c jwt.MapClaims) { c["is_anonymous"] = true }),
		"sub not a UUID":        with(func(c jwt.MapClaims) { c["sub"] = "alice" }),
		"signed by another key": sign(t, jwt.SigningMethodES256, other, goodClaims()),
		"legacy shared secret":  sign(t, jwt.SigningMethodHS256, hsKey, goodClaims()),
		"alg none":              sign(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, goodClaims()),
		"tampered payload":      tamper(t, with(func(jwt.MapClaims) {})),
	}
	for name, tok := range rejected {
		t.Run("rejects "+name, func(t *testing.T) {
			if _, err := v.Verify(tok); err == nil || errors.Is(err, ErrMFARequired) {
				t.Fatalf("err = %v, want rejection", err)
			}
		})
	}
}

// tamper swaps the payload for one with a different user, keeping the signature.
func tamper(t *testing.T, tok string) string {
	t.Helper()
	parts := splitJWT(t, tok)
	c := goodClaims()
	c["sub"] = "33333333-3333-4333-8333-333333333333"
	b, _ := json.Marshal(c)
	return parts[0] + "." + base64.RawURLEncoding.EncodeToString(b) + "." + parts[2]
}

func splitJWT(t *testing.T, tok string) [3]string {
	t.Helper()
	var p [3]string
	i, n := 0, 0
	for j := range tok {
		if tok[j] == '.' {
			p[n] = tok[i:j]
			n++
			i = j + 1
		}
	}
	if n != 2 {
		t.Fatalf("not a JWT: %q", tok)
	}
	p[2] = tok[i:]
	return p
}

func TestRequire(t *testing.T) {
	key := genEC(t)
	v := verifierFor(&key.PublicKey)

	var got Session
	h := v.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, _ = FromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))

	aal1 := goodClaims()
	aal1["aal"] = "aal1"
	cases := []struct {
		name, header string
		status       int
		errCode      string
	}{
		{"valid", "Bearer " + sign(t, jwt.SigningMethodES256, key, goodClaims()), http.StatusNoContent, ""},
		{"lowercase scheme", "bearer " + sign(t, jwt.SigningMethodES256, key, goodClaims()), http.StatusNoContent, ""},
		{"no header", "", http.StatusUnauthorized, "unauthorized"},
		{"not bearer", "Basic dXNlcjpwYXNz", http.StatusUnauthorized, "unauthorized"},
		{"bad token", "Bearer nope", http.StatusUnauthorized, "unauthorized"},
		{"no 2FA", "Bearer " + sign(t, jwt.SigningMethodES256, key, aal1), http.StatusUnauthorized, "mfa_required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got = Session{}
			req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d", rec.Code, tc.status)
			}
			if tc.errCode == "" {
				if got.UserID != testUser {
					t.Fatalf("handler got session %+v", got)
				}
				return
			}
			if got.UserID != "" {
				t.Fatal("handler ran for a rejected request")
			}
			var body map[string]string
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil || body["error"] != tc.errCode {
				t.Fatalf("body = %v (%v), want error %q", body, err, tc.errCode)
			}
			if rec.Header().Get("WWW-Authenticate") == "" {
				t.Fatal("missing WWW-Authenticate header")
			}
		})
	}
}

func TestUnavailable(t *testing.T) {
	ran := false
	h := Unavailable(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { ran = true }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if rec.Code != http.StatusServiceUnavailable || ran {
		t.Fatalf("status = %d, handler ran = %v", rec.Code, ran)
	}
}

// New fetches the signing keys from the project's JWKS endpoint, the way it
// does against Supabase. Covers both key types Supabase offers.
func TestNewFetchesSigningKeys(t *testing.T) {
	ec := genEC(t)
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	b64 := base64.RawURLEncoding.EncodeToString
	pad := func(b []byte) []byte { return append(make([]byte, 32-len(b)), b...) }
	jwks, _ := json.Marshal(map[string]any{"keys": []map[string]string{
		{"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": "ec-key",
			"x": b64(pad(ec.PublicKey.X.Bytes())), "y": b64(pad(ec.PublicKey.Y.Bytes()))},
		{"kty": "RSA", "alg": "RS256", "use": "sig", "kid": "rsa-key",
			"n": b64(rsaKey.PublicKey.N.Bytes()), "e": b64(big.NewInt(int64(rsaKey.PublicKey.E)).Bytes())},
	}})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(jwks)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	v, err := New(ctx, srv.URL+"/")
	if err != nil {
		t.Fatal(err)
	}

	c := goodClaims()
	c["iss"] = srv.URL + "/auth/v1"
	for name, tc := range map[string]struct {
		method jwt.SigningMethod
		key    any
		kid    string
	}{
		"ES256": {jwt.SigningMethodES256, ec, "ec-key"},
		"RS256": {jwt.SigningMethodRS256, rsaKey, "rsa-key"},
	} {
		t.Run(name, func(t *testing.T) {
			tok := jwt.NewWithClaims(tc.method, c)
			tok.Header["kid"] = tc.kid
			s, err := tok.SignedString(tc.key)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := v.Verify(s); err != nil {
				t.Fatalf("Verify: %v", err)
			}
		})
	}

	t.Run("unknown key ID is rejected", func(t *testing.T) {
		tok := jwt.NewWithClaims(jwt.SigningMethodES256, c)
		tok.Header["kid"] = "not-in-jwks"
		s, _ := tok.SignedString(genEC(t))
		if _, err := v.Verify(s); err == nil {
			t.Fatal("want rejection")
		}
	})

	if _, err := New(ctx, "fake-project.supabase.co"); err == nil {
		t.Fatal("New accepted a URL without a scheme")
	}
}
