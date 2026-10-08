---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
issue: 10
tags: [design]
---
# Design System

Token values live in `design-tokens.json` (colour, type, radius, spacing, motion). If this note and the JSON disagree, the JSON wins: fix this note. Ready-made versions are in `brand/colors/` and `brand/typography/`: `tokens.css`, `tailwind.colors.js`, `Colors.swift`, `colors.xml`, `Color.kt`, `type-scale.css`.

## Shape
Flat, soft, friendly. No gradients or shadows.

| Item | Value |
|---|---|
| Card radius | 22px, white, 1px border |
| Button radius | pill |
| Input radius | 14px |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64px |
| Breakpoints | 640 / 768 / 1024 / 1280 |

## Components
* **Primary button:** Clay Deep background, white text, Bricolage Grotesque 700 15px.
* **Secondary button:** 2px Cocoa outline, pill.
* **Dark button:** Cocoa background, Cream text.
* **Account row:** currency symbol circle, name, subtitle, amount in Space Grotesk.
* **Tab bar:** 86px, active item Clay Deep.
* **Progress:** Clay fill on Sand track; Sage for secondary goals.

## Accessibility
AA contrast: 4.5:1 for text under 18.66px bold. Clay with white is 4.4:1 (large text only), so use Clay Deep for buttons and small text. Sage is for graphics only; use Sage Deep for text. Full ratios in `brand/colors/palette.json`.

## Motion
See [[Animation Guide]]. UI transitions are 200 to 300ms, ease-out. Respect reduced motion.

## Reference
Full style guide: `docs/03 Design/Reference/tallyn-style-guide.pdf` (HTML copy alongside). Screens: [[Design Comps]]. Patterns: [[UI Patterns]].

> [!todo] Missing screens
> Sign in, add bank, transactions, budgets, settings, empty and error states, and dark mode.

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-10-08 | Clay Deep (#B04A34) for buttons and small text | Passes AA with white (5.4:1) |
| 2026-10-08 | No shadows, 22px cards, pill buttons | Soft, family-friendly, not bank-like |
