---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
issues: [6, 7]
tags: [tech, architecture]
---

# Architecture

## Overview
```mermaid
flowchart LR
  U[User browser] -->|HTTPS| G[Go server<br/>API + static React]
  G -->|SQL as the user| DB[(Supabase Postgres<br/>RLS on)]
  G -->|Auth| SA[Supabase Auth<br/>email + 2FA]
  G -->|Link, Transactions, Liabilities| P[Plaid]
  S[Scheduled sync<br/>in Go service] --> P
  S --> DB
```

One Go service, one deployment: it serves the API and the built React app (`web/dist`).

## Components
| Component | Responsibility | Path |
|---|---|---|
| Server entry | Boot, routing, static files | `cmd/server` |
| plaid | Plaid client, Link token exchange | `internal/plaid` |
| sync | Scheduled account and transaction sync | `internal/sync` |
| db | Database access | `internal/db` |
| auth | Verify Supabase sessions and require 2FA (roles are enforced by RLS) | `internal/auth` |
| api | HTTP handlers | `internal/api` |
| Web app | React UI | `web/` |
| Schema | SQL migrations | `migrations/` |

## Data model (draft)
profiles, households, household_members (with roles), plaid_items, accounts, transactions and fx_rates. Tables, roles and rules: [[Feature - Data Model]]. Budgets, categories and goals come with #13 and #14.

The backend runs each request as the signed-in user so RLS applies: [[0002-backend-database-access]].

## Sign-in
The React app signs in with `supabase-js` (publishable key only) and sends the access token to the API as `Authorization: Bearer`. `internal/auth` checks the signature against Supabase's public keys (JWKS), the expiry, issuer, audience and role, and requires 2FA (`aal2`) on every `/api/` route except `/api/health`. The verified user ID goes to `AsUser`. Details: [[Feature - Auth]], [[0003-browser-sign-in-with-supabase-js]].

## Security
- Plaid access tokens are **encrypted by the Go backend** before they're stored
- **RLS on every Supabase table**
- Only the backend connects to the database, and it runs user requests as the user (`internal/db` `AsUser`), not as the service role
- Every `/api/` route needs a verified Supabase session with 2FA; new routes are protected by default
- Secrets live in environment variables, never in the repo

## Environments
| Env | URL | Deploys from |
|---|---|---|
| Local | localhost | — |
| Prod | > [!todo] | `main` |

Decisions: `04 Tech/ADR/`.
