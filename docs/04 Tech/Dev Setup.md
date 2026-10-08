---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
issue: 5
tags: [tech, onboarding]
---

# Dev Setup

## Prerequisites
Go 1.24+, Node 22+ and npm, a Supabase project, Plaid sandbox keys. Docker is optional (for the production image).

## Run locally
1. Copy `.env.example` to `.env` and fill in your keys
2. Run the SQL in `migrations/` on your Supabase project
3. Backend: `go run ./cmd/server` (API on http://localhost:8080, check `/api/health`)
4. Frontend: `cd web && npm install && npm run dev` (Vite forwards `/api` to the Go server)

To try the single-deployment setup: `cd web && npm run build`, then `go run ./cmd/server` serves the built app from `web/dist`.

## Common tasks
| Task | Command |
|---|---|
| Sync board into docs | Automatic (hourly GitHub Action, `git pull` to get it). By hand: `python3 scripts/sync_board.py` |
| Test | `go test ./...` |
| Lint | `go vet ./...` (frontend lint: > [!todo]) |
| Build the web app | `cd web && npm run build` |
| Build the Docker image | `docker build -t tallyn .` then `docker run -p 8080:8080 --env-file .env tallyn` |
