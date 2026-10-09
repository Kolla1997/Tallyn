---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-09
issue: 9
tags: [adr, security, database, sync]
---

# 0005 — The bank sync writes through a narrow system role, and location data has its own visibility rule

- **Status:** Proposed
- **Date:** 2026-10-09
- **Ticket:** #9

## Context
The bank sync runs with no signed-in user, across every household, so `AsUser` and RLS-as-the-user don't apply. [[0002-backend-database-access]] said it would get "a separate system path with its own narrow role". Transactions now also carry time and location, which are more private than the transaction itself ([[Feature - Bank Sync]]).

## Options considered
**Sync writes**
1. A NOLOGIN role `tallyn_sync`, reached with `SET LOCAL ROLE` inside `internal/sync` only, with column-level grants and RLS policies of its own.
2. Run the sync as the backend login (`postgres`), which bypasses RLS.
3. A separate database login for the sync.

**Location and time**
1. Columns on `transactions` (same visibility as the transaction).
2. A separate `transaction_details` table with its own RLS policy.

## Decision
Sync option 1 now; option 3 as hardening (below). Location option 2.

- `tallyn_sync` can: read plaid items' encrypted token, cursor and status; update cursor, status and last-synced time; insert and update accounts (balances, accounts the bank adds later); insert, update and delete transactions and their details. It **cannot** read profiles, households or members, create, delete or re-own bank links, or write exchange rates. Tests check each of these.
- Only `cmd/server` hands `db.System` to `internal/sync`. Request handlers only ever get `*db.DB` and `AsUser`.
- `SaveSync` saves one complete sync in a single transaction and checks the bank's cursor hasn't changed since it was read (optimistic concurrency), so two servers can't interleave and replay older data. Upserts can't move a transaction or account to another bank.
- `transaction_details` (time, address, coordinates) is readable only when `can_see_whereabouts(household, owner)` is true: the person themselves, or a household owner for a teen's or child's transaction. #28 (sharing settings) will change only that function.
- Logs carry counts and Tallyn's own bank IDs, never merchants, amounts, places or tokens.

## Consequences
- **Finding while testing:** Postgres checks `SET ROLE` against the *login* role, and Supabase's `postgres` login also has `BYPASSRLS`. So code running inside `AsUser` could switch to `tallyn_sync`, or `reset role` to `postgres`. This was already true before #9. RLS therefore protects against **logic bugs** in handlers (a wrong `WHERE`), not against **SQL injection**. Every query in Tallyn is fixed text with parameters, so there is no injection path today, but the second lock is weaker than ADR 0002 implies.
- **Hardening:** done in #30, [[0006-separate-database-logins]]. Give the API its own login role that is a member of `authenticated` only (no `BYPASSRLS`), and the sync its own login as `tallyn_sync`. Then even injected SQL can't leave the user's role. It needs two connection strings and Supabase custom-role logins through the pooler.
- `can_see_whereabouts` is `security definer`; changes to it need careful review and the visibility tests in `internal/db/system_test.go`.
- Until #28, adults (partners) don't see each other's time and location; they still see each other's transactions.
