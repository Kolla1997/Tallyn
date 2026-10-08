# Tallyn

**It all adds up.**

Tallyn is a family finance app. Connect bank accounts in any currency, track spending and savings in real time, and open joint accounts for partners, kids and parents.

## Features (v1)

- Connect bank accounts and cards in any currency
- One total balance, converted to your home currency
- Joint accounts with member roles and spending limits
- Shared budgets and spending by category
- Savings goals in any currency

## Tech stack

| Layer | Tool |
|---|---|
| Backend | Go (API + scheduled bank sync) |
| Frontend | React (built with Vite) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + 2FA) |
| Bank data | Plaid (Transactions, Liabilities) |
| Hosting | Docker on Render or Railway |
| Future | pgvector for RAG and an AI assistant |

The Go service serves both the API and the built React app as a single deployment.

## Security

- Plaid access tokens are encrypted by the Go backend before storage
- Row-level security is enabled on every Supabase table
- Only the backend connects to the database
- Secrets live in environment variables, never in the repo

## Project structure

    /cmd/server       Go entry point
    /internal         Go packages (plaid, sync, db, auth, api)
    /web              React app (Vite)
    /migrations       SQL schema for Supabase
    /brand            Logo, icons, style guide
    design-tokens.json
    Dockerfile

## Getting started

1. Copy `.env.example` to `.env` and fill in your keys
2. Run the SQL in `/migrations` on your Supabase project
3. Start the backend: `go run ./cmd/server`
4. Start the frontend: `cd web && npm install && npm run dev`

## Status

In early development. Not yet open to the public.

## License

Copyright © 2026 Tallyn. All rights reserved.
