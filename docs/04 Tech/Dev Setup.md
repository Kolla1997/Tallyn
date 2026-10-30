---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-30
issues: [5, 6, 7, 8, 9, 30, 99, 113]
tags: [tech, onboarding]
---

# Dev Setup

## Prerequisites
Go 1.24+, Node 22+ and npm, a Supabase project, Plaid sandbox keys. Docker is optional (for the production image).

## Run locally
1. Copy `.env.example` to `.env` and fill in your keys
2. Copy `web/.env.example` to `web/.env.local` and add the Supabase project URL and **publishable** key (never the service role key)
3. Run the SQL in `migrations/` on your Supabase project, in filename order
4. Set up Supabase Auth in the dashboard (below)
5. Backend: `go run ./cmd/server` (API on http://localhost:8080, check `/api/health`)
6. Frontend: `cd web && npm install && npm run dev` (Vite forwards `/api` to the Go server)
7. Open http://localhost:5173, create an account, confirm the email, set up 2FA with an authenticator app, and you should see your profile from `/api/me`

> [!warning] Run the migrations before anyone signs up
> Profiles are created by a trigger on sign-up (`0001_households.sql`). Accounts created before the migrations have no profile, and `/api/me` answers `no_profile`. Fix it in the SQL editor: `insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;`

Without `SUPABASE_URL` or `DATABASE_URL` the server still starts, but every `/api/` route except `/api/health` answers `503`.

> [!warning] Node version
> Vite 8 needs Node 20.19+ or 22.12+. An older `node` first on your `PATH` fails with `styleText` or "Cannot find native binding" errors. Check with `node -v`.

## Bank linking (#8)
1. Run `migrations/0004_plaid_link.sql` on the Supabase project (SQL editor), after 0001–0003
2. Plaid keys: sign up free at dashboard.plaid.com → Developers → Keys. Put the **client ID** and the **sandbox secret** in `.env` as `PLAID_CLIENT_ID` and `PLAID_SECRET`, with `PLAID_ENV=sandbox`
3. Token key: `openssl rand -base64 32`, then set `TOKEN_ENCRYPTION_KEY` in `.env`. Use a different key for production
4. Restart the backend. It shouldn't print "bank linking will answer 503"
5. In the app: create a household, **Link a bank**, pick any sandbox bank and sign in with `user_good` / `pass_good`

> [!warning] Keep the token key safe
> Losing `TOKEN_ENCRYPTION_KEY` means every linked bank has to be linked again. Keep the production key in a password manager and the host's secret store, never in git or chat. See [[0004-plaid-token-encryption-and-link-path]].

## Database logins (#30)
The app never logs in as `postgres` (ADR 0006). After running `migrations/0006_app_logins.sql`:
1. Make two passwords, letters and numbers only so they need no encoding: `openssl rand -hex 24`, twice. Save both in the password manager
2. In the Supabase SQL editor, run (with your passwords):
   ```sql
   alter role tallyn_api  with login password 'API_PASSWORD';
   alter role tallyn_sync with login password 'SYNC_PASSWORD';
   ```
3. In `.env`, copy the pooler host from **Connect → Session pooler**, then set:
   - `DATABASE_URL=postgresql://tallyn_api.<project-ref>:API_PASSWORD@<pooler-host>:5432/postgres`
   - `DATABASE_URL_SYNC=postgresql://tallyn_sync.<project-ref>:SYNC_PASSWORD@<pooler-host>:5432/postgres`
   - move the old `postgres` connection string to `ADMIN_DATABASE_URL` (for migrations only)
4. Start the backend. If a login is wrong, it stops with `unsafe database login: …` and says which one

## Bank sync (#9)
1. Run `migrations/0005_bank_sync.sql` on the Supabase project, after 0001–0004 (and set `DATABASE_URL_SYNC`, see above)
2. Restart the backend. It prints `bank sync every 6h` and syncs every linked bank straight away
3. For testing, `SYNC_EVERY=2m` in `.env` makes it sync more often (minimum 1m)
4. A new link syncs within a minute or two; the log shows counts only (`sync: bank <id>: 16 added or changed, ...`)

## Savings goals (#14)
1. Run `migrations/0018_goals.sql` on the Supabase project, after 0001–0017
2. Goals that follow an account get their monthly history from the bank sync's daily job, so `DATABASE_URL_SYNC` must be set where it should run. The forecast shows after a goal's second month

## Plan from your income (#133)
1. Run `migrations/0017_income_plans.sql` on the Supabase project, after 0001–0016
2. Budgets → Plan your month suggests an income from the last 3 full months of pay. Sandbox banks have little pay history, so expect "no suggestion" and type one in

## Closing an account (#56)
1. Run `migrations/0016_close_account.sql` on the Supabase project, after 0001–0015
2. Closing needs bank linking set up (Plaid keys and `TOKEN_ENCRYPTION_KEY`) and `SUPABASE_SERVICE_ROLE_KEY`; without them, Close account answers 503
3. Closing records older than 3 years are purged daily by the bank sync, so `DATABASE_URL_SYNC` must be set where it should run ([[0015-closing-an-account]])

> [!warning] Closing can't be undone
> Try it only with test accounts. It unlinks the banks at Plaid (sandbox in dev) and deletes the Supabase sign-in.

## Supabase Auth settings (#7)
In the Supabase dashboard, for each project (dev and prod). See [[Feature - Auth]].
- Auth → Providers → Email: on, with **Confirm email** on, and **minimum password length 8** (#22; the app asks for 8 too)
- Auth → Email templates → **Reset password** (#22): subject "Reset your Tallyn password", body: "Someone asked to reset the password for your Tallyn account. If it was you, open this link to choose a new one: {{ .ConfirmationURL }} It works for 1 hour. You'll be asked for your authenticator code first. If it wasn't you, you can ignore this email: your password stays the same."
- Auth → Multi-Factor: **TOTP** on (free, on by default). Leave phone MFA off (paid add-on)
- Auth → Emails → **Security notifications** (#23): switch on "Password changed", "MFA method added" and "MFA method removed", so people hear when their sign-in changes
- Project Settings → API keys → **secret key** (#23, ADR 0013): put it in `.env` as `SUPABASE_SERVICE_ROLE_KEY`, **only** on the server. It's used only to remove a lost authenticator; without it, backup-code recovery answers 503
- Auth → URL configuration: add `http://localhost:5173` (dev) and the prod URL to redirect URLs. Password reset links (#22) come back to the site's address, so nothing more is needed
- Project Settings → JWT signing keys: use an asymmetric key (ES256). The Go server reads the public keys from JWKS
- API → Data API: turn it off, or remove `public` from exposed schemas. Only the backend talks to the database

To try the single-deployment setup: `cd web && npm run build`, then `go run ./cmd/server` serves the built app from `web/dist`.

## Browser end-to-end tests (#113)
The P0 paths (sign-in with 2FA, Home totals, connecting a sandbox bank, inviting a member, sharing) in a real browser, against the Go API, a **Supabase project just for tests** and the Plaid sandbox. They run weekly (Mondays) and by hand (GitHub → Actions → **End-to-end** → Run workflow), never on pull requests. Rows in [[Test Plan]].

> [!warning] Test project only
> Never point these at tallyn-dev or production. Each test makes its own people (`e2e-…@example.test`) with the project's secret key, and deletes them afterwards. Households they made stay behind, empty.

**Set up the test project once:**
1. Create a new Supabase project (e.g. `tallyn-e2e`) and set it up like the others: migrations in order, Auth settings and database logins (sections above). Plaid stays on **sandbox**.
2. Add these **repository secrets** (Settings → Secrets and variables → Actions). Values come from the test project and the Plaid dashboard, never from chat or the repo:

| Secret | What it is |
|---|---|
| `E2E_SUPABASE_URL` | The test project's URL |
| `E2E_SUPABASE_PUBLISHABLE_KEY` | Its publishable key |
| `E2E_SUPABASE_SECRET_KEY` | Its secret key: makes and deletes test people, and the server uses it for backup-code recovery |
| `E2E_DATABASE_URL` | `tallyn_api` login for the test project |
| `E2E_DATABASE_URL_SYNC` | `tallyn_sync` login for the test project |
| `E2E_PLAID_CLIENT_ID` / `E2E_PLAID_SECRET` | Plaid client ID and **sandbox** secret |
| `E2E_TOKEN_ENCRYPTION_KEY` | A test-only key: `openssl rand -base64 32` |

**Run locally:** export the same `E2E_*` values in your shell (not in a file in the repo), then `cd web && npx playwright install chromium && npm run test:e2e`. It builds the app, starts the Go server on port 8090 and runs the tests one at a time. Failures keep screenshots and traces in `web/test-results-e2e/`.

## Common tasks
| Task | Command |
|---|---|
| Sync board into docs | Automatic (GitHub Action every 6 hours and on issue changes, `git pull` to get it). By hand: `python3 scripts/sync_board.py` |
| Test | `go test ./...` (database tests skip unless `TALLYN_TEST_DATABASE_URL` is set) |
| Browser end-to-end tests | `cd web && npm run test:e2e` (needs the `E2E_*` values, above) |
| Test the schema and RLS | Start a throwaway Postgres: `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16`, then `TALLYN_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres go test ./internal/db`. Without Docker, Homebrew `postgresql@16` works too (steps in [PR #20](https://github.com/Kolla1997/Tallyn/pull/20)) |
| Lint | `go vet ./...` and `gofmt -l cmd internal`; web: `cd web && npm run lint` (ESLint, #100) |
| Format the web app | `cd web && npm run format` (Prettier: single quotes, no semicolons; check with `npm run format:check`) |
| Test the web app | `cd web && npm test` (Vitest; tests sit next to the code as `*.test.js(x)`) |
| Layout checks (#117) | `cd web && npm run test:layout`: Playwright builds the app with a fake Supabase address and checks every page at 375, 1024 and 1440 px with fake data (`web/e2e/fixtures.js`). First time: `npx playwright install chromium`. On failure, screenshots are in `web/test-results/` |
| Checks on every PR | Automatic: `.github/workflows/checks.yml` runs Go format, vet and tests (with Postgres 16) and the web lint, format check, tests and build, plus the layout checks (#117). A PR shows ✓ or ✗ before merging (#100) |
| Build the web app | `cd web && npm run build`. Each page is its own file, loaded when first opened; React and Supabase have their own files too (#99) |
| Remake the web fonts | After changing a master in `brand/fonts/`: `python3 -m pip install fonttools brotli`, then `python3 scripts/build_fonts.py`. It writes WOFF2 files to `brand/fonts/web/` (Latin, Latin Extended and the rest, so a page downloads only what it uses) and `web/src/fonts.css`. Don't edit either by hand (#99) |
| Build the Docker image | `docker build -t tallyn .` then `docker run -p 8080:8080 --env-file .env tallyn` |
