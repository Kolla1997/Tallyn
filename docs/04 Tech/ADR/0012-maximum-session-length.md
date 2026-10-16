---
type: adr
status: active
owner: Dinesh
updated: 2026-10-16
issue: 92
tags: [adr, security]
---

# 0012 — Sign in again after 12 hours

- **Status:** Accepted (Dinesh, 2026-10-16)
- **Date:** 2026-10-12
- **Ticket:** #92

## Context
Signing out after 30 minutes without activity (#91) doesn't stop a session that keeps being used, or a copied access token, from lasting forever: Supabase refreshes it indefinitely. Supabase's "Time-box user sessions" setting would end it on the server, but only on paid plans, and Tallyn is on the free plan.

Every Supabase access token carries an `amr` list of how and when the session authenticated: the password sign-in, then each 2FA code. The API already reads it for step-up checks ([[0009-step-up-2fa-for-member-changes]]).

## Options considered
1. **The Go API refuses sessions older than 12 hours**, using the oldest `amr` timestamp. The web app also signs out at 12 hours, so people see a calm note instead of failed requests.
2. **The web app only.** Less work, but a copied token would keep working against the API.
3. **Wait for Supabase's paid setting.** It costs money, and we can have the same protection now.

## Decision
Option 1, with **12 hours** (Dinesh, 2026-10-12): long enough for a family using Tallyn through the day, and short enough that a session doesn't last overnight.

- **API** (`internal/auth`):
  - When it verifies a token, it rejects one whose sign-in (the oldest `amr` entry) is more than 12 hours and 1 minute old. The answer is a 401 with `session_expired`.
  - A token with no sign-in time is refused too.
  - A 2FA step-up adds a newer entry, so it doesn't restart the clock.
- **Web** (`web/src/lib/session.js`, `components/SessionLimit.jsx`):
  - The app checks every minute, and when the tab comes back into view.
  - At 12 hours it signs out and the sign-in page says: "For your security, Tallyn asks you to sign in again every 12 hours."
  - A `session_expired` answer from the API does the same.
- **Automatic sign-outs end only this device's session.** That covers 12 hours and also 30 minutes without activity (#91). Supabase's default sign-out ends every device, so stepping away from a laptop also signed out the phone. The Sign out button still ends every session.

## Consequences
- Everyone signs in (with 2FA) at least every 12 hours.
- The Supabase refresh token itself still lives on, but every token it produces is refused by the API after 12 hours, and the web app ends the session.
- **If we move to a paid Supabase plan,** also switch on "Time-box user sessions" at 12 hours, so the session itself ends there too.
- To change the length, change `MaxSession` in `internal/auth/auth.go` and `MAX_SESSION_MS` in `web/src/lib/session.js`, and the note's wording.
