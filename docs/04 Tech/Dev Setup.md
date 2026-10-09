---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
issues: [5, 6, 7]
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

## Supabase Auth settings (#7)
In the Supabase dashboard, for each project (dev and prod). See [[Feature - Auth]].
- Auth → Providers → Email: on, with **Confirm email** on
- Auth → Multi-Factor: **TOTP** on (free, on by default). Leave phone MFA off (paid add-on)
- Auth → URL configuration: add `http://localhost:5173` (dev) and the prod URL to redirect URLs
- Project Settings → JWT signing keys: use an asymmetric key (ES256). The Go server reads the public keys from JWKS
- API → Data API: turn it off, or remove `public` from exposed schemas. Only the backend talks to the database

To try the single-deployment setup: `cd web && npm run build`, then `go run ./cmd/server` serves the built app from `web/dist`.

## Common tasks
| Task | Command |
|---|---|
| Sync board into docs | Automatic (hourly GitHub Action, `git pull` to get it). By hand: `python3 scripts/sync_board.py` |
| Test | `go test ./...` (database tests skip unless `TALLYN_TEST_DATABASE_URL` is set) |
| Test the schema and RLS | Start a throwaway Postgres: `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16`, then `TALLYN_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres go test ./internal/db`. Without Docker, Homebrew `postgresql@16` works too (steps in [PR #20](https://github.com/Kolla1997/Tallyn/pull/20)) |
| Lint | `go vet ./...` (frontend lint: > [!todo]) |
| Build the web app | `cd web && npm run build` |
| Build the Docker image | `docker build -t tallyn .` then `docker run -p 8080:8080 --env-file .env tallyn` |
