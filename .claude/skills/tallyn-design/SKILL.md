---
name: tallyn-design
description: >-
  How to design, redesign, draft or review any Tallyn screen, card, chart or layout in web/ (React)
  or a design draft. Use before any Tallyn visual work, before design-taste-frontend or hallmark.
  Loads Tallyn's own design rules first, then says how taste-skill and hallmark are used as
  references and checks.
---

# Tallyn design

Tallyn's rules live in the repo docs, not here. This skill only says what to read and in what order (#180).

1. Read `docs/03 Design/Design System.md`, section **Designing a screen**, and follow its four steps in order. When steps disagree, the earlier one wins.
2. Before any visual work, also read what CLAUDE.md §3 lists: `docs/02 Brand/Brand Guide.md`, `docs/02 Brand/Logo Guide.md`, the rest of `docs/03 Design/Design System.md` and `design-tokens.json`.
3. Use `design-taste-frontend` only as that section allows: its app-screen method (`references/app-screens.md`) for content, `library/app.json` for layout ideas, and `scripts/lint.mjs` and `scripts/inspect.mjs --app` with the `--allow` list given there. Never its palettes, fonts, photos, direction deal or `assets.mjs`.
4. Use `hallmark` for its Floor and `sloplint` only (CLAUDE.md §6).
5. Then draft 2–3 options with at least one mix, and wait for Dinesh to pick (CLAUDE.md §0).
