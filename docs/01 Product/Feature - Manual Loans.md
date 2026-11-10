---
type: spec
status: active
owner: Dinesh
updated: 2026-11-09
issue: 306
tags: [spec, debts, loans]
---

# Feature — Manual Loans

Loans Plaid can't see, like a car loan from Toyota Financial. [#306](https://github.com/Kolla1997/Tallyn/issues/306). Related: [[Feature - Bills]], [[Feature - Debts]].

## Problem
Plaid Liabilities covers credit cards, student loans and mortgages, not car loans. Families want to see what's left, where each payment goes and when it's paid off.

## Scope
**In:**
- **Add a loan** (Debts → Add a loan, owners only): name, lender, amount borrowed, APR, length in months, first payment, and optionally today's balance from the statement. The form shows the payment, payoff month and total interest as you type.
- **A loan is a bill with loan terms.** Its monthly payment is a bill (kind "loan"): it shows on the Bills calendar and in the reminder, and is marked paid there. A loan payment isn't spending (as Plaid's, #77) and counts as "debt" in income plans.
- **The maths:** standard fixed payment; each monthly payment pays the month's interest on the balance first, the rest comes off the balance. **Pay extra** goes straight to the balance. **Correct the balance** to the lender's statement: payments after that day start from it. Figures are estimates.
- **Debts:** the loan sits in **Other loans** with the usual row (rate, next payment, payoff date, paid-off bar, balance) and "Added by you"; it counts in You owe and Interest paid this year.
- **Detail** (Dinesh picked C of `drafts/306-loans.html`): tap the loan's name for left to pay, % paid off, payoff date, monthly payment, interest paid so far, and the last payment split into interest (red) and off the balance (green); Correct the balance, Pay extra, Edit (and Delete).

**Out:** Plaid car loans (not offered), refinancing, balloon payments, variable rates.

## Tech notes
- **Migration `0032_loans_manual.sql`:** `loans_manual` (bill_id, principal, apr_bp, months, first_due, balance correction) and `loan_extra_payments`; RLS: household owners. Bills get kind `loan` → `LOAN_PAYMENTS` / `LOAN_PAYMENTS_CAR_PAYMENT`.
- **`internal/db/loans.go`:** `LoanPayment`, `RunLoan`, `PayoffMonths`; `Loans` works out balance, interest, next due and payoff from the bill's payments and extra payments.
- **API:** `GET/POST /api/loans`, `PUT /api/loans/{id}`, `PUT /api/loans/{id}/balance`, `POST /api/loans/{id}/extra`; delete via `DELETE /api/bills/{id}`.
- **Web:** `components/ManualLoan.jsx` (detail, dialogs, `asAccount`), `screens/DebtsPage.jsx`.
