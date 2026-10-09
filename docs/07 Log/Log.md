---
type: log
status: active
owner: Dinesh
updated: 2026-10-08
tags: [log]
---

# Log

Newest first. One entry per working session or decision.

## 2026-10-09
- #8 Merged PR #26, so #8 is closed. Moved it to Done by hand (the board's close → Done workflow still doesn't fire). Ticked in [[Roadmap]].

## 2026-10-08
- #8 End-to-end test passed in Plaid sandbox on `tallyn-dev`: created a household, linked First Platypus Bank (14 accounts, balances correct), token stored encrypted (version 1, 80 bytes, no readable token text), unlink revoked at Plaid and removed the bank, accounts and transactions. Fixed: Unlink used `window.confirm`, which the embedded browser silently answers "no", so it did nothing; the confirmation is now shown in the page.
- #8 Bank linking on branch `8-plaid-link`: Plaid Link (US only, Transactions only), public token exchange, accounts with balances in exact minor units, unlink that revokes at Plaid (`/item/remove`) before deleting our copy. If saving a new link fails, the item is revoked at Plaid straight away.
- #8 `internal/tokencrypt`: AES-256-GCM with `TOKEN_ENCRYPTION_KEY`, fresh nonce, Plaid item ID bound in, version byte. `internal/plaid`: small hand-written client (credentials in headers, no bodies in errors). `internal/money`: exact decimal → minor units.
- #8 `0004_plaid_link.sql`: `link_plaid_item` and `plaid_item_for_unlink`, `security definer` with fixed `search_path`, role checks inside the database, owner always `auth.uid()`. `POST /api/households`, `POST /api/plaid/link-token`, `POST /api/plaid/exchange`, `GET /api/banks`, `DELETE /api/banks/{id}`.
- #8 Web: create household, Link a bank (`react-plaid-link`), banks and accounts list, unlink with confirmation.
- #8 Added [[Feature - Bank Linking]] and ADR [[0004-plaid-token-encryption-and-link-path]] (Proposed). Updated Data Model, Architecture, Dev Setup, `.env.example` (`PLAID_REDIRECT_URI`), migrations README.
- Decision (security-first): owners and adults link, only for themselves; teens and children can't. US only. Transactions only; never `auth`. Unlinking pulled into #8 so tokens are really revoked.
- Open: end-to-end in Plaid sandbox; `TOKEN_ENCRYPTION_KEY` to a KMS before launch; OAuth redirect URI for production; audit log of link/unlink; #24 must allow `cdn.plaid.com`.
- #7 Merged PR #21, so #7 is closed. Moved it to Done by hand (the board's close → Done workflow still doesn't fire). Ticked in [[Roadmap]].
- #7 End-to-end test passed on the `tallyn-dev` Supabase project: sign-up, email confirmation, authenticator-app 2FA (Microsoft Authenticator), `/api/me` through `AsUser` and RLS. The account was created before the migrations ran, so its profile row was added by hand (the sign-up trigger only covers new users). Fixed the home screen calling `/api/me` four times per load.
- #7 Started auth on branch `7-supabase-auth`. `internal/auth` checks Supabase access tokens on every `/api/` route except `/api/health`: signature against the project's public keys (JWKS, ES256/RS256), expiry, issuer, audience, role, and 2FA (`aal2`). Fails closed: `401` for anything wrong, `503` if auth or the database isn't configured. New `/api/` routes are protected by default.
- #7 `GET /api/me` returns the profile and households through `AsUser`. `main.go` now opens the database.
- #7 Web: `supabase-js` sign-in, email confirmation, authenticator-app 2FA set-up and code entry, and a placeholder home showing `/api/me`. Bare-bones screens that read `design-tokens.json` directly.
- #7 Added [[Feature - Auth]] and ADR [[0003-browser-sign-in-with-supabase-js]] (Proposed). Updated Architecture, Dev Setup (Supabase Auth settings, Node version), `.env.example` (dropped `SUPABASE_JWT_SECRET`) and `web/.env.example`.
- Decision: the browser signs in with `supabase-js` and sends a Bearer token; Go verifies it (option A over Go-held cookie sessions). 2FA is TOTP (any authenticator app, including Microsoft Authenticator; free on Supabase). SMS isn't used (paid add-on).
- Decision (default, can change in #12): 2FA is required for everyone, kids' logins included.
- Open: end-to-end test on a dev Supabase project; password reset and lost-authenticator recovery need tickets; Content-Security-Policy header; styled sign-in screens; brand fonts not loaded in `web/` yet. `keyfunc` pinned to v3.8.0 because newer versions need Go 1.25. Local `node` (20.11) is too old for Vite 8; nvm's 20.20 works.
- #6 Schema and RLS on branch `6-schema-rls`: migrations `0001_households.sql` (profiles, households, members with roles owner/adult/teen/child/viewer, `create_household()`, at-least-one-owner rule), `0002_bank.sql` (plaid_items with encrypted token, accounts, transactions; money as bigint minor units) and `0003_fx_rates.sql`. RLS on every table.
- #6 `internal/db`: pgx pool, `Ping`, and `AsUser` which runs each request as the `authenticated` role with the user's ID, so RLS applies. Integration tests cover cross-household isolation, kids seeing only their own accounts, the unreadable token column, blocked writes and no identity leaking between pooled connections.
- #6 Added [[Feature - Data Model]] and ADR [[0002-backend-database-access]] (Proposed).
- Decision: the table is `households` (not `families`). One person can be in several households. Kids get their own logins. Money is whole minor units in bigint plus a currency code.
- Decision (pending ADR acceptance): the backend no longer uses the service role for database access. Bank sync writes go through a separate system path (#8, #9).
- #6 Added `go.sum` for pgx. Opened PR #20.
- #6 Schema/RLS tests all pass on Postgres 16 (5 tests, 24 subtests). Merged PR #20, so #6 is closed. Moved it to Done by hand: the board's "Item closed → Done" workflow still doesn't fire.
- Open: local Go is 1.21.3 and `go.mod` says `go 1.24`, so Go commands need `GOTOOLCHAIN=go1.24.0` until `go.mod` says `go 1.24.0` or Go is upgraded. Another Postgres 16 (`/Library/PostgreSQL/16`) holds port 5432 on Dinesh's Mac, so the test Postgres runs on 5434 with `LC_ALL` set (steps in PR #20).
- Open: Teens and shared totals, invitations (#12), FX rate source (#11). Not yet tried on a real Supabase project.
- #10 Added brand and design kit: logo files (SVG and PNG), app icons, social and splash images, colour and type tokens (`design-tokens.json`), fonts, style guide, six app screen comps, website comp, animations (Lottie, SVG, GIF, MP4).
- #10 Added notes: Animation Guide, Design Comps. Replaced Brand Guide, Logo Guide, Voice and Tone and Design System with the kit versions, keeping the communications checklist, the name rule, the tagline decision, breakpoints and the "JSON wins" rule.
- #10 Decided: Sage & Clay palette, Jedira wordmark (outlined), Space Grotesk / Montserrat / Bricolage Grotesque, Clay Deep for buttons and small text.
- Open: Jedira licence for logo and commercial use; OFL licence texts to ship with `brand/fonts/`; missing screens (sign in, add bank, transactions, budgets, settings, empty and error states); app dark mode; Lottie device testing; wiring tokens into `web/` (`web/src/App.jsx` waits on #10).
- #5 Repo scaffold: Go server (`cmd/server`, stdlib only) with `GET /api/health` and the React app served from `web/dist` with SPA fallback, plus tests. Empty packages with `TODO(#N)` for `internal/auth` (#7), `db` (#6), `plaid` (#8) and `sync` (#9). Vite + React app in `web/` (proxies `/api` in dev), multi-stage `Dockerfile`, `.env.example` with fake values, and `migrations/` with the RLS rule.
- #16 Fast-forwarded local `main` to `16-board-sync-action`, so the sync Action is on `main` once it's pushed.
- Decision: the frontend starts in plain JavaScript (JSX). No styling until `design-tokens.json` lands (#10).
- Open: TypeScript for `web/`? Go router (stdlib for now)? Frontend linting and CI (GitHub Actions) are still to do.
- #16 Board sync is automated: the GitHub Action `sync-board.yml` runs `sync_board.py` hourly, on issue changes and on demand, and commits changed mirrors as `Sync board mirrors (#1)`. `sync_board.py` skips rewrites that would only change the date stamp.
- Decision: automated mirror commits go under Housekeeping #1, not #16, because they're ongoing upkeep.
- Open: Dinesh to add the `BOARD_TOKEN` repo secret (classic PAT, `repo` + `project`). The Action fails with a clear error until then.
- #1 Tallyn Board has a new **Blocked** column (added on GitHub). `sync_board.py` now mirrors it and warns about any Stage it doesn't know instead of quietly showing the card under Backlog. Updated `setup_github.sh` and CLAUDE.md to match.
- #1 Added the `blocker` label (red) for tickets that can't move. It's a label, not a column, so blocked tickets keep their Stage. Backlog stays as is.
- #1 Filled Tallyn Board from the Roadmap: #5–#10 (Now, p0) and #11–#14 (Next, p1/p2) in Backlog. Each has Problem, Definition of done and related docs. Numbers added to [[Roadmap]].
- #15 AI assistant (Roadmap "Later") logged on Tallyn Ideas as Parked, not on Tallyn Board.
- #1 Reopened Housekeeping (PR #3 had closed it) and set it to In Progress. PRs under it should say `Part of #1`, not `Closes #1`.
- #4 Tested `/i` → `/promote` end to end: board, label swap, comment and Ideas Stage all passed. Closed as a test.
- Decision: priorities follow the roadmap horizon (Now p0, Next p1, savings goals p2). One area label per issue.
- Open: closed #4 stayed in Backlog on Tallyn Board. Check the "Item closed → Done" workflow. Unknowns in the issues: data model, sync frequency, FX rate source, member roles, logo concept.
- #1 Auto-promotion: ideas dragged to Promoted move to Tallyn Board (Backlog) on the next sync, with a `type:idea` → `type:feature` label swap and an issue comment. Added `/promote <N>` and `scripts/promote.py`. `/i` and `/promote` now sync automatically.
- #1 Added Housekeeping to Tallyn Board under Backlog and re-synced both board mirrors.
- #2 Tested `/i` end to end. The test idea landed only on Tallyn Ideas (New), not on Tallyn Board. Closed as not planned.
- Rule: think before building. Claude shares its understanding, approach, alternatives, improvements and risks, then waits for an OK (`CLAUDE.md` §0).
- Added a separate **Tallyn Ideas** board (New → Exploring → Promoted / Parked / Rejected) and the `/i <idea>` command. Tallyn Board now holds committed work only.
- Rule: every change has a ticket number (GitHub issue `#N`) in its branch, commits, PR, notes and Log. A commit-msg hook enforces it (`CLAUDE.md` §5).
- Set up docs in `docs/` (repo root is the Obsidian vault), `CLAUDE.md`, GitHub issue forms, labels and board scripts.
- Filled Vision, Roadmap, Tech Stack, Architecture and Dev Setup from the README.
- Decision: GitHub Issues + Project "Tallyn Board" are the source of truth for work. `05 Board/Board.md` is a generated mirror.
- Decision: `design-tokens.json` holds token values and `brand/` holds logo files. Docs explain how to use them.
- Open: personas, logo concept, token values, hosting choice (Render vs Railway).
