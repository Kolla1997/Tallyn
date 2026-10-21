---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-21
issue: 13
tags: [adr, privacy, budgets]
---

# 0014 — Budgets count spending by choice, as totals only

- **Status:** Proposed
- **Date:** 2026-10-21
- **Ticket:** #13

## Context
A household budget ("the family spends up to $600 a month on food") adds up several people's spending. In Tallyn, nobody sees another person's money unless they share it ([[0007-consent-based-visibility]]). So whose spending a shared budget may count is a privacy question, not just maths.

## Options considered
- **A. Count what each viewer can see.** Different people see different numbers for the same budget.
- **B. Opt in, totals only** (chosen by Dinesh, 2026-10-17).
- **C. Count everyone automatically.** This breaks "nobody sees your money until you share it".

## Decision
Option B.

- **Opt in:** each member has "**Count my spending in household budgets**" (`household_members.count_in_budgets`), off by default.
  - Only that person can change it, through `set_count_in_budgets()`.
  - Members can't be added with it already on: inserts are limited to household, person and role.
- **Kids count automatically:** teens' and children's spending counts, because their parents already see it (#28).
- **Totals only:** progress comes only from `budget_spending()`, which returns **spending per day, never transactions**. It returns nothing when the caller may not see the budget. Spending means money out: not income, transfers, loan payments or refunds (#77).
- **Who sees and changes what** (`can_see_budget`, `can_manage_budget`, enforced by row-level security):
  - **Household budgets:** every member sees them; owners and adults change them.
  - **A budget for one person:** that person sees it, plus owners and adults when it's a teen or child. Owners and adults set them on teens and children; anyone else (not a teen or child) sets their own.
- **"This week" and "this month"** follow the family's local date, sent by the browser and accepted only within a day of the server's. Weeks start on Sunday.

## Consequences
- **Everyone sees the same numbers** for a household budget, and nobody's individual transactions are exposed through budgets.
- **Totals still reveal something.** A member who opts in lets the household see how much they spend per category per day, which is why it's opt-in.
- **Kids' totals reach every household member** who sees household budgets, including teens and viewers, who don't otherwise see kids' money. They're mixed with other counted spending, per day. If that's too much, a later change could limit household budgets to owners and adults.
- **#133** (plan from your income) builds on the same tables and rules.
