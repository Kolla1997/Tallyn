---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-09
issue: 28
tags: [adr, privacy, database]
---

# 0007 — Members see each other's money by consent, not by role

- **Status:** Proposed
- **Date:** 2026-10-09
- **Ticket:** #28
- **Supersedes:** the role-based visibility in `0001_households.sql` / [[Feature - Data Model]] (owners, adults and viewers seeing everyone's banks and transactions), and `can_see_whereabouts` from [[0005-bank-sync-system-role]]

## Context
#6 made visibility role-based. Families asked for choice: partners may share everything, or nothing ([[Feature - Sharing]]). Decided by Dinesh: default nothing until shared; teens see only their own; parents see kids automatically; viewers only what's shared.

## Options considered
1. A `shares` table and one SQL function that every policy calls.
2. Per-household "privacy mode" switches (all-or-nothing per household).
3. Enforce sharing only in the API.

## Decision
Option 1.

- `shares(household, owner, viewer, category)`. Categories: `balances`, `transactions`, `whereabouts`; `debts` joins with #27.
- `can_see_member_data(hid, owner, category)`: your own; else not if you're a teen or child; else yes if you're an owner or adult and the owner is a teen or child; else only if the owner shared that category with you (and `whereabouts` only together with `transactions`).
- Policies: `plaid_items` and `accounts` → `balances`; `transactions` → `transactions` via `can_see_account_data()` (so transactions can be shared without balances); `transaction_details` → `whereabouts`.
- `shares` RLS: you see rows you give or receive; you insert and delete only your own (`owner_user_id = auth.uid()`), never to a teen or child; foreign keys to `household_members` remove shares when someone leaves.
- Unlinking: `can_unlink()` = your own, or an owner for a teen's or child's. Used by the delete policy, `plaid_item_for_unlink` and the Unlink option.
- The API takes the sharer from the verified session only; a body with `owner_user_id` is rejected.

## Consequences
- **Behaviour change:** adults and viewers no longer see other adults' money by default. On `tallyn-dev` and in tests this is intended; there are no real users yet.
- All visibility runs through one function. Changes to it need review and the matrix tests in `internal/db/sharing_test.go`.
- Spending totals follow sharing automatically (they sum visible transactions).
- Transactions shared without balances show without their account name.
- Each policy check now runs a few small lookups; fine at family scale, worth indexing if households grow.
