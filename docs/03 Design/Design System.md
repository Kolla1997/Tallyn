---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-11
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
| Breakpoints | 640 / 768 / 1024 / 1280 / 1440 |

## App type and density
The web app uses two densities ([#39](https://github.com/Kolla1997/Tallyn/issues/39)). Phones (under 1024px) stay **comfortable** for reading and tapping. From 1024px the app is **compact**, so more fits at a glance. `brand/typography/type-scale.css` is the brand and marketing scale; this table is for app screens.

| Item | Phone (comfortable) | Web, 1024px and up (compact) |
|---|---|---|
| Page title | 28px | 24px |
| Card title | 18–22px | 16px |
| Body and rows | 16px | 14px |
| Small text, chips | 13px | 12px |
| Total balance | 36px | 36px |
| Card padding / gap between cards | 24px / 24px | 16px / 16px |
| Row icons / spacing | 40px / 12px | 32px / 8px |

Layout: content up to 1600px wide, centred beyond that. Home is one column under 1280px, two from 1280px, three from 1440px. Long lists (Transactions) cap at 1000px so lines stay readable.

## Components
* **Primary button:** Clay Deep background, white text, Bricolage Grotesque 700 15px.
* **Secondary button:** 2px Cocoa outline, pill.
* **Dark button:** Cocoa background, Cream text.
* **Account row:** account-type icon (sage for money you have, clay for money you owe), name, bank and last four digits, amount in Space Grotesk.
* **Transaction row:** merchant logo or category icon, name, date and category, amount: money out in plain text, money in green.
* **Tab bar:** 86px, active item Clay Deep.
* **Progress:** Clay fill on Sand track; Sage for secondary goals.

## Accessibility
AA contrast: 4.5:1 for text under 18.66px bold. Clay with white is 4.4:1 (large text only), so use Clay Deep for buttons and small text. Sage is for graphics only; use Sage Deep for text. Full ratios in `brand/colors/palette.json`.

## Motion
See [[Animation Guide]]. UI transitions are 200 to 300ms, ease-out. Respect reduced motion.

## Reference
Full style guide: `docs/03 Design/Reference/tallyn-style-guide.pdf` (HTML copy alongside). Screens: [[Design Comps]]. Patterns: [[UI Patterns]].

> [!todo] Missing screens
> Sign in (#25), add bank, budgets, empty and error states, and dark mode. Transactions, Accounts, Family and Settings are built (#39, #42).

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-10-08 | Clay Deep (#B04A34) for buttons and small text | Passes AA with white (5.4:1) |
| 2026-10-08 | No shadows, 22px cards, pill buttons | Soft, family-friendly, not bank-like |
| 2026-10-11 | Compact density on web (1024px+), comfortable on phones; up to 1600px wide; Home in three columns from 1440px | Dinesh: use the screen and show more at a glance; phones keep sizes that are easy to read and tap |
| 2026-10-11 | Spending isn't shown in red; red is only for what you owe | Calm, not alarming: ordinary purchases aren't a warning |
