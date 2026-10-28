---
type: spec
status: active
owner: Dinesh
updated: 2026-10-24
issues: [13, 133]
tags: [spec, budgets]
---

# Feature — Budgets

## Problem
Families want to know, during the month, whether they're on track: per category ("food") and for their income as a whole ("every dollar has a job").

## Goal and success metric
A family sets a plan once and sees, at a glance, how each part of it is going this month. Success: households with a plan come back to the Budgets page at least weekly.

## Category budgets (#13)
Built. Pace-line tiles for household budgets, day notches for budgets for one person, add / change / delete, and "Count my spending in household budgets". Who counts and who sees what: [[0014-budget-totals-opt-in]].

## Plan from your income (#133)
"Give every dollar a job." Agreed with Dinesh, 2026-10-24.

**User stories**
- As a parent, I want to split our monthly income into a few jobs so that I know how much is meant for bills, fun, debt and savings.
- As someone with irregular pay, I want to set my own income and split, so the plan still fits.

**Scope: in**
- One **household plan** and one **personal plan per person**, with the same who-counts and who-sees rules as budgets ([[0014-budget-totals-opt-in]]): household plans count members who opted in, plus kids, as totals only.
- **Income:** Tallyn suggests the monthly income as the average of the last **3 full months** of pay-type income (`INCOME_WAGES`, `INCOME_RETIREMENT_PENSION`, `INCOME_UNEMPLOYMENT`). Tax refunds, interest, dividends and other one-offs are left out. Always editable.
- **Templates** (a common way to split income, never advice):

| Template | Buckets |
|---|---|
| 55 / 5 / 10 / 15 / 15 | Essentials 55, Guilt-free 5, Debt / Invest 10, Short-term goals 15, Long-term wealth 15 |
| 50 / 30 / 20 | Needs 50 (Essentials), Wants 30 (Guilt-free), Savings & debt 20 (Debt / Invest + Short-term + Long-term) |
| Your own | The five buckets, any shares that add up to 100 |

- **What each bucket measures this month**, from Plaid's detailed categories:

| Bucket | Counts | Plaid categories |
|---|---|---|
| Essentials | Spending on needs, plus mortgage and rent | `RENT_AND_UTILITIES_*`, `FOOD_AND_DRINK_GROCERIES`, `TRANSPORTATION_*`, `MEDICAL_*`, `GENERAL_SERVICES_INSURANCE`, `GENERAL_SERVICES_CHILDCARE`, `GENERAL_SERVICES_EDUCATION`, `LOAN_PAYMENTS_MORTGAGE_PAYMENT` |
| Guilt-free | All other spending | Every other spending category |
| Debt / Invest | Money paid toward loans, and card interest | `LOAN_PAYMENTS_*` except credit card and mortgage payments; `BANK_FEES_INTEREST_CHARGE` |
| Short-term goals | Money moved into savings | `TRANSFER_OUT_SAVINGS` |
| Long-term wealth | Money moved into investments and retirement | `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` |

- **Paying a credit card bill never counts as debt repayment**: that spending already counted when it happened.
- **Say what Tallyn can't see**, e.g. retirement taken from pay before it reaches the bank (an employer 401(k)).
- The plan sits **above** the category budgets on the Budgets page; both keep working. A budget is a cap, a plan is a split.

**Scope: out (later)**
- Moving a transaction to another bucket when Plaid's category is wrong
- Weekly plans; plans in a currency other than the household's

**Design** (Dinesh picked 3A, 2026-10-24, `docs/03 Design/Comps/web-income-plan-answer-draft.html`): answer first, then logic, then data.
- **The answer**, in words: "You're on track this month" (or mostly, or what needs a look), with what's over and what's still to move, and how many days are gone.
- **The logic**: your income and template, then one split bar with every part labelled with its job, amount and share.
- **The data**: one row per job with a plain bar and words ("$740 left", "$45 over", "$560 to move", "Done") and a pace pill.
- **Setting it up**: income (suggested, editable), three template cards, "not financial advice", Start my plan.

Drafts 1 (layouts) and 2 (new chart types: waffle, flow, bullet, treemap, waterfall) were compared first; they read slower than words (Dinesh, 2026-10-24).

**Tech notes**
- New table for plans (household or one person, income, template, shares), with row-level security from the budget rules (`can_see_budget`, `can_manage_budget`).
- One database function measures each bucket for the month, totals only, never transactions; another suggests the income.
- Tests: [[Test Plan]] rows under Money.

## Open questions
> [!todo] Whether to show the plan on Home too (a later ticket).
