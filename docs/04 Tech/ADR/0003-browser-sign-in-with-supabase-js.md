---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-08
issue: 7
tags: [adr, security, auth]
---

# 0003 — The browser signs in with supabase-js, and Go verifies the token on every request

- **Status:** Proposed
- **Date:** 2026-10-08
- **Ticket:** #7

## Context
Tallyn needs email sign-up, log-in and required 2FA ([[Feature - Auth]]). Supabase Auth provides all three. Something has to hold the session, and the Go API has to know who is calling so that `AsUser` can run the request as that person ([[0002-backend-database-access]]).

## Options considered
1. **Browser holds the session.** The React app uses `supabase-js` with the public publishable key for sign-up, log-in and TOTP. It sends the access token to Go as `Authorization: Bearer`. Go verifies the token against Supabase's public signing keys (JWKS).
2. **Go holds the session.** Go calls Supabase Auth's REST API for every step and keeps the session in an `HttpOnly` cookie. The browser never sees a token.
3. Like 1, but verify tokens with the legacy shared JWT secret (HS256).

## Decision
Option 1.
- The publishable key is public by design. The service role key never reaches the browser (CLAUDE.md §7).
- `internal/auth` checks signature (ES256/RS256 from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), expiry, issuer, audience `authenticated`, role, a UUID `sub`, and **`aal2`** on every `/api/` request except `/api/health`. Anything missing or wrong is `401`. It fails closed: if auth isn't configured, protected routes answer `503`.
- New `/api/` routes are protected by default: the auth check wraps the whole `/api/` tree, and only the health check is registered outside it.
- 2FA is TOTP (any authenticator app, free on Supabase). SMS is a paid add-on and isn't used.

## Consequences
- Supabase's standard flow: sign-up, email confirmation, 2FA enrolment and token refresh come from `supabase-js`, not custom Go code.
- The access token lives in the browser (local storage), so an XSS bug could steal it. Tokens are short-lived, and a Content-Security-Policy header should be added (follow-up).
- The browser holds a real Supabase user token, so it could call Supabase's Data API directly. RLS still protects rows, but the Data API should be switched off (or `public` removed from exposed schemas) so only the backend talks to the database.
- Rotating signing keys needs no deploy: Go refreshes the key set from JWKS.
- Option 2 stays possible later if we need cookie sessions (for example, for a mobile web view). It would replace this ADR.
