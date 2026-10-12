---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-12
issue: 27
tags: [adr, plaid, security]
---

# 0010 — Ask Plaid for Liabilities as an optional product

- **Status:** Proposed
- **Date:** 2026-10-12
- **Ticket:** #27
- **Supersedes:** the "Transactions only" part of [[0004-plaid-token-encryption-and-link-path]]'s least-data rule. Everything else in 0004 stands.

## Context
Dinesh wants credit cards on Home: limit, balance used, APR, minimum payment and due date. Balances and limits come with the accounts Tallyn already reads. APR, minimum and due date only come from Plaid **Liabilities**, which ADR 0004 left out ("US only, Transactions only").

## Options considered
1. **Liabilities as a required product** at Link. Simple, but banks without cards or loans couldn't be linked at all.
2. **Liabilities as an optional product** (`optional_products`). Banks that have it share it; the rest still link with Transactions only.
3. **Leave it out** and show only balance and limit. No APR or due date, which is what families most need to see.

## Decision
Option 2.

- Link asks for `products: [transactions]` and `optional_products: [liabilities]`. Still US only, an opaque user ID, and masks only.
- The sync calls `/liabilities/get` about once a day (Plaid refreshes daily), after a good transaction sync, together with `/accounts/get` for fresh balances and limits. A failure there never fails the bank's sync.
- Only credit cards are stored for now (`credit_cards`, migration `0011`): APRs, minimum, due date, last statement and payment, overdue. Student loans and mortgages come later under #27; no property address ever (decided 2026-10-09).
- Card details have the same visibility as the card's balance (`can_see_account_data(..., 'balances')`), and only the sync role writes them.
- Logs carry Plaid's error code and Tallyn's bank ID only.

## Consequences
- **Cost:** Liabilities is a monthly fee per connected bank in Production, on top of Transactions. Free in Sandbox. Dinesh to confirm the price before launch.
- **Banks linked before this** get `ADDITIONAL_CONSENT_REQUIRED`: their cards show balance and limit but no APR or due date until the person reconnects (Link update mode, #51) or links again.
- More sensitive data is stored (rates, payment dates, overdue status), so it stays behind the same sharing rule as balances.
