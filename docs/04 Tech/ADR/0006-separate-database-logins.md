---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-09
issue: 30
tags: [adr, security, database]
---

# 0006 — The API and the bank sync log in with their own narrow database roles

- **Status:** Proposed
- **Date:** 2026-10-09
- **Ticket:** #30
- **Supersedes:** the `DATABASE_URL is the Supabase postgres connection` part of [[0002-backend-database-access]]

## Context
While testing #9 we found ([[0005-bank-sync-system-role]]) that the backend logged in as Supabase's `postgres`, which has `BYPASSRLS`. Postgres checks `SET ROLE` / `RESET ROLE` against the **login** role, so SQL injected into a request could leave `authenticated` and read every household's data and encrypted bank tokens. RLS only stopped logic bugs. No injection path existed (all SQL fixed and parameterised), but a finance app needs the database to be a real second lock.

## Options considered
1. Keep `postgres` and rely on writing safe SQL.
2. **Two login roles**: `tallyn_api` (can only become `authenticated`) and `tallyn_sync` (logs in as itself). `postgres` only for migrations.
3. Verify the Supabase JWT inside the database on every query (e.g. a signed claim checked by a function), so even the user ID can't be forged.

## Decision
Option 2, plus a test that keeps all SQL constant. Option 3 noted for later.

- `0006_app_logins.sql` creates `tallyn_api` (NOLOGIN until an admin sets a password) and grants it `authenticated` **WITH INHERIT FALSE, SET TRUE**: it can switch to `authenticated` in `AsUser`, but has no rights of its own. `tallyn_sync` (from 0005) gets a login the same way.
- **Passwords are never in migrations or git.** An admin runs `alter role … with login password …` in the Supabase SQL editor and keeps them in the password manager.
- The app reads `DATABASE_URL` (as `tallyn_api`) and `DATABASE_URL_SYNC` (as `tallyn_sync`). `ADMIN_DATABASE_URL` (as `postgres`) is for running migrations by hand; the app never reads it, and it's never set on the production host.
- **The server refuses to start** if `DATABASE_URL` can bypass RLS, is a superuser, can become `tallyn_sync`, can't become `authenticated`, or inherits its rights; or if `DATABASE_URL_SYNC` can bypass RLS, can become `authenticated`, or can't become `tallyn_sync` (`CheckAPILogin`, `OpenSystem`).
- `db.System` has its own pool on the sync login. `(*DB).System()` was removed, so the API's pool can't reach it.
- **Attack-simulation tests** (`internal/db/logins_test.go`): inside `AsUser`, `reset role` then reading transactions, profiles or tokens, calling the link function, and switching to `tallyn_sync`, the superuser, `service_role` or `anon` all fail; outside `AsUser` the API login reads nothing; the sync login can't reach profiles or become `authenticated`.
- All database tests now run through the real `tallyn_api` and `tallyn_sync` logins.
- `TestSQLIsAlwaysConstant` fails the build if any `Query`, `QueryRow`, `Exec` or `Queue` call gets SQL that isn't a compile-time constant.

## Consequences
- Injected SQL in a request can no longer bypass RLS, read bank tokens, or reach the sync role.
- **Remaining limit:** the user's ID is a per-transaction setting (`request.jwt.claims`), so injected SQL could still change it and read *one* other user's data at a time, within RLS. Option 3 would close this.
- Defends against SQL injection, not a compromised server: the server's environment holds both connection strings and the token key. That needs other measures (KMS for the key, hosting access controls).
- Two connection strings to manage; both must use Supabase's pooler username format `role.projectref`.
- Every new table still needs RLS policies for `authenticated` (and, if the sync writes it, `tallyn_sync`); `tallyn_api` itself is never granted anything.
