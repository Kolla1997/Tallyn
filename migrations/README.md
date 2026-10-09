# migrations

SQL schema for Supabase, applied in filename order: `NNNN_short_name.sql` (e.g. `0001_households.sql`).

Rules (see `CLAUDE.md` §7):
- Turn on row-level security for every table, and add its policies in the same migration.
- Never put real account data in a migration. Use obviously fake seed data.

| File | What |
|---|---|
| `0001_households.sql` | profiles, households, members and roles (#6) |
| `0002_bank.sql` | Plaid items, accounts, transactions (#6) |
| `0003_fx_rates.sql` | exchange rates (#6, used by #11) |
| `0004_plaid_link.sql` | checked functions for linking and unlinking banks (#8, ADR 0004) |
| `0005_bank_sync.sql` | bank sync's system role, transaction time and location with their own visibility (#9, ADR 0005) |
| `0006_app_logins.sql` | `tallyn_api` login role; the app stops using `postgres` (#30, ADR 0006). Passwords are set by hand, see Dev Setup |

Apply them in order on the Supabase project (SQL editor, or `psql "$ADMIN_DATABASE_URL" -f <file>`). Migrations run as `postgres`; the app itself never does (ADR 0006).
Tests apply them to a throwaway Postgres: see `internal/db/db_test.go`. `TestEveryTableHasRLS` fails if a table is missing RLS.
Model and rules: `docs/01 Product/Feature - Data Model.md`.
