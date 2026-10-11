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
| `0007_sharing.sql` | sharing settings: consent-based visibility, new unlink rule (#28, ADR 0007) |
| `0008_invites.sql` | invitations: hashed single-use links bound to the invited email (#12, ADR 0008) |
| `0009_transaction_logos.sql` | merchant logos (Plaid's logo hosts only) and `transaction_owner()` (#42) |

Apply them in order on the Supabase project (SQL editor, or `psql "$ADMIN_DATABASE_URL" -f <file>`). Migrations run as `postgres`; the app itself never does (ADR 0006).
Tests apply them to a throwaway Postgres: see `internal/db/db_test.go`. `TestEveryTableHasRLS` fails if a table is missing RLS.
Model and rules: `docs/01 Product/Feature - Data Model.md`.
