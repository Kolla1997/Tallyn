---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-11
issue: 38
tags: [adr, security, members, auth]
---

# 0009 — Serious member changes need a fresh 2FA code, checked by the server

- **Status:** Proposed
- **Date:** 2026-10-11
- **Ticket:** #38 (built with #39 step 4)

## Context
Removing a member, leaving a household and making or unmaking an owner change who can see a family's money. Until now one tap on an in-page "Remove?" did it. A mis-tap, or someone using an unlocked laptop, could remove a person or hand over ownership. Every session already completed 2FA at sign-in (aal2, [[0003-browser-sign-in-with-supabase-js]]), but that may have been days ago.

## Options considered
1. **Typed confirmation only** (type the person's name). Stops mis-taps, not someone at an unlocked device. Browser-only.
2. **Fresh 2FA code, checked by the server.** The browser asks for a new code just before the action and verifies it with Supabase (`mfa.challengeAndVerify`), which updates the session's `amr` claim with the time of that code. The API refuses the action unless the access token shows a code from the last 5 minutes.
3. **Re-enter the password.** Works for password sign-in only, and passwords are what attackers usually have; the authenticator is the stronger factor.

## Decision
Option 2 plus the typed name (Dinesh, 2026-10-11):

| Action | Typed name | Fresh 2FA code (server-checked) |
|---|---|---|
| Remove a member | Yes | Yes |
| Leave a household | Household name | Yes |
| Make someone an owner, or change an owner's role | Yes | Yes |
| Other role changes (adult, teen, viewer) | No | No |
| Unlink a bank | Bank name | No (your own data; you can link it again) |

- `internal/auth` reads the token's `amr` list and keeps the newest `totp` time as `Session.TOTPAt`.
- `internal/api/members.go` `recentCode` returns `403 reauth_required` unless `TOTPAt` is within `StepUpWindow` (5 minutes, with 1 minute of clock leeway). Role changes look up the target's current role first, so demoting an owner is covered too.
- `web/src/components/ConfirmDialog.jsx` is the modal: typed name, optional code, Cancel first, the destructive button only enabled when everything is filled in.

## Consequences
- A stolen session token older than 5 minutes can no longer remove people or change owners.
- Doesn't depend on our own code storage: Supabase verifies the code and signs the time into the token.
- If someone loses their authenticator they can't do these actions until #23 (authenticator recovery) exists.
- Unlink stays browser-confirmed only. Revisit if unlinking becomes something others can do to you.
