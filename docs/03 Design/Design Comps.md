---
type: spec
status: draft
owner: Dinesh
updated: 2026-10-12
issues: [10, 39, 61, 87]
tags: [design, comps]
---
# Design Comps

Visual comps, not production code. Amounts and rates are placeholders.

> [!warning] Card finish rule (#61, 2026-10-11)
> Every card is **frosted glass** over a soft sage, clay and sand glow, not flat white. New comps must follow it; the older comps below still show flat cards. Rule, values and fallbacks: [[Design System#Glass finish]].

> [!warning] Loading rule (#87, 2026-10-12)
> When a filter or switch changes what a card shows, use **dim and a thin bar** (Dinesh picked option A):
> - The current list and totals fade to about half strength, and a thin Clay bar slides along the top of each card.
> - Then the new content fades in.
> - Nothing jumps, and it feels calm.
>
> New comps showing a loading or filter state must follow it. Timing, count-up numbers and reduced motion: [[Animation Guide#When filters change (#87)]].

![[app-screens-overview.png]]

| Screen | File |
|---|---|
| Splash | `Comps/App Screens/01-Splash.png` |
| Welcome | `Comps/App Screens/02-Welcome.png` |
| Home | `Comps/App Screens/03-Home.png` |
| Accounts | `Comps/App Screens/04-Accounts.png` |
| Family | `Comps/App Screens/05-Family.png` |
| Goals | `Comps/App Screens/06-Goals.png` |

## Web app (draft, #39)
`Comps/web-app-draft.html`: Home for web (sidebar from 1024px) and phone (bottom tab bar). Open it through a local web server so the brand fonts and logo load (e.g. `python3 -m http.server` at the repo root, then `/docs/03%20Design/Comps/web-app-draft.html`).
- Send, Request and Convert are replaced by **Link a bank**, **Share** and **Invite**: Tallyn is read-only and can't move money (#36)
- Your accounts and **Shared with you** are separate (#37); the total balance shows yours, shared and your kids'
- Transactions can be filtered by person; time and place appear only where visible (#28)

`Comps/web-accounts-draft.html`: your banks, **Shared with you** (James's, and Leo's as his parent), a credit card with a debt-details preview (#27), a bank that needs signing in again, and an account detail panel.

`Comps/web-family-draft.html`: members with roles and per-person sharing switches, a teen (parents see automatically), a viewer, invite form and waiting invites, and the removal confirmation with typed name and 2FA code (#38).

`Comps/web-goals-draft.html`: goals that **follow a savings account** (update on their own) or are updated by hand, how much a month keeps each on track, a new-goal form with who can see it, and a preview of idea #33 (where this month's income could go). No "Add money": Tallyn can't move money.

`Comps/web-settings-draft.html`: profile, sign-in and security (2FA on; backup authenticator #23, password #22), household name and home currency, your data (download, Terms and Privacy #36), notifications (later), leave or close with 2FA confirmation.

**Net worth** (decided 2026-10-09): shown on Home and Accounts as what you have minus what you owe on cards and loans; owed amounts stay out of "Total balance".

Shared styles and icons: `Comps/draft.css`, `Comps/draft-icons.svg`. Two columns from 1280px, sidebar from 1024px, bottom tab bar below.

Desktop and mobile screenshots: `Comps/website-desktop-1440.png`, `Comps/website-mobile-390.png`. Source: `Comps/website/index.html`.

> [!warning] Update before build
> The website comp still uses Clay (#C8553D) for buttons with white text. Switch to Clay Deep. See [[Design System]].
