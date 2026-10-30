package api

import (
	"net/http"
	"net/url"
	"strings"
)

// Security headers (#24, ADR 0011). Every response gets them, the React app
// and the API alike. The Content-Security-Policy allows only our own files
// plus what the app really uses: Supabase for sign-in, Plaid Link (its
// script, its window and its API), Plaid's two logo hosts, and our own map
// host (#60, ADR 0019). The sign-in
// token lives in the browser (ADR 0003), so keeping other scripts out
// matters.

// contentSecurityPolicy builds the policy for the app. supabaseURL is the
// project URL the browser signs in with, mapURL our map file's host ("" leaves
// either out).
func contentSecurityPolicy(supabaseURL, mapURL string) string {
	connect := []string{"'self'", "https://*.plaid.com"}
	for _, u := range []string{supabaseURL, mapURL} {
		if o := origin(u); o != "" {
			connect = append(connect, o)
		}
	}
	return strings.Join([]string{
		"default-src 'self'",
		"script-src 'self' https://cdn.plaid.com",
		// React sets some styles inline (widths, colours from data).
		"style-src 'self' 'unsafe-inline'",
		// data: for the 2FA QR code; Plaid's merchant and counterparty logos.
		"img-src 'self' data: https://plaid-merchant-logos.plaid.com https://plaid-counterparty-logos.plaid.com",
		"font-src 'self'",
		"connect-src " + strings.Join(connect, " "),
		// The map library draws in web workers it starts from blob: URLs (#60).
		"worker-src 'self' blob:",
		"frame-src https://cdn.plaid.com",
		"frame-ancestors 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	}, "; ")
}

// origin returns scheme://host of an https URL, or "".
func origin(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

// securityHeaders adds the headers to every response.
func securityHeaders(supabaseURL, mapURL string, next http.Handler) http.Handler {
	csp := contentSecurityPolicy(supabaseURL, mapURL)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		// Plaid's bank sign-in can open a pop-up (OAuth banks).
		h.Set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
		// Only over HTTPS: browsers ignore it on plain HTTP, and it must never
		// pin localhost.
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// noStore keeps API answers (balances, transactions) out of every cache.
func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
