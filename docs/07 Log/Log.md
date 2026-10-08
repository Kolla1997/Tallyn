---
type: log
status: active
owner: Dinesh
updated: 2026-10-08
tags: [log]
---

# Log

Newest first. One entry per working session or decision.

## 2026-10-08
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
