---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-09
issue: 12
tags: [adr, security, members]
---

# 0008 — Invitations are hashed, single-use links bound to the invited email

- **Status:** Proposed
- **Date:** 2026-10-09
- **Ticket:** #12

## Context
People need to join households ([[Feature - Household Members]]). An invite grants access to a family's household (and, for parents, to their kids' money), so a leaked or guessed invite must not let a stranger in. Tallyn has no email-sending service yet.

## Options considered
1. **Link the owner sends**, carrying a random token; the database stores only its hash; joining needs the invited, confirmed email.
2. Supabase's built-in invite email (`inviteUserByEmail`): needs the service role key in the backend and creates accounts on Supabase's side.
3. Short codes typed by hand: easier to share, far easier to guess.

## Decision
Option 1.

- Token: 32 random bytes (base64url, 43 characters), made in Go. The database stores **SHA-256(token)** only; the token is returned once in a `Cache-Control: no-store` response and never logged.
- Links are `/join#<token>`. The **fragment** isn't sent in HTTP requests, so the token doesn't reach server or proxy logs or `Referer` headers. The web app moves it to `localStorage` until the person has signed in with 2FA, removes it from the address bar, and clears it after use.
- `accept_household_invite(hash)` (security definer, fixed `search_path`) reads the caller's email from `auth.users`, **requires `email_confirmed_at`**, and joins only if it matches the invite's email and the invite isn't used, cancelled or expired. Every refusal is the same error, so a link can't be used to learn whether an invite exists or who it's for.
- `create_household_invite` requires an owner, allows only adult, teen and viewer, refuses existing members, replaces an open invite to the same email, and caps open invites at 20.
- Owners can read invites (email, role, dates) but **not the token hash** (column not granted).
- Joining doesn't create any shares ([[0007-consent-based-visibility]]).

## Consequences
- A database leak reveals no usable links. A leaked link is useless without signing in as the invited, confirmed email (with 2FA).
- The owner has to send the link themselves; the UI shows it once with a Copy button.
- If the invited person signs up with a different email, the invite won't work; the owner invites that email instead.
- Children can't be invited until the COPPA question is answered; the `child` role stays for existing data and future use.
- Adding Tallyn-sent emails later changes delivery only; the token, hash and checks stay.
