---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-23
issue: 10
tags: [design]
---
# Design System

Token values live in `design-tokens.json` (colour, type, radius, spacing, motion). If this note and the JSON disagree, the JSON wins: fix this note. Ready-made versions are in `brand/colors/` and `brand/typography/`: `tokens.css`, `tailwind.colors.js`, `Colors.swift`, `colors.xml`, `Color.kt`, `type-scale.css`.

## Shape
Soft, friendly, frosted. Cards and the sidebar are frosted glass over a soft glow, with a soft shade underneath (see [[#Glass finish]]).

| Item | Value |
|---|---|
| Card | 22px radius, frosted glass (see Glass finish) |
| Button radius | pill |
| Input radius | 14px |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64px |
| Breakpoints | 640 / 768 / 1024 / 1280 / 1440 |

## Glass finish
Every card in Tallyn ([#61](https://github.com/Kolla1997/Tallyn/issues/61)): `.panel` in the app and `.card` on the sign-in screens. Values live in `design-tokens.json` under `effect`.

| Part | Rule |
|---|---|
| Card | `glass-surface` (white at 70%), `glass-blur` behind it, a 1px `glass-border` edge, the `glass-highlight` top edge and the soft `card-shade` underneath (#64) |
| Sidebar (web) | Floats 12px in from the edges as a rounded glass panel (card radius), same surface and shade as cards (#64). 220px expanded, 60px collapsed with 42px icon buttons. Phones keep the bottom tab bar |
| Secondary text | `text-secondary` #55494A (was #6B5F5C), small labels at weight 500, for easier reading on glass (#64) |
| Page | Cream, with soft glows behind the cards: Sage Light top left, Clay (mixed 45% with Cream) top right, Sand at the bottom, at `glow-opacity` |
| Total balance card | Dark glass: `glass-surface-dark` (Cocoa at 86%) |
| Tiles and chips on cards | Slightly see-through (tiles at 80%); the selected chip stays solid Cocoa |
| Dashed edge | The household and other people: Shared with you (#37), Family and Goals on Home (#72). Your own money keeps the solid edge. Border colour so it shows on glass |
| Stays solid | Confirmation dialogs, inputs, buttons, the debt cards stack. Anything people must read or act on carefully |

**Readability first.** Every text colour must keep AA contrast where the glow is strongest. The 70% card surface was chosen for that: money-in green measures about 4.7:1 there (it was about 4.4:1 at 55%). Check contrast before changing `glass-surface` or the glow.

**Fallbacks.** Cards turn solid white and the glow is hidden when the browser can't blur (`@supports`) or the person asks for reduced transparency (`prefers-reduced-transparency`).

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
> Budgets (#13), empty and error states, and dark mode. Sign-in, 2FA, password reset and recovery are built (#25, #108, #22, #23), as are Home, Transactions, Accounts, Debts, Family and Settings (#39, #42, #27). Adding a bank happens in Plaid's own window.

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-10-08 | Clay Deep (#B04A34) for buttons and small text | Passes AA with white (5.4:1) |
| 2026-10-08 | No shadows, 22px cards, pill buttons | Soft, family-friendly, not bank-like |
| 2026-10-12 | Dashed edge also on Family and Goals on Home, not only Shared with you; your own money stays solid | Dinesh chose option A: groups the household cards together (#72) |
| 2026-10-12 | Spending by day as dots: Sand for no spending, then Clay at 25%, 50%, 75% on white, then Clay Deep; days ahead are a hollow Border ring. No new tokens | Dinesh's idea, only dots with a hover card (#75) |
| 2026-10-12 | Spending dots sit in their own card over the summary, as twelve month blocks (six across on web, four on phones), no labels | Dinesh chose option C: uses the card's full space and reads like a calendar (#75) |
| 2026-10-12 | Credit cards on Home: one bar for the total limit, each card's balance a piece of it in shades of Clay (not Sage, so debt never looks like a good thing), Sand for what's available; due within 5 days is an amber chip, overdue is Error | Dinesh chose option F from six drafts (#27) |
| 2026-10-12 | When filters change: content dims and a thin Clay bar runs along the card top while loading (after 150ms), new content fades in, totals count to their new value; instant switches just fade. See [[Animation Guide]] | Dinesh chose A with count-up numbers from three live drafts (#87) |
| 2026-10-12 | Debts page: a rings card (one ring per kind of debt, You owe in the middle, legend with bars) beside a facts card; one card per debt, two per row on web, with notched gauges (taller rounded notches, label on top: Clay for limit used, Sage for paid off); group totals beside the headings. Debts in the sidebar after Transactions with a receipt icon; on phones in a new ☰ header menu (Debts, Settings, you, Sign out), tab bar unchanged | Dinesh picked rings 1, cards 2, gauge C, icon A and the split top cards from drafts and sketches (#27) |
| 2026-10-12 | Settings rows that open another page are whole-row links with a "›" at the end (first: Legal, with the version underneath); "Coming soon" tags never link to tickets | Dinesh picked A (#36) |
| 2026-10-12 | Phones and tablets: text links have ~44px invisible tap areas, switches and segmented buttons are at least 40px tall; list rows put the amount beside the name and details at full width below, never in a narrow side column | Audit; Dinesh picked A for all four fixes (#97) |
| 2026-10-12 | Sign out after inactivity: a solid "Still there?" dialog with a live countdown over a blurred page (nearly solid cover where blur isn't available or transparency is reduced); afterwards a sage note on the sign-in page, distinct from red errors | Dinesh picked A and note 1 (#91) |
| 2026-10-12 | 2FA code screens: six code boxes (3 + 3) checked at the 6th digit, with paste and phone autofill; the button waits in sand instead of faded clay; "Can't get a code?" and "Use a different account" in a quiet row under a thin line; card centred on the page; "6‑digit" never breaks | Dinesh picked A (#108) |
| 2026-10-12 | Password reset: "Forgot password?" on the Password label's line; "Reset your password" → "Check your email" (same words whether or not the account exists, sage note, "Send another link" after a minute) → the 2FA code with a sage note → "Choose a new password": one field with Show and a live "At least 8 characters" check → Home with a sage note; an expired link gets a calm screen with "Send a new link" | Dinesh picked A (#22) |
| 2026-10-16 | Lost authenticator: Settings keeps its rows ("Two-step sign-in" opens into your named authenticators with Remove and + Add another; "Backup codes" shows how many are left with a small bar and Regenerate); backup codes as a 2×5 grid with Copy, Download and Print, and a tick to continue; recovery from "Can't get a code?" with a "Use a backup code" button | Dinesh picked A (#23) |
| 2026-10-21 | **Budgets** (#13, Dinesh's mix): household budgets are glass tiles with a **pace line** (spending so far, solid, against an even pace, dashed); budgets for one person are rows of **notches**, one per day, today outlined. Green under 80%, amber from 80%, red only once a budget is over. Budgets sits after Transactions in the sidebar and takes Goals' place in the phone tab bar (Goals moves to ☰) | Dinesh picked V3 for the household and V2 for one person. Red for an over-budget is a warning the person set up, not ordinary spending, so the 2026-10-11 "no red for spending" rule still holds |
| 2026-10-16 | Tidier sidebar: double chevrons with no circle around them, « to collapse (E1, replacing the side-panel icon) and » to expand (R3); collapsed, the avatar has no circle around it; menu items 40px, 14px text, 18px icons; profile card 48px with a 28px avatar; sidebar 208px; Terms and Privacy as one quiet line at the bottom of the profile and ☰ menus; **no footer in the signed-in app** (sign-in pages keep theirs) | Dinesh picked P (no circle), A and M2 (#122) |
| 2026-10-11 | Floating rounded glass sidebar, darker secondary text (#55494A) and a soft shade under cards | Dinesh chose option 2: text easier to read on glass (about 6.8:1 at the strongest glow) and more depth (#64) |
| 2026-10-11 | **Cards are frosted glass** over a soft sage, clay and sand glow (replaces "flat white cards" from 2026-10-08; still no drop shadows) | Dinesh chose option B: more depth and a modern feel. Kept readable with a 70% surface, solid dialogs and fallbacks (#61) |
| 2026-10-11 | Compact density on web (1024px+), comfortable on phones; up to 1600px wide; Home in three columns from 1440px | Dinesh: use the screen and show more at a glance; phones keep sizes that are easy to read and tap |
| 2026-10-11 | Spending isn't shown in red; red is only for what you owe | Calm, not alarming: ordinary purchases aren't a warning |
| 2026-10-23 | A page that can't load shows a glass card with Try again; when money is already on screen, it stays under a solid sand banner. Retrying waits in sand (#151) | Dinesh picked D, a mix of the card (B) and the banner (C): never an endless loader, never hide numbers people already have |
