---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-26
issue: 187
tags: [adr, frontend, design]
---

# 0017 — The calm redesign in the app: Tailwind without its reset, the lab's libraries

- **Status:** Proposed
- **Date:** 2026-10-25
- **Ticket:** #187
- **Supersedes:** [[0016-ui-libraries-in-a-draft-lab]] (its "separate decision" for real screens)

## Context
Dinesh approved the calm drafts of every screen (#185) and asked for them in the app, with the glass finish's Mix option. The drafts are written with Tailwind classes and use Bklit charts, free Kokonut UI and anime.js, which ADR 0016 keeps in the draft lab. The app's screens use `src/styles.css` (about 5,000 lines).

## Options considered
- **A. Bring Tailwind and the libraries into the app** (chosen by Dinesh, 2026-10-25). Closest to the approved drafts, quickest to build.
- **B. Rebuild the look in plain CSS.** No new dependencies, but slower, and the charts would be redrawn by hand and differ from the drafts.

## Decision
Option A, one screen at a time (#187).

- `src/app.css` loads Tailwind's theme and utilities **without preflight** (its base reset), so screens that haven't moved yet keep their look. Imported after `styles.css` in `main.jsx`.
- Colours, fonts and glass values for the redesign live in `design-tokens.json` (`color.redesign-*`, `effect.redesign-*`) and reach the page as CSS variables through `applyTokens`. Tailwind classes use those variables (`bg-[var(--color-redesign-accent)]`) or the zinc scale for neutrals; no other literal colours.
- Glass is the Mix option: glows behind the page; the sidebar and summary cards frosted; cards that hold a list or a table stay solid. Solid again without blur support or with reduced transparency.
- Bklit, Kokonut and anime.js are imported by screens as needed (`@/components/...`); they're added with the shadcn CLI, as in 0016.
- Each screen's old CSS is removed in the PR that moves it.

## Consequences
- The app's CSS grows by Tailwind's utilities for the classes in use; old rules shrink as screens move.
- Until every screen has moved, old and new screens sit side by side under the new shell.
- The Clay/Cream palette and the glass rules in the Design System are replaced as screens move; the brand guide keeps the logo and fonts.
- Light and dark, as in the drafts (Dinesh picked the sun and moon switch): `src/lib/theme.js` puts a `dark` class on `<html>` and applies each redesign token's `dark` value from `design-tokens.json`; screens carry the drafts' `dark:` classes. Your choice is kept on the device; until you choose, Tallyn follows the device's setting.
