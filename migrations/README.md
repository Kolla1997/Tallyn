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

Apply them in order on the Supabase project (SQL editor, or `psql "$DATABASE_URL" -f <file>`).
Tests apply them to a throwaway Postgres: see `internal/db/db_test.go`. `TestEveryTableHasRLS` fails if a table is missing RLS.
Model and rules: `docs/01 Product/Feature - Data Model.md`.
