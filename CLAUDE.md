# CLAUDE.md — Working on Tallyn

Read this first in every session. It tells you where things live, how to write docs, and what not to touch.

## 0. Think before building (read first)

Before building or changing anything (code, docs, design, config, issues), **share your thinking first and wait for Dinesh's OK**:
- **Understanding:** what you think is being asked, and which ticket it belongs to
- **Approach:** what you plan to do and which files or issues you'll touch
- **Alternatives:** other ways to do it, with trade-offs
- **Ideas and improvements:** anything you'd add, simplify or do differently
- **Risks:** security, data, or anything hard to undo

Then stop and wait. Don't start until Dinesh approves (a plan he has already approved in the conversation counts).

**No approval needed for:**
- Read-only steps: reading files, `gh issue list` / `view`, running `scripts/sync_board.py`
- `/i <idea>`: typing the command is the approval. Log the idea and change nothing else
- `/promote <N>`: typing the command is the approval to move the card. Ask before writing a Feature Spec
- Auto-promotion done by `scripts/sync_board.py` (see §5)

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
| `docs/05 Board/Board.md` | Mirror of **Tallyn Board** (committed work) | **No.** It's generated, so never edit it |
| `docs/06 Ideas/Ideas Board.md` | Mirror of **Tallyn Ideas** (idea pipeline) | **No.** It's generated, so never edit it |
| `docs/06 Ideas/` | Longer write-ups of ideas, one note each, with `issue: N` | Yes, for idea detail |
| `.claude/commands/` | Claude Code slash commands (`/i`). Source copies live in `scripts/claude-commands/` | — |
| `docs/07 Log/` | Dated session and decision log | Yes |
| `docs/Templates/` | Note templates. Always start new notes from these | — |
| `cmd/`, `internal/` | Go backend (API + scheduled bank sync) | Code |
| `web/` | React app (Vite) | Code |
| `migrations/` | Supabase SQL schema | Code |
| GitHub Issues + Projects **Tallyn Board** (#1) and **Tallyn Ideas** | All tickets: work on one board, ideas on the other | **Yes, for tracking** |

## 3. Session routine

**At the start:**
1. Read `docs/00 Home.md`, then the notes relevant to the task.
2. If the task touches work tracking, run `python3 scripts/sync_board.py` (needs `gh`) and read `docs/05 Board/Board.md`.
3. Before any visual work (logo, UI, slides, social graphics), read `docs/02 Brand/Brand Guide.md`, `docs/02 Brand/Logo Guide.md`, `docs/03 Design/Design System.md` and `design-tokens.json`.

**At the end:**
1. Add an entry to `docs/07 Log/Log.md`: date, then one line per change starting with its ticket (`- #12 ...`), decisions made and open questions.
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
  issue: 12            # ticket number; issues: [12, 15] for meetings/daily notes
  tags: []
  ---
  ```
- Link notes with `[[Wikilinks]]`. Refer to code and assets by repo path in backticks (`internal/plaid`, `brand/logo/tallyn-mark.svg`).
- Put one concept in each note. If a note runs past ~300 lines, split it and link the parts.
- Note names use Title Case with spaces (`Feature - Joint Accounts.md`). ADRs use `NNNN-kebab-title.md`.
- Never delete a note that others link to. Set `status: deprecated` and link to its replacement.
- Accepted ADRs can't be changed. To reverse one, write a new ADR that supersedes it.
- Use `> [!warning]` and `> [!todo]` callouts for anything a reader must not miss.

## 5. Ticket numbers: every change has one

A **ticket number is the GitHub issue number**, written `#12`. Every piece of work (code, docs, design, logo, config) belongs to a ticket.

**Rule: no ticket, no work.**
1. Before starting a task, find its issue on the board (`gh issue list`, or `docs/05 Board/Board.md`).
2. If there isn't one, create it before changing anything, using the matching form type and labels:
   `gh issue create --title "..." --label "type:feature,area:backend" --body "..."`
   Then tell Dinesh the new number.
3. Small fixes (typos, formatting, renames) go under the pinned **Housekeeping** issue, not a new ticket each time.
4. No exceptions: ideas get a number too, because `/i` creates the issue straight away.

**Where the number goes:**

| Place | Format | Example |
|---|---|---|
| Branch | `<number>-short-name` | `12-plaid-link` |
| Commit message | ends with `(#N)` | `Add Plaid Link token exchange (#12)` |
| Pull request | body includes `Closes #N` | closes the issue when merged |
| Note frontmatter | `issue: N` (one ticket) or `issues: [N, M]` (meetings, daily notes) | `issue: 12` |
| ADR | `Ticket:` line under the status | `- **Ticket:** #12` |
| Log entries | start with the number | `- #12 Added Plaid Link token exchange` |
| Code TODOs | `TODO(#N)` | `// TODO(#12): retry on rate limit` |
| Meeting action items | number after the task | `- [ ] @Dinesh: set up RLS policies (#15)` |

- A commit without `#N` is rejected by `scripts/hooks/commit-msg` (enabled with `git config core.hooksPath scripts/hooks`). Never bypass it with `--no-verify`.
- In note bodies, a bare `#12` isn't clickable (and Obsidian doesn't treat number-only tags as tags). When a link helps, write `[#12](https://github.com/Kolla1997/Tallyn/issues/12)`.
- One ticket covers one outcome. If a task grows, split it into new tickets and link them ("Part of #12").

**Two boards:**

| Board | What's on it | Columns (`Stage`) |
|---|---|---|
| **Tallyn Ideas** | Every `type:idea` issue: things that *might* be built | New → Exploring → Promoted · Parked · Rejected |
| **Tallyn Board** | Committed work: features, bugs, design, docs, tech debt | Backlog → In Progress → Review → Done |

The Ideas board also has **Impact** (High/Medium/Low) and **Effort** (S/M/L) fields for triage.

**From idea to done:**
1. **Capture:** `/i <idea>` in Claude Code (or `scripts/idea.sh "Title"` in Terminal, or the GitHub app's Idea form). It creates a `type:idea` issue on Tallyn Ideas under **New**.
2. **Explore (optional):** write it up in `docs/06 Ideas/` from `Templates/Idea.md` with `issue: N`, and move it to **Exploring**.
3. **Promote:** keep the **same issue number**. Either:
   - drag the card to **Promoted** on Tallyn Ideas, and the next sync moves it automatically, or
   - run `/promote <N> [type]` in Claude Code, or `python3 scripts/promote.py <N> [type]` in Terminal.

   Promotion adds the issue to Tallyn Board under **Backlog**, swaps the label `type:idea` → `type:feature` (or the type given), and comments on the issue with the date. Write a Feature Spec if it's bigger than about a day's work.
4. **Build:** move it to In Progress when work starts and to Review when a PR is open. Merging a PR with `Closes #N` closes it. Then add a Log entry starting with `#N`.
5. **Park or reject** ideas you won't do now, with a one-line reason in a comment. Don't delete them.
6. **Sync:** `python3 scripts/sync_board.py` first auto-promotes cards in **Promoted**, then regenerates both board notes in Obsidian. Edit on GitHub, not in the mirrors. It runs:
   - at the start of every Claude session (§3)
   - after every `/i` and `/promote`
   - whenever Dinesh runs it by hand

   Use `--no-promote` to mirror without moving anything.

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

- Don't start work, commit or open a PR without a ticket number.
- Don't hand-edit `docs/05 Board/Board.md` or `docs/06 Ideas/Ideas Board.md`.
- Don't build or change anything before sharing your thinking and getting an OK (§0).
- Don't commit `.obsidian/workspace*.json`, `.claude/settings.local.json` or secrets.
- Don't invent product facts. If something is unknown, write `> [!todo] Unknown — ask Dinesh` and move on.
