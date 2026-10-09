---
type: spec
status: active
owner: Dinesh
updated: 2026-10-09
issue: 28
tags: [spec, privacy, sharing]
---

# Feature — Sharing settings

## Problem
Families share money differently. Partners may want to see each other's every detail; others want privacy. Until #28, visibility was fixed by role: owners, adults and viewers automatically saw every member's banks and transactions.

## Goal and success metric
Each person decides who sees their money, and how much. Success: nobody sees another adult's money unless that adult chose to share it, and the database (not just the app) enforces it.

## User stories
- As a partner, I want to share my balances and transactions with my partner, so we see our money together.
- As a partner, I want to keep where and when I spend private, even while sharing transactions.
- As a parent, I want to see my teens' and children's money without them having to share it.
- As a teen, I see only my own money.
- As anyone, I can change or stop sharing at any time, and it takes effect straight away.

## Scope
**In:** per-member sharing of three categories; the Sharing screen; display names; the new visibility rule in the database; new unlink rule.

**Out:** debts (added to sharing with #27); invitations to join a household (#12); notifications when someone shares with you.

## The rules (decided 2026-10-09)
| Who | Sees |
|---|---|
| Everyone | Their own money, everything |
| Owners and adults | Their teens' and children's money automatically: balances, transactions, time and location |
| Owners, adults, viewers | Another adult's or viewer's money **only if that person shared it** (default: nothing) |
| Teens and children | Only their own money, whatever is shared with them. They aren't shown what parents can see |

| Category | What it shows |
|---|---|
| **Balances** | Banks, accounts, balances |
| **Transactions** | Transactions (merchant, amount, date, category); counted in the viewer's spending view |
| **Time and location** | When and where purchases happened. Only together with Transactions |

- Only the person whose money it is can share it, and only with members of the same household who aren't teens or children.
- Leaving a household removes every share to and from that person.
- **Unlinking:** you unlink your own banks; owners can also unlink teens' and children's. Seeing a shared bank never lets you unlink it.

## Design
Home → **Sharing**: your display name; one box per family member with three switches (Time and location greyed out until Transactions is on); **Shared with you**. Teens and children only see members they can share with (viewers), and no note about parental access.

## Tech notes
[[0007-consent-based-visibility]]. `migrations/0007_sharing.sql`: `shares` table, `can_see_member_data(household, owner, category)` used by every bank, account, transaction and location policy; `can_unlink()`. `GET/PUT /api/sharing`, `PUT /api/me`.

## Rollout
Run 0007 on `tallyn-dev`. Testing with two people needs a second account added to the household by hand until invitations (#12).

## Open questions
- Should people be notified when someone starts or stops sharing with them?
- Should owners be able to see that a partner shares nothing (just the fact, not the data)?
