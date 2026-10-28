---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-26
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

## Numbers
Every dynamic number in the app uses **tabular figures**, so a layout doesn't shift as digits change (#193). This covers live prices, financial tables, counters, timers, and any number that updates while you watch.

- **Money and counters:** the shared `.money` and `.count` classes, `.amount`, `Money` (`components/calm/ui.jsx`) and `CountUp` set `font-variant-numeric: tabular-nums` on their own. Use them for any money value or counter.
- **Anything else that updates:** add Tailwind `tabular-nums` (CSS `font-variant-numeric: tabular-nums`).
- **Design files:** in Figma, Text → Type settings → Details → Numbers → Monospace. Tabular figures keep the font's own shapes, so Space Grotesk stays Space Grotesk.
- **Native apps (not built yet):** SwiftUI `.monospacedDigit()`; Android `android:fontFeatureSettings="tnum"`.
- **Not covered:** figures inside a sentence ("You've saved £40 of £200") stay as they are. They don't count, so the layout doesn't shift from them.

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

## Designing a screen
How to design or redesign any Tallyn screen ([#180](https://github.com/Kolla1997/Tallyn/issues/180)). It borrows the app-screen method from taste-skill (`.claude/skills/design-taste-frontend/`, `references/app-screens.md`) but keeps Tallyn's look. Follow the steps in order; when they disagree, the earlier step wins.

**1. Tallyn decides the look.** Colours, type, spacing and shape come from `design-tokens.json`, this note (glass finish, density, components), the [[Brand Guide]], the [[Logo Guide]], [[Voice and Tone]] and [[UI Patterns]]. Nothing from an outside skill changes them.

**2. Plan the content before drawing.** These come from taste-skill and suit a money app:

| Step | What it means in Tallyn |
|---|---|
| Know the data and the people | List what the screen shows (accounts, transactions, budgets, goals), with realistic amounts and currencies, and who opens it: you, a partner, a parent, a teen |
| One question per screen | Name the question the screen answers ("Are we on track this month?"). The biggest block answers it; everything else supports it or moves elsewhere |
| Honest numbers | Totals add up from the rounded amounts shown. A fact shown twice (a total, a date range) comes from one value. Every relative figure says what it's compared with ("£40 less than last month") |
| The main job is one click away | Name the most frequent next step (add a goal, check a budget, invite a partner) and put it within reach |
| Every state | Design the empty, loading and error states with the screen, following [[UI Patterns]] and the 2026-10-23 load-error decision below |
| One colour for the data that matters | The main data gets one chart colour, the rest stay neutral; status colours keep their meaning (red only for what you owe or an over-budget) |
| People stay themselves | Each family member keeps the same initial and tint everywhere |

**3. Outside layouts are references only.** When drafting options, taste-skill's `library/app.json` shells and patterns can suggest structure. Dress every option in Tallyn's glass and tokens. Its palettes, fonts, photos, section blueprints and direction deal (`draw.mjs`, `scenes.mjs`) stay off, and `assets.mjs` is never run.

**4. Check the draft.** Run both, then fix what they find before showing Dinesh:
- `node .claude/skills/design-taste-frontend/scripts/lint.mjs <files>` on the source.
- `node .claude/skills/design-taste-frontend/scripts/inspect.mjs <url> --app --allow glass,gradient,shadow,heavy-shadow,button-fx,palette-terracotta,palette-cream` on the built page (`npm run build && npm run preview` in `web/`, not the dev server). Needs Node 22+ and Chrome.
- Hallmark's Floor and `sloplint` (CLAUDE.md §6).

> [!warning] Rules that clash with Tallyn
> The `--allow` list above turns off the inspector's rules against the glass finish (#61), the soft glow and card shade, and Tallyn's Clay and Cream palette. Never remove glass, glow or Clay because a check flagged it. Everything else it reports (contrast, cut-off or covered text, sideways scroll, tiny text, number alignment, tabular figures, chart colours, placeholder data) is worth fixing.

Then draft 2–3 options with at least one mix, as CLAUDE.md §0 asks.

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
| 2026-10-24 | Plan from your income reads answer first (a sentence), then the logic (a labelled split bar), then the data (a plain bar and words per job). No chart key to learn (#133) | Dinesh picked 3A: people look for the logic first, then the numbers; the waffle, flow, bullet, treemap and waterfall drafts read slower |
| 2026-10-24 | Goals: "This month" checklist on top, goals as glass pots that fill, and one goal up close as a forecast with its next milestone (#14) | Dinesh picked the mix of draft 2, part by part: each part answers a different question (what to do this month; how are my goals; will this one make it) |
| 2026-10-24 | Month fields: a field in words ("June 2027 · 8 months away") opening quick picks (No date, 6 months, 1 year, 2 years) over a year-by-year month grid; past months off (`web/src/components/MonthPicker.jsx`, #14) | Dinesh picked the mix of the month draft (`docs/03 Design/Comps/web-goals-month-draft.html`): the browser's month box looks different everywhere and offers days a goal doesn't need |
| 2026-10-24 | Screens are designed by [[#Designing a screen]]: Tallyn's look first, then taste-skill's app-screen method for content, its layouts as references only, and its checks with the glass, glow and palette rules allowed (#180) | Dinesh: use taste-skill as a reference while the Tallyn design doc stays in charge; layered, not merged, so the pinned copy stays unchanged |
| 2026-10-25 | Calm redesign, drafted for every screen in the draft lab (`web/src/lab/calm/`, #185): red, green, white and black, red for the one action and what's owed, green for money in and progress; cards are plain white or near-black, no glass. **Applies to the app only when the redesign is built**; until then the rules above stand | Dinesh: the bold drafts were overwhelming, he likes the calm approach |
| 2026-10-25 | Redesign sizes: one 1280px content width on every page, centred; body 14px, small 13px, names 15px, figures 22px, page titles 24px; buttons 13px text with 14px icons; rows and cards a little roomier (#185). Replaces the compact column of [[#App type and density]] when built | Dinesh asked for "one size smaller" (size C), then one step up everywhere, then less empty space at the sides; one width keeps pages lined up (Hallmark Floor 14) |
| 2026-10-25 | Redesign sidebar: the rail is collapsed by default (icon names on hover and keyboard focus, » opens it); menu text 13px; rows 34px (32px items, 2px apart). Replaces the 40px items and 14px text of 2026-10-16 when built (#185) | Dinesh picked the rail over a labelled rail and a top bar, then asked for smaller text and less space |
| 2026-10-25 | Redesign layouts (#185): lists are rows in one card, never one stretched card per item. Debts: a summary strip (waffle for cards vs loans, four figures) over a table with bullet bars (Dinesh picked F, the mix). Accounts: the same strip with Bklit rings for what you have, then one card per bank holding its accounts as tiles, each card as wide as its accounts (picked F, the bank bento, a mix of "by bank" and "tiles") | Single items stretched edge to edge read huge; banks listed once where their accounts are |
| 2026-10-25 | Redesign charts (#185): spending by day as one red bar per day with a daily average line and three facts (picked the mix of four forms); spending reads in a red scale, empty days grey; numbers always written beside the marks | Dinesh asked for red instead of black, then for less wasted space; ui-ux-pro-max: never colour alone |
| 2026-10-26 | Light and dark (#187): the drafts' dark theme in the app, switched with the sun and moon (in the rail, the phone header and the sign-in footer); follows the device until you choose. Dark values live beside the light ones in `design-tokens.json` (`dark`). Avatars use colours that keep white letters readable in both | Dinesh picked the sun and moon switch in the drafts; the first build left dark out by mistake |
| 2026-10-28 | Tabular figures (#193): every dynamic number uses tabular figures: money and counters through `.money`, `.count`, `.amount`, `Money` and `CountUp`, anything else with `tabular-nums`. Figma: Numbers → Monospace; SwiftUI `.monospacedDigit()`; Android `tnum` | Dinesh picked C: a global rule for money and counters, with an opt-in class for the rest; scoped to Tallyn |
