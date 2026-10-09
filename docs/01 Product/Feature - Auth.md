---
type: spec
status: active
owner: Dinesh
updated: 2026-10-08
issue: 7
tags: [spec, auth, security]
---

# Feature — Auth: email + 2FA

## Problem
Family finance data must stay private to each person and household. People need to sign up and log in securely before Tallyn shows them anything.

## Goal and success metric
Every API call that touches family data comes from a person who signed in with email and password **and** a second factor. Success: no API route under `/api/` (other than the health check) answers without a verified, 2FA-completed Supabase session.

## User stories
- As a new user, I want to create an account with my email so that I can start using Tallyn.
- As a user, I want to set up an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…) so that a stolen password isn't enough to get into my family's money.
- As a returning user, I want to log in with my email, password and a 6-digit code.
- As Tallyn, we want the server to check every request itself, so that a bug in the web app can't expose data.

## Scope
**In:**
- Sign up with email + password, with email confirmation (Supabase Auth)
- 2FA with an authenticator app (TOTP), **required for everyone**, kids' logins included
- Set up 2FA after first log-in: scan a QR code or type the secret, then confirm a code
- Log in: email + password, then the 6-digit code
- Sign out
- `internal/auth`: verify the Supabase access token on every `/api/` request and require 2FA (`aal2`)
- `GET /api/me`: the signed-in person's profile and households, read through `AsUser` so RLS applies
- Bare-bones screens using `design-tokens.json`

**Out:**
- Styled sign-in screens (the comps don't have them yet; see [[Design System]])
- Password reset and changing email (needs its own ticket)
- Recovery if someone loses their authenticator app (needs its own ticket: backup codes or a support flow)
- SMS 2FA (a paid Supabase add-on), social and SSO log-in
- Invitations and finer role rules ([#12](https://github.com/Kolla1997/Tallyn/issues/12))

## Design
Screens, in order: **Sign in / Create account** → **Check your email** → **Set up your authenticator app** (QR code, secret, code field) → **Enter your code** (on later log-ins) → home (shows `/api/me`, Sign out).

Uses tokens from `design-tokens.json`: Cream page, white 22px cards with a Border outline, 14px inputs, Clay Deep pill primary button, Error for error text. Logo: `brand/logo/svg/tallyn-lockup-horizontal-light.svg`. Copy follows [[Voice and Tone]]: calm and clear.

## Tech notes
How sign-in works: [[0003-browser-sign-in-with-supabase-js]].

1. The React app signs in with `supabase-js` using the **publishable (anon) key**, which is public. It never sees the service role key.
2. Supabase gives the browser a short-lived access token (JWT). The app sends it to the Go API as `Authorization: Bearer <token>`.
3. `internal/auth` checks it on every `/api/` request except `/api/health`:
   - signature, against Supabase's public signing keys from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (ES256 or RS256, cached and refreshed)
   - `exp` present and not passed, `iss` = `<SUPABASE_URL>/auth/v1`, `aud` = `authenticated`, `role` = `authenticated`, `sub` is a UUID, not anonymous
   - `aal` = `aal2`. A password-only token gets `401` with `mfa_required`
4. The verified user ID goes into the request context. Handlers pass it to `db.AsUser`, so it never comes from the request body ([[0002-backend-database-access]]).
5. **Roles** are enforced by RLS in the database (#6): owners, adults and children see different rows. Go doesn't repeat those checks. Finer rules (spending limits) come with #12.
6. If `SUPABASE_URL` or `DATABASE_URL` isn't set, protected routes answer `503` and the health check still works. Nothing is ever served unauthenticated.

**Supabase dashboard settings** (dev and prod projects):
- Auth → Providers → Email: on, with **Confirm email** on
- Auth → Multi-Factor: **TOTP** on (free and on by default; phone MFA is a paid add-on and stays off)
- Auth → URL configuration: site URL and redirect URLs for local dev (`http://localhost:5173`) and prod
- Project Settings → JWT signing keys: use an asymmetric key (ES256). The legacy shared secret isn't used
- API → Data API: turn it off, or remove `public` from exposed schemas, so the browser can't query tables directly even with a user token (only the backend talks to the database)

## Rollout
Dev Supabase project first: run migrations 0001–0003, apply the settings above, sign up, set up 2FA, and check `/api/me`. Then the prod project when hosting is chosen.

## Open questions
- Kids' logins: is 2FA right for young children, or should a parent's device cover them? For now everyone needs it. #12 can relax it.
- Add a Content-Security-Policy header to the Go server, to cut the XSS risk of keeping the token in the browser? (follow-up ticket)
- Pass `aal` into `AsUser`'s claims, so RLS can also require 2FA as a second line of defence?
