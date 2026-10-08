# CLAUDE.md — Working on Tallyn

Read this first in every session. It tells you where things live, how to write docs, and what not to touch.

## 1. What Tallyn is

**Tallyn is a family finance app. Tagline: "It all adds up."**
People connect bank accounts in any currency, see one total in their home currency, track spending and savings in real time, and open joint accounts for partners, kids and parents. Status: early development, not public.

Full context: `docs/01 Product/Vision.md`.

## 2. Map of the repo

The **repo root is the Obsidian vault**. Notes live in `docs/`. Code folders are hidden from Obsidian (`.obsidian/app.json` → `userIgnoreFilters`).

| Path | What it holds | Source of truth? |
|---|---|---|
| `docs/01 Product/` | Vision, roadmap, feature specs | Yes |
| `docs/02 Brand/` | Brand guide, logo guide, voice and tone | Yes, for brand rules |
| `docs/03 Design/` | Design system and UI patterns | Yes, for design rules |
| `design-tokens.json` | Color, type and spacing values, used by `web/` | **Yes, for token values.** Notes describe them; this file defines them |
| `brand/` | Logo masters, icons, exported assets | Yes, for asset files |
| `docs/04 Tech/` | Architecture, stack, dev setup, ADRs | Yes, for tech decisions |
| `docs/05 Board/Board.md` | Kanban mirror of the GitHub Project | **No.** It's generated, so never edit it |
| `docs/06 Ideas/` | Raw ideas, one note each, before they become issues | Until promoted |
| `docs/07 Log/` | Dated session and decision log | Yes |
| `docs/Templates/` | Note templates. Always start new notes from these | — |
| `cmd/`, `internal/` | Go backend (API + scheduled bank sync) | Code |
| `web/` | React app (Vite) | Code |
| `migrations/` | Supabase SQL schema | Code |
| GitHub Issues + Project "Tallyn Board" | Ideas, bugs, features and design tasks | **Yes, for work tracking** |

## 3. Session routine

**At the start:**
1. Read `docs/00 Home.md`, then the notes relevant to the task.
2. If the task touches work tracking, run `python3 scripts/sync_board.py` (needs `gh`) and read `docs/05 Board/Board.md`.
3. Before any visual work (logo, UI, slides, social graphics), read `docs/02 Brand/Brand Guide.md`, `docs/02 Brand/Logo Guide.md`, `docs/03 Design/Design System.md` and `design-tokens.json`.

**At the end:**
1. Add an entry to `docs/07 Log/Log.md`: date, what changed, decisions made, open questions.
2. Update any note whose facts changed, and bump its `updated:` date.
3. Record decisions: tech decisions get an ADR in `docs/04 Tech/ADR/`; brand and design decisions go in the "Decisions" table of the relevant guide.

## 4. Writing rules for docs

- **Frontmatter on every note:**
  ```yaml
  ---
  type: guide | spec | adr | idea | log | meeting
  status: draft | active | deprecated
  owner: Dinesh
  updated: YYYY-MM-DD
  tags: []
  ---
  ```
- Link notes with `[[Wikilinks]]`. Refer to code and assets by repo path in backticks (`internal/plaid`, `brand/logo/tallyn-mark.svg`).
- Put one concept in each note. If a note runs past ~300 lines, split it and link the parts.
- Note names use Title Case with spaces (`Feature - Joint Accounts.md`). ADRs use `NNNN-kebab-title.md`.
- Never delete a note that others link to. Set `status: deprecated` and link to its replacement.
- Accepted ADRs can't be changed. To reverse one, write a new ADR that supersedes it.
- Use `> [!warning]` and `> [!todo]` callouts for anything a reader must not miss.

## 5. Ideas → Issues → Board

1. **Capture:** quick ideas go in `docs/06 Ideas/` using `Templates/Idea.md` (`status: raw`).
2. **Promote:** once an idea is worth doing, open a GitHub issue with the matching form (Idea / Bug / Feature / Design). Put the issue URL in the note's `issue:` field and set `status: promoted`.
3. **Track:** the issue goes onto the "Tallyn Board" project. The `Stage` field drives the columns: Ideas → Backlog → In Progress → Review → Done.
4. **Mirror:** `scripts/sync_board.py` regenerates `docs/05 Board/Board.md`. Edit on GitHub, not in the mirror.

Labels: `type:*` (idea, bug, feature, design, docs, tech-debt), `area:*` (brand, design, frontend, backend, infra), `priority:*` (p0, p1, p2). Full list: `scripts/github/labels.yml` (copied to `.github/` by `setup_github.sh`).

## 6. Brand and design guardrails

- Use only values from `design-tokens.json`. If one is missing, propose it in `docs/03 Design/Design System.md` first.
- Use the logo only as described in `docs/02 Brand/Logo Guide.md`, from the files in `brand/logo/`. Never redraw, recolor or stretch it.
- Write copy in the voice set out in `docs/02 Brand/Voice and Tone.md`. This is a money app for families, so be clear and calm, never pushy.

## 7. Security rules (finance app)

- Never commit secrets, `.env` files, Plaid tokens or real account data, including in docs and examples. Use obviously fake data.
- Plaid access tokens are encrypted by the Go backend before storage.
- Row-level security is on for every Supabase table. Every new table needs RLS policies in its migration.
- Only the backend talks to the database. The React app never uses Supabase service keys.

## 8. Don'ts

- Don't hand-edit `docs/05 Board/Board.md`.
- Don't commit `.obsidian/workspace*.json`, `.claude/settings.local.json` or secrets.
- Don't invent product facts. If something is unknown, write `> [!todo] Unknown — ask Dinesh` and move on.
