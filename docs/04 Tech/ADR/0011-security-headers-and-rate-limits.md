---
type: adr
status: active
owner: Dinesh
updated: 2026-10-16
issue: 24
tags: [adr, security]
---

# 0011 — Security headers, caching, timeouts and rate limits

- **Status:** Accepted (Dinesh, 2026-10-16)
- **Date:** 2026-10-12
- **Ticket:** #24

## Context
The audit (2026-10-12) found the server sent no security headers, cached nothing on purpose, had only a header timeout, and no rate limits. The sign-in token lives in the browser ([[0003-browser-sign-in-with-supabase-js]]), so any injected script could read it: a Content-Security-Policy matters.

## Options considered
1. **Headers in the Go server**, the same for the app and the API, with a policy allowing only what the app uses.
2. **Headers at a proxy or host** (once hosting is chosen). It ties security to the host's settings, and the dev server wouldn't match.
3. **A CSP in report-only mode first.** Safer to roll out, but nothing is blocked until it's switched on.

## Decision
Option 1, enforced from the start: it was tested in the browser with every page, Plaid Link and the production build.

- **Content-Security-Policy:** `default-src 'self'`.
  - Scripts from us and `cdn.plaid.com`, with no inline scripts.
  - Styles from us, plus inline style attributes (React sets widths and colours).
  - Images from us, `data:` (the 2FA QR code) and Plaid's two logo hosts.
  - Fonts from us.
  - Connections to us, `*.plaid.com` and the Supabase project origin (from `SUPABASE_URL`).
  - Frames only from `cdn.plaid.com`.
  - `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri` and `form-action` set to us.
- **Also:**
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy` turning off camera, microphone, location, payment and USB.
  - `Cross-Origin-Opener-Policy: same-origin-allow-popups`, for Plaid's OAuth bank pop-ups.
  - `Strict-Transport-Security` only over HTTPS (`r.TLS` or `X-Forwarded-Proto: https`), never on localhost.
- **Caching:**
  - API answers are `no-store`, since they're balances and transactions.
  - `index.html` and other files are `no-cache`.
  - Hashed files under `/assets/` are cached for a year, `immutable`.
- **Timeouts:** read 30s, write 60s (linking a bank waits on Plaid), idle 120s, headers 10s, header size 64 KB.
- **Rate limits:** per signed-in person, in memory, fixed windows; 429 with `Retry-After`.
  - 600 API calls a minute.
  - 30 Plaid calls an hour (link token, exchange, reconnect token).
  - 20 invites created an hour.
  - 10 invite accepts per 10 minutes.
  - Sign-in itself is rate-limited by Supabase.
- **Dev server:** `web/vite.config.js` sends the same policy, plus Vite's inline refresh script and live-reload socket, so anything it would block shows up while developing. The two must be kept in step.

## Consequences
- **New outside sources:** a new script, image host, frame or API (a maps provider, #60; analytics) must be added to both policies, or it will be blocked.
- **More than one server process:** rate limits are per process. They need a shared store (Postgres or Redis) before running more than one.
- **Inline styles:** `'unsafe-inline'` for styles stays until inline styles are moved to classes, a low risk without inline scripts.
- Code: `internal/api/security.go`, `internal/api/ratelimit.go`, tests in `internal/api/security_test.go`.
