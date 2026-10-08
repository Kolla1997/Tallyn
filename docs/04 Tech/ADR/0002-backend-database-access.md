---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-08
issue: 6
tags: [adr, security, database]
---

# 0002 — Backend database access runs as the user, so RLS applies

- **Status:** Proposed
- **Date:** 2026-10-08
- **Ticket:** #6

## Context
Only the Go backend talks to the database (`CLAUDE.md` §7), and every table has row-level security (RLS). The original plan had the backend connect with Supabase's **service role**. That role skips every RLS policy, so RLS would protect nothing: one missing `WHERE household_id = ...` in Go code could show one family another family's money.

## Options considered
1. **Service role for everything.** Simple, but RLS is decoration. All isolation depends on Go code being perfect.
2. **Run each user request as that user.** The backend opens a transaction, switches to the `authenticated` role and sets the user's ID in `request.jwt.claims`. Supabase's `auth.uid()` reads it, and the policies in `migrations/` apply. This is what Supabase's own data API does.
3. **Use the Supabase client from React.** Ruled out: only the backend talks to the database.

## Decision
Option 2.
- `internal/db` exposes `AsUser(ctx, userID, fn)`. Every request handler uses it. The raw pool is never exported.
- `userID` comes only from a verified Supabase session (#7), never from the request body.
- `SET LOCAL ROLE` and `set_config(..., true)` end with the transaction, so a pooled connection can't carry one user's identity into the next request. A test checks this.
- Users can read bank data but not write it. Writes to `plaid_items`, `accounts`, `transactions` and `fx_rates` come from the bank sync through a separate **system path**, added in #8 / #9 with its own narrow role, never used by request handlers.
- `DATABASE_URL` is the Supabase `postgres` connection (it can `SET ROLE authenticated`). The service role key is not used for database access.

## Consequences
- RLS is a real second lock: a bug in a handler still can't leak another household's rows.
- Every handler runs in a transaction. That costs one extra round trip per request, which is fine at our scale.
- Plaid access tokens are protected twice: encrypted (#8), and the column isn't readable by `authenticated`.
- The system path is the one place that bypasses RLS, so it needs careful review when #8 / #9 add it.
