---
type: adr
status: active
owner: Dinesh
updated: 2026-10-24
issue: 56
tags: [adr, privacy, security]
---

# 0015 — Closing an account, and the record kept afterwards

- **Status:** Accepted (Dinesh, 2026-10-24)
- **Date:** 2026-10-24
- **Ticket:** #56

## Context
People must be able to close their Tallyn account (Privacy Policy §6 and §8). Their data hangs off their Supabase sign-in: deleting `auth.users` cascades to the profile, banks, accounts, transactions, memberships, shares, consents, backup codes and budgets made for them. Three things needed deciding:
- The bank's access at Plaid must be revoked, not just our copy deleted.
- Household budgets a person made were deleted with them, for everyone in the household.
- What, if anything, to keep after closing (the ticket said to ask first).

## Options considered
1. **Keep nothing.** Simplest; but no proof of what someone agreed to, or that their deletion was done.
2. **Keep a minimal record** (Dinesh chose this, 2026-10-24): user id, a keyed hash of the email, when, and the Terms and Privacy versions agreed to. For proof of consent and of the deletion. Kept **3 years** (the CCPA's minimum for request records is 24 months; most US states allow 3–6 years for contract claims).

## Decision
- **`POST /api/me/close`**, in order, stopping at the first problem:
  1. A 2FA code from the last few minutes (ADR 0009) and the typed email matching the sign-in.
  2. Not the only owner of a household that has other people in it (`account_closing_blocker()`): hand ownership over first.
  3. Each bank the person linked themselves is removed at Plaid, then deleted. A bank Plaid already lost counts as removed. Kids' banks an owner manages stay with the kid.
  4. `prepare_account_closing()` writes the record and deletes households where they're the only member.
  5. The Supabase sign-in is deleted with the server-only key. The database deletes the rest by cascade.
  Steps 3–5 can run again, so a closing that fails part-way finishes when tried again.
- **The server-only Supabase key** ([[0013-backup-codes-and-supabase-admin-key]]) gets a second job: deleting a sign-in. Still never used for the database, never in the browser.
- **Household budgets outlive their creator** (migration 0016): `created_by` is set to empty instead of deleting the budget. Budgets made *for* the person still go.
- **`closed_accounts`**: no row-level policies, so the app's login can't read it. Written only by `prepare_account_closing()`. The email is hashed with a key derived from `TOKEN_ENCRYPTION_KEY` (never stored in plain text, can't be reversed by guessing). The bank sync's login purges records older than `db.ClosingRecordsKept` (3 years) daily.

## Consequences
- Closing needs Plaid, the token key and the server-only Supabase key configured; without them it answers 503.
- The daily purge runs only where the bank sync runs (`DATABASE_URL_SYNC`).
- Supabase's own backups and logs keep deleted data for a while; the Privacy Policy must say so, and name the 3-year record, before launch. Both are on the lawyer review list (#36), which may change the 3 years in one place (`db.ClosingRecordsKept`).
- Rotating `TOKEN_ENCRYPTION_KEY` changes the email hash key, so older records can't be matched by email after a rotation.
