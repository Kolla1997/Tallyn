---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-25
issue: 183
tags: [adr, frontend, design]
---

# 0016 — UI libraries for drafts: Tailwind, shadcn, Bklit, Kokonut UI and anime.js

- **Status:** Proposed
- **Date:** 2026-10-25
- **Ticket:** #183

## Context
Dinesh wants fresh Home drafts (#182) built with taste-skill's full app-screen run, plus Bklit UI charts, Kokonut UI components and anime.js. Bklit and Kokonut are shadcn registries, so they need Tailwind and shadcn. `web/` is plain React + Vite + JavaScript with a hand-written `src/styles.css` (about 5,000 lines) and no Tailwind.

## Options considered
- **A. A separate design-lab project.** Keeps `web/` untouched, but drafts can't reuse the app's code.
- **B. Into `web/`, scoped to a draft entry** (chosen by Dinesh, 2026-10-25).
- **C. Into `web/` app-wide.** Tailwind's base styles would reset the existing stylesheet and change every screen.

## Decision
Option B.

- Tailwind v4 via `@tailwindcss/vite`. It only styles files that import it: `src/lab/lab.css`, loaded by `web/lab.html` (`npm run dev`, then `/lab.html`). The build only includes `index.html`, so the lab never ships and the app's CSS has no Tailwind in it.
- shadcn config in `web/components.json` (JavaScript, no TypeScript), `@` → `src` alias in `vite.config.js` and `jsconfig.json`.
- Registries: `@bklit` (`https://bklit.com/r/{name}.json`) and the free `@kokonutui` (`https://kokonutui.com/r/{name}.json`). No Kokonut UI Pro, no keys.
- Components are added with `npx shadcn@latest add @bklit/<name>` or `@kokonutui/<name>`, never pasted. They land in `src/components/charts/` and `src/components/kokonutui/`, are third-party code (lint ignores them) and are updated with the CLI.
- anime.js v4 (`animejs`) for feedback motion only: press, hover, a row arriving. taste-skill allows no entrance motion on app screens.
- Agent rules for these libraries live in `web/AGENTS.md`, not CLAUDE.md.

## Consequences
- New runtime packages in `web/package.json`: visx, d3-array, d3-shape, motion, @number-flow/react, animejs, clsx, tailwind-merge, class-variance-authority. They only load in the lab until a screen imports them.
- npm 10 (Node 20 and 22) hits an `edgesOut` bug resolving `@tailwindcss/vite`; it was added with npm 11 (`npx npm@11 i`). `npm ci` on Node 20 reads the lockfile fine.
- Using any of this in a real screen is a separate decision: it needs a ticket, and either Tailwind without its base reset or a component restyled to Tallyn's tokens.
