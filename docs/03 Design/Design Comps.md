---
type: spec
status: draft
owner: Dinesh
updated: 2026-10-09
issues: [10, 39]
tags: [design, comps]
---
# Design Comps

Visual comps, not production code. Amounts and rates are placeholders.

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

Shared styles and icons: `Comps/draft.css`, `Comps/draft-icons.svg`. Two columns from 1280px, sidebar from 1024px, bottom tab bar below.

Desktop and mobile screenshots: `Comps/website-desktop-1440.png`, `Comps/website-mobile-390.png`. Source: `Comps/website/index.html`.

> [!warning] Update before build
> The website comp still uses Clay (#C8553D) for buttons with white text. Switch to Clay Deep. See [[Design System]].
