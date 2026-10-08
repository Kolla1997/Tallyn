---
type: guide
status: active
owner: Dinesh
updated: 2026-10-08
tags: [tech]
---

# Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | **Go** | API + scheduled bank sync. Also serves the built React app |
| Frontend | **React** (Vite) | `web/` |
| Database | **Supabase** (PostgreSQL) | RLS on every table |
| Auth | **Supabase Auth** | Email + 2FA |
| Bank data | **Plaid** | Transactions, Liabilities |
| Hosting | **Docker** on Render or Railway | Single deployment. > [!todo] pick one |
| Future | **pgvector** | RAG for the AI assistant |
| CI/CD | GitHub Actions | > [!todo] |

Why each choice was made: add ADRs in `ADR/` as decisions are revisited.
