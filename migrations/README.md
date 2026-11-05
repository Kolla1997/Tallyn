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
| `0010_consents.sql` | who agreed to which version of the Terms and Privacy Policy (#36) |
| `0011_credit_cards.sql` | credit limits, card details from Plaid Liabilities (APRs, minimum, due date), sync once a day (#27) |
| `0012_card_details_state.sql` | what the bank last said about card details (shared, consent needed, not offered), so Add APR and due dates only shows when it helps (#51) |
| `0013_loans.sql` | student loan and mortgage details from Plaid Liabilities for the Debts page (#27) |
| `0014_backup_codes.sql` | one-time backup codes, keyed hashes only, used and replaced through two functions (#23, ADR 0013) |
| `0015_budgets.sql` | budgets for the household or one person, the count-my-spending choice, and `budget_spending()` (totals only) (#13, ADR 0014) |
| `0020_notifications.sql` | in-app notifications: one person per alert, written by triggers (big purchase, low balance, bank to reconnect, someone joined) (#267) |
| `0021_notification_settings.sql` | each person's alert switches and amounts; parents hear their kids' big purchases and reconnects; one partner by choice, only for what is already shared (#268) |
| `0022_notification_dismiss.sql` | close an alert in the bell's list (`dismissed_at`); a bank to reconnect stays on Home until fixed (#267) |
| `0023_notification_emails.sql` | payment-due alerts, the email outbox (`emailed_at`) and a parent's opt-in for a child's reconnect emails (#269) |
| `0025_monthly_highlights.sql` | monthly highlights email: switch, what it shows (`monthly_summary`), who's due (`monthly_due`) and months already looked at (#274) |
| `0024_weekly_summary.sql` | weekly summary email: switches, the person's time zone, what the email shows (`weekly_summary`), who's due (`weekly_due`) and weeks already looked at (#273) |

Apply them in order on the Supabase project (SQL editor, or `psql "$ADMIN_DATABASE_URL" -f <file>`). Migrations run as `postgres`; the app itself never does (ADR 0006).
Tests apply them to a throwaway Postgres: see `internal/db/db_test.go`. `TestEveryTableHasRLS` fails if a table is missing RLS.
Model and rules: `docs/01 Product/Feature - Data Model.md`.
