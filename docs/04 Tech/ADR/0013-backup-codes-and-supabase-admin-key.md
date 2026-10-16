---
type: adr
status: active
owner: Dinesh
updated: 2026-10-16
issue: 23
tags: [adr, security, auth]
---

# 0013 — Backup codes, and the server-only Supabase key

- **Status:** Accepted (Dinesh, 2026-10-16)
- **Date:** 2026-10-16
- **Ticket:** #23

## Context
2FA is required for everyone ([[0003-browser-sign-in-with-supabase-js]]). Someone who loses their phone is locked out of their family's money for good. Supabase supports several authenticators per person, but it has no backup codes. A person at the password step (`aal1`) can't remove a verified authenticator themselves.

Dinesh chose A + B on 2026-10-16:
- **A:** more than one authenticator.
- **B:** backup codes.
- **C:** a family owner resetting a member's 2FA, later in #120.

## Decision
- **More than one authenticator:**
  - Settings lists them by name. You can add one (name, then QR, then a code) and remove one with a fresh code, never the last.
  - Every 2FA check accepts a code from **any** of them: sign-in, step-up (ADR 0009) and the dialogs.
- **Backup codes:**
  - Ten codes like `7KQ4-M9TX`: eight characters from an alphabet without look-alikes (no 0/O, 1/I/L), about 40 bits each.
  - Shown once, right after setting up 2FA, or once for existing accounts at a fresh sign-in ("Remind me next time" allowed).
  - A new set from Settings needs a fresh code.
  - Stored only as **HMAC-SHA-256 with a server key** (`backup_codes`, `0014_backup_codes.sql`). People can read how many they have left, never a hash. Writes go only through `replace_backup_codes` and `use_backup_code`, which act on the signed-in person alone.
  - **The hashing key** is derived from `TOKEN_ENCRYPTION_KEY`, so there's no new secret to manage. Rotating that key means everyone makes new codes.
- **Recovery:**
  - The password sign-in, plus a backup code, at `POST /api/recovery/backup-code`. This is the only route that accepts an `aal1` token (`auth.RequireSignedIn`), and the 12-hour limit still applies (ADR 0012).
  - The server marks the code used, then removes the person's authenticators through **Supabase's admin API**. The person sets up a new authenticator at once and gets a new set of codes.
  - A wrong code changes nothing.
  - Tries are limited to 5 per 15 minutes per person, and logged.
  - If the removal fails, that one code is spent but the other codes still work.
- **The server-only key:**
  - `SUPABASE_SERVICE_ROLE_KEY` is used **only** by `internal/supabaseadmin`, and only to list and delete a person's factors.
  - Never for the database (ADR 0002, 0006), never sent to the browser, never in the repo.
  - Without it, backup codes still work in Settings, and recovery answers 503.

## Options considered
1. **A + B, as above** (chosen).
2. **Only a second authenticator:** nothing new to protect, but it only helps people who set one up before losing their phone.
3. **Backup codes checked by Supabase:** not offered by Supabase.
4. **bcrypt instead of HMAC:** slow hashing matters when codes can be guessed offline. With a server key the database never holds, a copy of the table alone can't be used to guess codes, and HMAC lets the database find the code without reading hashes into the app.

## Consequences
- The backend holds a powerful key. Its use is one package and two admin calls, both covered by tests. A leak would let someone remove people's authenticators (not sign in as them), so it lives only on the server host.
- Supabase's **security notification emails** ("MFA method added / removed") tell people when their 2FA changes, once switched on in the dashboard (Dev Setup). It's not confirmed whether an admin removal sends the "removed" email; the new authenticator that follows always sends "added".
- #120 (family owner reset) can reuse `supabaseadmin`, with its own rules.
