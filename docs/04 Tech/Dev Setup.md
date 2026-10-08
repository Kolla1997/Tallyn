---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
tags: [tech, onboarding]
---

# Dev Setup

## Prerequisites
Go, Node + npm, a Supabase project, Plaid sandbox keys.

## Run locally
1. Copy `.env.example` to `.env` and fill in your keys
2. Run the SQL in `migrations/` on your Supabase project
3. Backend: `go run ./cmd/server`
4. Frontend: `cd web && npm install && npm run dev`

## Common tasks
| Task | Command |
|---|---|
| Sync board into docs | `python3 scripts/sync_board.py` |
| Test | > [!todo] |
| Lint | > [!todo] |
