---
type: spec
status: active
owner: Dinesh
updated: 2026-10-26
issue: 27
tags: [spec, plaid, debts]
---

# Feature — Debts

Everything you owe in one place: credit cards, student loans, mortgages and other loans. [#27](https://github.com/Kolla1997/Tallyn/issues/27). Card details: [[Feature - Credit Cards]].

## Problem
Debt was spread over Home (credit cards) and Accounts (You owe balances). Families want rates, payments, payoff and overdue warnings together.

## Scope
**In:**
- **Debts page** (`/debts`): in the sidebar after Transactions (web), in the ☰ menu on phones (the tab bar keeps its five tabs). Same people switcher as Accounts.
- **Top:**
  - A rings card (one ring per kind of debt: what's still owed out of limits or amounts borrowed; You owe in the middle; legend with bars).
  - A facts card: payments due this month, interest paid this year (loans), overdue.
  - The two cards sit side by side from 1200px, stacked below.
- **One card per debt**, two per row on web, grouped under Credit cards / Student loans / Mortgages / Other loans with each group's total beside its heading.
  - Each card has its rate, next payment and due date, and payoff or end date.
  - A notched gauge: % of the limit used (Clay), or % paid off of the amount borrowed (Sage). A loan that has grown past what was borrowed says so instead.
- **Loan details from Plaid Liabilities** (student loans and mortgages), fetched daily with the card details. Only what the page shows.
- "See all debts" link from Home's Credit cards card.

**Out:**
- Auto loans and other credit lines: Plaid Liabilities doesn't cover them, so they show their balance (and limit, if any) only.
- Payoff planning, reminders (#55).

## Design
Dinesh picked:
- **Rings:** option 1.
- **Debt cards:** option 2, separate cards, two per row, with the totals beside the headings.
- **Gauge style:** C, taller notches with the label on top.
- **Top layout:** the facts in their own card, stacked on the right.
- **Icon:** A, a receipt.

Plain SVG with brand tokens, no chart library. See [[Design System]] and [[Animation Guide]].

## Tech notes
- **Migration `0013_loans.sql`:** a `loans` table (kind, rate and type, next payment and due date, last payment, payoff or maturity date, amount borrowed and date, past due, overdue, interest and principal paid this year, repayment plan, term).
  - **RLS:** `can_see_account_data(account_id, 'balances')`, and only the sync writes.
  - **Never stored:** account numbers, payment reference numbers, servicer or property addresses, escrow, PMI.
- **`internal/plaid`:** `Liabilities()` returns `{Cards, Loans}`. Rates are exact strings, and implausible values are dropped. A mortgage with an amount past due is treated as overdue.
- **`internal/db`:** `SaveLiabilities` writes cards and loans in one transaction. `GET /api/banks` returns a `loan` object per account.
- **Web:** `screens/DebtsPage.jsx`, its summary strip and rows (calm redesign, #187), plus the ☰ menu in `screens/Shell.jsx`.

## Rollout
1. Run `0013_loans.sql` on dev (done 2026-10-12, with Dinesh's OK). It resets the daily fetch time, so loans fill in on the next sync.
2. Production: same Liabilities product as the cards; no extra cost.

## Open questions
> [!todo] Show auto loans and credit lines from another source later? Ask Dinesh.
