---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
issues: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
tags: [product, roadmap]
---

# Roadmap

> [!note] Live status is in [[Board]]. This note holds direction, not tickets.

## Now: v1 foundation
- [x] [#5](https://github.com/Kolla1997/Tallyn/issues/5) Repo scaffold: Go server, Vite React app, Dockerfile
- [x] [#6](https://github.com/Kolla1997/Tallyn/issues/6) Supabase schema and RLS (`migrations/`)
- [x] [#7](https://github.com/Kolla1997/Tallyn/issues/7) Auth: email + 2FA (Supabase Auth)
- [x] [#8](https://github.com/Kolla1997/Tallyn/issues/8) Plaid Link + encrypted token storage
- [x] [#9](https://github.com/Kolla1997/Tallyn/issues/9) Scheduled bank sync (Transactions, Liabilities)
- [x] [#10](https://github.com/Kolla1997/Tallyn/issues/10) Brand: logo, `design-tokens.json`

## Next: v1 features
- [ ] [#11](https://github.com/Kolla1997/Tallyn/issues/11) Multi-currency total balance
- [ ] [#12](https://github.com/Kolla1997/Tallyn/issues/12) Joint accounts: member roles and spending limits
- [ ] [#13](https://github.com/Kolla1997/Tallyn/issues/13) Shared budgets and spending categories
- [ ] [#14](https://github.com/Kolla1997/Tallyn/issues/14) Savings goals

## Later
- [ ] [#15](https://github.com/Kolla1997/Tallyn/issues/15) AI assistant (pgvector RAG) (Tallyn Ideas, Parked)

## Shipped
| Date | What | Link |
|---|---|---|
| 2026-10-09 | Bank sync: transactions, balances, spending by category, time and location | [#9](https://github.com/Kolla1997/Tallyn/issues/9) |
| 2026-10-09 | Bank linking: Plaid Link (US), encrypted tokens, unlink that revokes at Plaid | [#8](https://github.com/Kolla1997/Tallyn/issues/8) |
| 2026-10-08 | Auth: email sign-up, authenticator-app 2FA, verified sessions on every API route | [#7](https://github.com/Kolla1997/Tallyn/issues/7) |
| 2026-10-08 | Supabase schema and RLS: households, members, bank data, FX rates, `AsUser` | [#6](https://github.com/Kolla1997/Tallyn/issues/6) |
| 2026-10-08 | Brand and design kit: logo, icons, tokens, fonts, comps, animations | [#10](https://github.com/Kolla1997/Tallyn/issues/10) |
| 2026-10-08 | Repo scaffold: Go server, Vite React app, Dockerfile | [#5](https://github.com/Kolla1997/Tallyn/issues/5) |
