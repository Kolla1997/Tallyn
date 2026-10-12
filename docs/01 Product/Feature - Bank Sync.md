---
type: spec
status: active
owner: Dinesh
updated: 2026-10-12
issue: 9
tags: [spec, plaid, sync]
---

# Feature — Bank Sync

## Problem
Tallyn adds up a family's money, so linked banks must stay up to date on their own: new transactions, changed ones, removed ones, and current balances.

## Goal and success metric
Every active linked bank is synced at least every 6 hours, and within minutes of being linked. Success: a family sees this month's spending by category and their recent transactions without doing anything.

## User stories
- As a parent, I want my transactions to appear on their own so that Tallyn shows where our money went.
- As a parent, I want to see how much we spent on what this month.
- As a person, I want only me (and, for kids, the household owner) to see **when and where** I spent money.
- As anyone, I want to know when a bank needs me to sign in again.

## Scope
**In:**
- Scheduled sync every 6 hours (`SYNC_EVERY`), plus a sync right after linking (retried at 1, 5 and 30 minutes while Plaid finishes its first pull)
- Plaid `/transactions/sync` (cursor-based) and balances; 90 days of history for new links
- Per transaction: amount, date, merchant, category, pending, how it was paid, and when the bank provides them **time** (authorized, posted) and **location** (address, city, region, postal code, country, store number, coordinates)
- **Location and time visible only to the person who made the transaction, plus household owners for teens' and children's** (decided 2026-10-09)
- Banks needing a fresh sign-in are marked `needs_reauth` and shown as "Reconnect needed"; removed ones `disconnected`
- Web: spending by category this month, recent transactions, last-updated time per bank

**Out:**
- Debt details: interest rates, due dates, minimum payments ([#27](https://github.com/Kolla1997/Tallyn/issues/27))
- Choosing what each member shares, e.g. partners seeing each other's everything ([#28](https://github.com/Kolla1997/Tallyn/issues/28))
- The reconnect flow (Link update mode) and Plaid webhooks: follow-ups
- Map view of transactions (coordinates are stored for it)
- Budgets (#13), currency conversion (#11)

## Design
Home, below **Banks and cards**: "Updated Oct 9, 2:15 PM" under each bank (or "Reconnect needed" in Error colour); **Spending this month** with a Clay bar on a Sand track per category; **Recent transactions** with money out in Error and money in in Success colour, and a line like "Oct 1 · 1:42 PM · Chicago, IL · in store · Plaid Checking". Bare-bones until #25.

## Tech notes
Design and security: [[0005-bank-sync-system-role]].

- `internal/sync`: one goroutine; syncs all active banks on start and every `SYNC_EVERY`; `SyncNow` from the link handler. Each bank has a 2-minute timeout and fails on its own.
- `internal/plaid` `SyncTransactions`: collects every page before returning; on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` it restarts from the original cursor. Amounts exact (`internal/money`); unknown currencies skipped and counted.
- `internal/db` `System`: the only code that runs as `tallyn_sync` (migration `0005_bank_sync.sql`). `SaveSync` writes balances, transactions, details, removals and the cursor in **one transaction**, and only if the bank's cursor hasn't moved since it was read.
- `transaction_details` holds time and location, separate from `transactions`, with its own RLS policy built on `can_see_whereabouts()`. #28 changes that one function.
- Spending excludes income, transfers between accounts and credit card payments (which would count card purchases twice). Currencies are summed separately.
- About once a day after a good sync (#27): `/accounts/get` for fresh balances and credit limits (the transaction sync only sends balances with new transactions), then `/liabilities/get` for credit card details, saved by `SaveAccounts` and `SaveCreditCards` (`0011_credit_cards.sql`). Banks without cards, or that haven't consented, are cleared quietly with Plaid's code in the log. See [[Feature - Credit Cards]].
- Logs carry counts and Tallyn's bank IDs only: no merchants, amounts, places or tokens.
- `GET /api/transactions?household_id=&limit=` and `GET /api/spending?household_id=&month=YYYY-MM`.

## Rollout
1. Run `0005_bank_sync.sql` on the dev Supabase project.
2. Link a sandbox bank, wait a minute, check transactions and spending appear, and that the backend log shows only counts.
3. Production: Plaid webhooks need a public HTTPS URL once hosting is chosen.

## Open questions
- Separate database logins for the API and the sync (see ADR 0005), so even injected SQL couldn't leave the user's role.
- How long to keep transactions, and what happens to a removed member's history (#12).
