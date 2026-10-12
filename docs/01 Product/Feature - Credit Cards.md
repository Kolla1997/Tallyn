---
type: spec
status: active
owner: Dinesh
updated: 2026-10-12
issue: 27
tags: [spec, plaid, home]
---

# Feature — Credit Cards

Part of [#27](https://github.com/Kolla1997/Tallyn/issues/27) (debt details). Loans and mortgages come later.

## Problem
Families want every card in one place: how much of their limits they use, what each card charges, and what's due when.

## Goal and success metric
On Home, see your total credit limit, how much is used, and each card's APR, minimum payment and due date, without opening a bank app.

## User stories
- As a parent, I want to see all my cards' total limit and what I've used so that I keep usage low.
- As a parent, I want to see each card's minimum and due date so that I never miss a payment.

## Scope
**In:**
- Credit limit from the bank's balances; APRs, minimum, due date, last statement and payment, overdue from Plaid Liabilities (optional product, [[0010-plaid-liabilities-for-credit-cards]])
- Refreshed about once a day by the sync ([[Feature - Bank Sync]])
- **Credit cards** card on Home, below Your accounts; follows the Yours / Everyone switch
- Same visibility as the card's balance ([[Feature - Sharing]])

**Out:**
- Student loans, mortgages, other loans (rest of #27)
- Reconnecting older banks to share card details (#51)
- Payment reminders (#55)

## Design
Option F (Dinesh picked from six drafts): header "$10,860 used of $24,000 total limit"; one bar for the total limit with each card's balance as a piece in shades of Clay and Sand for what's available; "45% used" and "$13,140 available" under it. Then one line per card, soonest due first: name and last digits, bank · APR · minimum, used of its limit, and the due date (amber chip within 5 days, Error "Overdue"). Cards without details say "No APR or due date yet · Add APR and due dates" when the bank needs permission (or hasn't been asked), and "Your bank doesn't share APR or due dates for this card." once it has answered (`plaid_items.card_details`, migration `0012`, #51). Due dates show the year when it isn't this year; a date that has passed reads "Last due …" and sorts after upcoming ones. Cards in another currency are counted in a note. See [[Design System]].

## Tech notes
- Migration `0011_credit_cards.sql`: `accounts.credit_limit_minor`, `plaid_items.liabilities_synced_at`, `credit_cards` with RLS (`can_see_account_data(account_id, 'balances')`) and a sync-only write policy.
- `internal/plaid`: `Account.LimitMinor`; `Liabilities()` keeps exact APR strings and drops unknown types and impossible rates; `NoLiabilities()` for codes that just mean "nothing to give".
- `internal/sync`: `syncCards` runs at most every 20 hours per bank.
- `GET /api/banks`: each account has `credit_limit_minor` and `card` (null until details arrive).
- Web: `components/CreditCards.jsx`.

## Rollout
1. Run `0011_credit_cards.sql` on dev (done 2026-10-12).
2. Banks linked before this show limits but not card details (`ADDITIONAL_CONSENT_REQUIRED`). **Add APR and due dates** (#51) on the bank in Accounts, or on the card on Home, asks for consent in Plaid and fetches them straight away.
3. Production: confirm the Liabilities price first.

## Open questions
> [!todo] Liabilities price per bank in Production: ask Plaid (Dinesh).
