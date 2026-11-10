---
type: spec
status: active
owner: Dinesh
updated: 2026-11-09
issue: 127
tags: [spec, bills]
---

# Feature — Bills

Record bills and payments Plaid can't see: rent, electricity, gas, water, internet, insurance, childcare, cash payments. [#127](https://github.com/Kolla1997/Tallyn/issues/127). Loans: [#306](https://github.com/Kolla1997/Tallyn/issues/306). Onboarding step: [#307](https://github.com/Kolla1997/Tallyn/issues/307). Reminders: [#126](https://github.com/Kolla1997/Tallyn/issues/126).

## Problem
Rent and utilities are often a family's biggest costs. Paid in cash, by cheque or from an account that isn't linked, they never reach Tallyn, so spending looks smaller than it is.

## Who and what question
Account owners only. The screen answers: **"What's due this month, and what have we paid?"**

## Scope
**In:**
- **A bill:** name, category, amount, fixed or varies, how often (monthly, every 3 months, yearly, once), due day, start date, note.
- **Each period makes an expected payment.** The owner marks it:
  - **Paid** (the expected amount, today's date by default),
  - **Paid a different amount** (for utilities that vary), or
  - leaves it as **Not yet**. Past its due day it shows as **Late**.
  - **Undo** takes a payment back if it was marked by mistake.
- **Spending:** paid bills count in spending and Budgets on their paid date, marked "Added by you". They never change bank balances, which come from Plaid only.
  - **Step 1 (0030, done):** paid bills count on Transactions (list, totals, day bars), Home's spending and **household** budgets, for owners only. A bill row has a dashed receipt icon and "Added by you" (Dinesh picked C of `drafts/127-bill-rows.html`); tapping it opens Bills. Kinds map to categories: housing and utilities → Rent and utilities; the rest → General services. Bills show under the owner's own **Yours** and **Everyone**; filtering to another person or to a bank leaves them out (found on the sandbox: Transactions opens on Yours).
  - **No double counting:** a bill marked paid from a "Paid from your bank?" match keeps that transaction's ID and adds no line of its own.
  - **Step 2 (0031, done):** weekly and monthly emails, owners only: "Plus $X in bills you marked paid." under the headline and a **Bills paid** slip; the weekly email adds bills due the week after to **Coming up**, marked "Bill" (Dinesh picked C of `drafts/127-bills-email.html`). Bills never go into "You spent" (that total also shows in others' shared section). Household income plans count paid bills for owners; insurance and childcare file as essentials.
  - **Spending-limit alerts stay on bank spending** (Dinesh, 2026-11-09): they reach adults and kids.
- **Paid from your bank?** When a money-out Plaid transaction with a close amount (±10%) and date (±5 days) appears for an unpaid bill, today's panel suggests it. "Yes, mark paid" opens the paid dialog filled with that amount and date; the owner confirms. Never applied on its own. (Name matching left out: bank names rarely match what people call a bill.)
- **Credit cards from Plaid** (added 2026-11-09, Dinesh): each linked card's next payment sits on its due date with a card icon, read-only. Its card shows the minimum, the statement balance and **Open in Debts**. The bank says when it's paid (a payment on or after the last statement that covers the minimum); overdue shows as late. **Left to pay counts the minimum.** Only cards the owner can already see. Plaid gives only the next due date, so past months show no card payments. (Plaid's sandbox cards are due May 28, 2020.)
- **Edit, pause, delete** a bill (tap its name). Deleting asks first and removes its payments too; pausing keeps them.
- **Where:** a Bills page (`/bills`), in the sidebar after Debts and in the ☰ menu on phones, shown to owners only. (Home card and the onboarding step come with #307; reminders with #126.)

**Out:** loans and interest (#306), onboarding step (#307), reminders and email (#126), CSV import, bills from other members.

## Design
Dinesh picked **C · Mix** of `drafts/127-bills-calendar.html` (2026-11-09), after the calendar-schedule reference he shared:
- **Calendar** (glass, left): each bill on its due day as a chip (✓ paid in green, ! late in red, clock for coming up), "+N more", the day's total; today filled, the picked day outlined. Phones show icons only.
- **Side** (glass, right): the picked day's bills with **Mark paid** and **Different amount**; on today, "Paid from your bank?" hints and late bills come first. Below, **Left to pay** this month, a paid bar and "Paid X of Y · N late".
- The first designs (month strip, tally tape) were turned down.

Loading effect: the page mark, then cards fade in (`.calm-card`), day cells rise 18ms apart (`.calm-rise` with `--d`), bill cards rise (`.calm-row`) and the paid bar fills (`.calm-fill`). Reduced motion: drawn at once.

## Tech notes
- **Migration `0029_bills.sql`:**
  - `bills` (household_id, created_by, name, category, amount_minor, currency, varies, frequency, due_day, starts_on, paused, note).
  - `bill_payments` (bill_id, period = that period's due date, paid_minor, paid_on). Only payments are stored; due and late are worked out.
  - **RLS:** read and write only for the household's owners (`has_household_role(…, ['owner'])`). No bank or account numbers stored.
- **`internal/db/bills.go`:** `DueIn` works out each period's due date (the 31st becomes a short month's last day; every 3 months and yearly count from the start month), late status and the bank match.
- **API** (`internal/api/bills.go`): `GET /api/bills?household_id=&month=YYYY-MM`, `POST /api/bills`, `PUT|DELETE /api/bills/{id}`, `PUT|DELETE /api/bills/{id}/payments/{due}`.
- **Web:** `screens/BillsPage.jsx`, `lib/bills.js`, `BillsIcon`; the preview's fake API has a month of bills.
- **Spending (0030):** `spend_lines` view (security_invoker) = transactions + paid bills without a matched transaction. Transactions, Spending, Summary and Daily read it; `budget_spending` adds paid bills to household budgets when the viewer is an owner. `bill_payments.transaction_id` records the matched bank transaction.

## Open questions
> [!todo] Category list: a short fixed list for now (housing, utilities, insurance, childcare, subscriptions, other). Reuse the transaction categories when bills join Spending? Ask Dinesh.

Decided 2026-11-09: bills are for household **owners** only; adults, teens and children don't see them.
