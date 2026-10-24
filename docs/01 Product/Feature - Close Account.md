---
type: spec
status: active
owner: Dinesh
updated: 2026-10-24
issue: 56
tags: [spec, privacy]
---

# Feature — Close your Tallyn account

## Problem
Settings → Leave or close shows "Close account" as coming soon. People must be able to close their account themselves (Privacy Policy §6, §8).

## Goal and success metric
Anyone can close their account from Settings in one sitting, and nothing of theirs is left behind except the minimal closing record. Success: no closing requests need handling by hand.

## User stories
- As someone leaving Tallyn, I want to close my account so that my banks are disconnected and my data is deleted.
- As the other owner of a household, I want the household and its budgets to carry on when my partner closes their account.

## Scope
**In** (agreed with Dinesh, 2026-10-24):
- Your banks unlinked at Plaid, then your accounts, transactions, memberships, shares, consents, backup codes and budgets for you deleted, then your sign-in
- Households where you're the only member close with you
- Household budgets you made stay for the others
- A closing record kept 3 years: user id, a keyed hash of your email, when, Terms/Privacy versions ([[0015-closing-an-account]])
- Typed confirmation (your email) plus a fresh 2FA code
- A "Download your data first" link to [[Feature - Your Data]]

**Out:**
- Closing someone else's account (a parent closing a kid's)
- Closing a whole household with other people in it: hand ownership over or remove them first
- An undo or grace period

## Design
Settings → Leave or close → **Close account** opens the existing confirm dialog: what goes, the download link, type your email, then a fresh 6-digit code. Then a "Your account is closed" card on the sign-in page. No new visual pattern, so no draft (Dinesh, 2026-10-24).

If you're the only owner of a household with others in it, the dialog says so and links to Family instead of closing.

## Tech notes
See [[0015-closing-an-account]] for the steps, the record and the 3-year purge. Tests: [[Test Plan]] rows under Sign-in and security.

## Rollout
Ships to everyone at once. Migration 0016 runs first. The Privacy Policy keeps its current text until the lawyer review (#36) adds the 3-year record and backup retention; Tallyn isn't public yet.

## Open questions
> [!todo] How long Supabase's backups and logs keep deleted data on our plan, for the Privacy Policy (#36).
