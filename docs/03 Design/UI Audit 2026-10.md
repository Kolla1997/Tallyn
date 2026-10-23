---
type: guide
status: active
owner: Dinesh
updated: 2026-10-23
issue: 145
tags: [audit, accessibility, motion, design]
---

# UI Audit 2026-10

## Purpose
A one-off audit of every screen and component in `web/` using the outside skills from [#141](https://github.com/Kolla1997/Tallyn/issues/141), for [#145](https://github.com/Kolla1997/Tallyn/issues/145). It records what's wrong and proposes follow-up tickets; it changes no code. Fixes go in their own tickets, and anything people will see gets a draft first (CLAUDE.md §0).

**How it was done (2026-10-23)**
- Four read-only code audits, one per area: sign-in and onboarding, money screens and charts, family/settings/shell, app-wide CSS.
- Skills: emil-design-eng, review-animations, improve-animations, animation-performance, break-ui (findings only), ui-ux-pro-max (UX, accessibility and chart rules only), hallmark Floor checks and `sloplint` (static, run outside the repo), plus WCAG 2.1 AA.
- A live check in the browser at 375px and 1280px, light mode, signed in to the dev project with sandbox data.
- Tallyn's rules won every disagreement (§6). Findings that only hold if a Tallyn rule changes are listed under [[#Needs a rule change]].

**Not covered**
- Dark mode: it isn't built yet ([[Design System]] lists it as missing).
- Real phones and screen readers: checks were in code and a desktop browser. Contrast numbers are computed, not measured on a device.
- Line numbers are as of `main` at `6e08c38` and will drift.

**Key:** P = priority (H/M/L). Kind: **inv** = invisible (bug, accessibility or performance; can go straight to a PR); **vis** = changes what people see (needs a draft).

## Summary
About 110 findings. Most are invisible. Glass and contrast hold up well: every main text colour passes AA on glass, dialogs, inputs and buttons stay solid, and both fallbacks exist for the main surfaces.

**Fixed already**
- [#146](https://github.com/Kolla1997/Tallyn/issues/146): budget amounts with a comma decimal saved 100× too big ("12,50" → 1,250.00). PR #148.
- [#147](https://github.com/Kolla1997/Tallyn/issues/147): Home's this-month figure only counted recent transactions. Now "spent this month" from the month summary. PR #149.

**Worst of what's left**
1. A failed load leaves the error and an endless loader on Home, Accounts, Transactions, Budgets, Debts and Family, with no Try again (M1, F5).
2. New users can get stuck on backup codes with no way forward (A1), and a network blip on Join throws the invite away (A14).
3. Sign-up shows Supabase's raw "User already registered", which tells anyone an email has an account (A7).
4. The legal-page parser hangs on any `#` line that isn't a level 1–3 heading (F14).
5. Keyboard focus is lost after dialogs close, after view changes and after navigation; the page title never changes (A8, F1, F7, L1).
6. Focus is almost invisible in the profile and ☰ menus and the rings legend (G1).
7. Totals and empty states quietly leave out other currencies; Debts can say "No credit cards or loans to show. Nice." when all debts are in another currency (M3, M12).

## Proposed follow-up tickets
Agreed with Dinesh and created 2026-10-23. Ordered by what to do first.

| Ticket | What | Findings | Kind | P |
|---|---|---|---|---|
| [#151](https://github.com/Kolla1997/Tallyn/issues/151) | Stuck and failed states: Try again instead of endless loaders, backup-code dead end, code form lock, Join keeps the invite | M1, F5, A1, A4, A14, L5 | inv + small vis (Try again button) | p1 |
| [#152](https://github.com/Kolla1997/Tallyn/issues/152) | Calm error messages: map raw Supabase and network errors to Tallyn copy, neutral sign-up message | A7, A12, M11 | inv (copy from Voice and Tone) | p1 |
| [#153](https://github.com/Kolla1997/Tallyn/issues/153) | Keyboard and screen readers: page titles, focus on navigation and view changes, dialog focus return, visible focus rings, ARIA fixes | L1, A8–A11, F1–F4, F7–F12, M7–M9, G1, G10, G13 | inv | p1 |
| [#154](https://github.com/Kolla1997/Tallyn/issues/154) | Worst-case data: long text, emoji initials, blank names, double submits, races, Markdown hang, 0% rates, money edge cases | A5, A6, A13, F6, F13–F21, M4–M6, M10, L4 | inv | p1 |
| [#155](https://github.com/Kolla1997/Tallyn/issues/155) | Glass fallbacks and reduced motion gaps, plus page basics (`color-scheme`, background before JS, `100dvh`, safe area) | G2, G3, G12, G14 | inv | p1 |
| [#156](https://github.com/Kolla1997/Tallyn/issues/156) | Other currencies made visible: say what's left out instead of $0 or "Nothing spent" | M3, M12, M13, F22 | vis (copy) | p2 |
| [#157](https://github.com/Kolla1997/Tallyn/issues/157) | Motion that's cheaper and calmer: transforms instead of layout properties, Debts ring replay, sidebar collapse | G4, G15, F23, M14 | inv if it looks the same | p2 |
| [#158](https://github.com/Kolla1997/Tallyn/issues/158) | Touch and control contrast: tap areas, small buttons, input borders, disabled states, avatar contrast, press states | A2, A3, L2, L6, G6, G7, G11, F24 | vis | p2 |
| [#159](https://github.com/Kolla1997/Tallyn/issues/159) | Load speed: consent → profile → page data run one after another (about 11s for Home on a dev reload) | L3 | inv (needs a look first) | p2 |
| [#160](https://github.com/Kolla1997/Tallyn/issues/160) | CSS cleanup and tokens: off-token colours, duplicate rules, z-index scale, off-scale sizes | G5, G8, G9 | inv; some need a rule change | p3 |

> [!todo] Dark mode stays its own piece of work, with drafts. It isn't part of these tickets.

## Findings: sign-in and onboarding
| ID | Where | Finding | P | Kind |
|---|---|---|---|---|
| A1 | `BackupCodes.jsx:29-37, 108` | If making codes fails, a new user sees only the error: no retry, no defer. `reauth_required` asks for a code this screen can't take | H | inv |
| A2 | `BackupCodes.jsx:88-96`, `.btn-small` | Copy/Download buttons about 27px tall on phones; #97 asks for 40px+ | M | vis |
| A3 | `.link-quiet`, `.switch-link`, `.password-show` | No invisible 44px tap area on phones (only `.link` has it); 21–28px tall | M | inv |
| A4 | `CodeForm.jsx:31` | A network error while checking a code leaves the form busy for good | M | inv |
| A5 | `SignIn.jsx:124`, `styles.css:3473` | "Forgot password?" tap area reaches 12px down into the password field | M | inv |
| A6 | `SignIn.jsx:74`, `ResetPassword.jsx:50, 139` | A long email with no break points overflows the card at 320px; `.card` has no `overflow-wrap` | M | inv |
| A7 | `SignIn.jsx:44` | Raw Supabase errors shown; "User already registered" reveals who has an account (reset already avoids this) | M | inv |
| A8 | `SignIn.jsx:63, 80, 174`; ResetRequest, Verify2FA, Join | Switching views drops focus to `<body>`; move it to the new heading | M | inv |
| A9 | SignIn, ResetRequest, ChoosePassword, UseBackupCode, CreateHousehold | Errors not tied to fields (`aria-invalid`, `aria-describedby`) | M | inv |
| A10 | `SetUp2FA.jsx:55` | Autofocus skips a screen reader past the steps, QR code and key | M | inv |
| A11 | `ResetPassword.jsx:141-157` | No hidden username field, so password managers can't tell which account | M | inv |
| A12 | `SetUp2FA.jsx:21, 37` | Raw enrolment error text | L | inv |
| A13 | `BackupCodes.jsx:50-55` | `revokeObjectURL` right after `click()` can cancel the download in Safari and Firefox | M | inv |
| A14 | `Join.jsx:17-19` | Any failure, even a network blip, deletes the invite and says it isn't valid; clear it only on a 4xx and offer Try again | M | inv |
| — | Smaller | SetUp2FA has no loader while enrolling and no grouped/copyable key (vis); Verify2FA shows nothing with zero authenticators; blank household name passes `required`; currency list shows bare codes (vis); no busy labels in ChoosePassword and CreateHousehold; "Copied" not announced; Show password says "Hide, pressed"; two `nav "Legal"` landmarks; footer inside `<main>`; IdleGuard countdown not announced; `autocomplete="username"` on sign-in | L | mixed |

## Findings: money screens and charts
| ID | Where | Finding | P | Kind |
|---|---|---|---|---|
| M1 | HomePage, AccountsPage, TransactionsPage, BudgetsPage, DebtsPage | Load error shows with a loader that never stops; no Try again | H | inv + vis |
| M2 | `budgets.js:75`, `HomePage.jsx:44, 188` | Fixed in #146 and #147 | H | — |
| M3 | `DebtStack.jsx:30, 104`; `HomePage.jsx:359-369, 498`; `SpendingDots.jsx:26` | Totals leave out other currencies with no note (other cards say so) | M | vis (copy) |
| M4 | `CreditCards.jsx:102`, `DebtsPage.jsx:258, 267` | A 0% APR or loan rate is hidden (falsy check) | M | inv |
| M5 | `money.js:8, 13` | Fallback prints minor units ("150000 BTC"); unknown codes assumed 2 decimals | M | inv |
| M6 | `HomePage.jsx:25-26` | The month is fixed when the file loads; a tab left open into a new month shows the old month under the new name | M | inv |
| M7 | `TransactionsPage.jsx`, `.tx-details` | Phone details open full-screen without moving focus in, blocking the page behind or returning focus | M | inv |
| M8 | `RingChart.jsx:85-92` | Legend rows are buttons that do nothing | M | inv |
| M9 | `SpendingDots.jsx:167` | `role="tooltip"` wraps buttons and isn't linked to the dot | M | inv |
| M10 | `HomePage.jsx:511-535` | Refunds bigger than spending give negative shares, NaN% and a negative `flexGrow` | L | inv |
| M11 | `Home.jsx:89` | Raw "(Failed to fetch)" after the calm sentence | L | inv |
| M12 | `DebtsPage.jsx:135` | All debts in another currency → "No credit cards or loans to show. Nice." Wrong, and "Nice." is cute | H | vis (copy) |
| M13 | `SpendingDots.jsx:120`; `AccountsPage.jsx:156, 168` | "Nothing spent" on days with only foreign spending; "You have / You owe" when viewing someone else | M | vis (copy) |
| M14 | `DebtsPage.jsx:144` | `key={who}` replays the whole ring intro on every person switch; the Animation Guide says switches fade | M | inv |
| — | Smaller | Negative amounts use "-" not "−" from `formatMoney`; `Intl.NumberFormat` rebuilt every CountUp frame; Esc closes two things at once on Transactions; "Show more" not announced; budget hint not linked; `<h3>` inside `<span>`; counting switch can race; `data?.counting.find` can crash; Debts gauge read twice; "Click the dot" on touch; dot level 1 hard to tell from 0; card colours repeat after 5 and overflowing bars are cut off; `.cc-total` lacks `tabular-nums`; 20 debts make an 800px stack (vis); `initials()` can split an emoji; "Link a bank" hint shown to people who can't; raw role "owner" in lowercase | L | mixed |

## Findings: family, settings and shell
| ID | Where | Finding | P | Kind |
|---|---|---|---|---|
| F1 | `ConfirmDialog.jsx:18-22`; `Settings.jsx` dialogs | Closing a dialog doesn't return focus (it closes after React removes it) | H | inv |
| F2 | `Shell.jsx:325-335` | After ☰ → a page, focus stays on a menu that's gone | M | inv |
| F3 | `Shell.jsx:175-187, 297-308` | Menus stay open when Tab leaves them | L | inv |
| F4 | `Shell.jsx:82, 146, 338-346` | `aside "Main"` reads as "Main complementary"; inner nav unlabelled; a `<p>` inside `role="menu"` | L | inv |
| F5 | `FamilyPage.jsx:66-82, 128` | Load error plus a loader that never stops; error never cleared | M | inv + vis |
| F6 | `ConfirmDialog.jsx:24` | Type-to-confirm: no Unicode normalising; emoji names; fallback "Your teen" to type; a blank name passes with nothing typed | M | inv |
| F7 | `lib/router.jsx:17`, App | `document.title` is "Tallyn" on every screen; nothing announces a page change | M | inv |
| F8 | `FamilyPage.jsx:131-198`, `Settings.jsx:45-69` | On phones, picking a person changes content off-screen | M | inv |
| F9 | `FamilyPage.jsx:297-302` | Role picker uses `aria-pressed` for a single choice; should be a radio group | L | inv |
| F10 | `ConfirmDialog.jsx:50, 52` | Fixed `id="dialog-title"` could clash | L | inv |
| F11 | `Shell.jsx:60-75` | `[` shortcut fires on phones and while a dialog is open | L | inv |
| F12 | Members | A failed copy is silent | L | inv |
| F13 | `Shell.jsx:47`, `lib/people.jsx:18` | Initials use `charAt(0)`: an emoji name shows half a character | M | inv |
| F14 | `Markdown.jsx:114-115` | A `#` line that isn't a level 1–3 heading (`####`, `#12`) loops forever; `/terms` and `/privacy` would hang. Checked in code | M | inv |
| F15 | `FamilyPage.jsx:243-262` | Two quick sharing toggles undo each other | M | inv |
| F16 | `Members.jsx:20-38, 70` | No busy state: a double click makes two invites | M | inv |
| F17 | `Settings.jsx:111-122, 148` | A name of only spaces can be saved (server too); no busy state | M | inv |
| F18 | `FamilyPage.jsx:583`, `styles.css:1464` | A long pending-invite email overflows its card | M | inv |
| F19 | `.sidebar` | No scroll: on short windows the profile and Sign out are cut off | M | inv |
| F20 | `Settings.jsx:380-381`; `FamilyPage.jsx:567-575` | Escape during authenticator setup can leave a half-added one; Cancel invite has no busy state | L | inv |
| F21 | `Settings.jsx:557-560` | "Leave" only opens Family; the leave dialog doesn't open | L | inv |
| F22 | `FamilyPage.jsx:231-233` | Has and Owes count only home-currency accounts: EUR-only shows $0.00 | M | inv + copy |
| F23 | `styles.css:986-988` | Sidebar collapse animates `grid-template-columns`; labels and logo jump at the start | M | vis |
| F24 | `lib/people.jsx:3` | White initials on a Sage avatar about 3.4:1 | M | vis |
| — | Smaller | Save sits on the Email row, away from the name (vis); loader flashes on fast loads (the 150ms rule); "Your teen" reads oddly mid-sentence (copy) | L | mixed |

## Findings: app-wide
| ID | Where | Finding | P | Kind |
|---|---|---|---|---|
| G1 | `styles.css:2672-2676, 3164-3169` | `outline: none` with a near-invisible background (about 1.1:1) on menu items and rings legend | H | inv (existing ring) |
| G2 | `styles.css:1276, 2838` | Net worth bar and card pieces still slide with reduced motion on | H | inv |
| G3 | `styles.css:2147, 2151, 2166-2189, 2586, 3536-3540, 3859, 4338` | Glass fallbacks incomplete: dark total card stays 86% without blur, tone tiles and two white panels never go solid, Safari's `-webkit-backdrop-filter` not reset | H | inv |
| G4 | `styles.css:894, 1276, 1542, 1726, 2838, 3197` | Layout properties animated (grid columns, `left`, `top`, width, flex-grow); use transforms | M | inv |
| G5 | 16 places | Off-token colours (`#f6e2dc`, `#e3ece3`, `#7a5210`, Cocoa and white at odd alphas) | L | inv / rule change |
| G6 | `--color-border` | Input, select and switch edges 1.48:1 against white; WCAG asks 3:1 for controls | M | vis |
| G7 | `.btn:disabled`, switch, `.btn-waiting` | Disabled shown by opacity alone; 2FA's sand "waiting" style is clearer | M | vis |
| G8 | `styles.css:323/2213/3950, 899/2217, 542/2542, 4351` | The same rule written up to three times; one exact duplicate; the header comment is out of date | L | inv |
| G9 | 44 spacings, 6 radii, 5 font sizes | Off-scale sizes; a spacing token used as a radius | L | vis |
| G10 | z-index 5–50 | No scale; the skip link (10) can sit under the sidebar (30) | M | inv |
| G11 | 19 `:hover` rules | Not limited to devices with hover, so they stick after a tap; no press states (vis) | L | inv + vis |
| G12 | `index.html`, `styles.css:20, 324, 2531, 550-563` | No `color-scheme` (phones may auto-darken the glass), white flash before tokens load, `100vh` too tall on mobile Safari, tab bar ignores the safe area | M | inv |
| G13 | About 30 copies | No global `:focus-visible` default, so new elements ship without a ring | L | inv |
| G14 | `index.html`, `fonts.css` | No preload for the two main fonts and no metric-matched fallback: visible swap on big amounts | L | inv |
| G15 | `.panel`, `.card`, sidebar | `blur(18px)` on every card over a fixed glow; profile scroll on a mid-range phone before changing anything | L | vis |

## Findings: live check
| ID | Where | Finding | P | Kind |
|---|---|---|---|---|
| L1 | Every screen | Tab title is always "Tallyn" (same as F7) | M | inv |
| L2 | Home, Family | Text links ("All 28 accounts", "See all", "Manage", "Sharing") are 20px tall | M | vis |
| L3 | Every screen, dev | Requests wait on each other: consent 2–3s → profile 2–3s → page data up to 6s. Home about 11s on a reload in dev | M | inv |
| L4 | `BudgetsPage.jsx:248` | Screen-reader label "Change You's Food and drink budget" | L | inv |
| L5 | `TallynLoader` | Two loaders: full mark with "Adding it all up..." and leaf only without "..." | L | vis |
| L6 | Accounts and Transactions at 375px | Long account names wrap to three lines and squeeze the amount; filter chips wrap to two rows | L | vis |

## Needs a rule change
Raised by the skills, against a Tallyn rule. Nothing changes unless Dinesh agrees.
- **Middle-dot meta lines** ("Owner · Household"): hallmark bans them; Tallyn uses them by choice (#72, #122).
- **"→" after the sign-in switch link**: flagged by sloplint; Dinesh picked it in #25.
- **Ring overshoot and `.is-hot` glow**: the overshoot briefly draws more owed than is real, and the glow is a shadow. Both are in the Animation Guide.
- **Motion and breakpoint tokens**: durations and breakpoints live only in prose. Making them tokens in `design-tokens.json` (and snapping 400/600/900/1100/1200px to the scale) would be a Design System change.
- **New colour tokens** for the amber "ahead" text and dialog backdrops, if they stay.

## What's sound
- Every dialog, input, button and menu is solid; both glass fallbacks exist for panels, cards, chips and the sidebar.
- Text contrast on glass passes AA at the strongest glow: secondary 7.6:1, clay-deep 4.8, success 4.69, error 5.0, cream on the dark card 7.7+. Only clay-deep and sage-deep on the tinted tiles sit at or just under 4.5 (fine for icons; check nothing puts small coloured text there).
- Reduced motion is handled for keyframes, rings, count-up and the loader. No `transition: all`, no `will-change`.
- Skip link, `aria-current` in the nav, labelled icon-only links, native `showModal()` focus trapping, the 2FA code form (grouping, paste, `one-time-code`), and the year of dots' roving focus.
- No page overflows sideways at 375px; no unlabelled controls found.

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-10-23 | Fix the two wrong-number bugs first, as #146 and #147 | They show families the wrong amount |
| 2026-10-23 | Home's figure becomes "spent this month" from the month summary (option A) | Counts every transaction and matches the Spending card, with no server change |
