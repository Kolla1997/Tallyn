---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-30
issue: 120
tags: [adr, security, backend]
---

# 0018 — An owner resets a teen's two-step sign-in

- **Status:** Proposed
- **Date:** 2026-10-30
- **Ticket:** #120
- **Builds on:** [[0009-step-up-2fa-for-member-changes]], [[0013-backup-codes-and-supabase-admin-key]]

## Context
Teens rarely keep backup codes (#23), so a lost phone locks them out. Dinesh agreed the rules on 2026-10-30: only an owner, only for a teen in the same household, after a fresh 2FA code and the teen's name typed out. One owner is enough. The teen keeps their password, is emailed, and sees who reset it at their next sign-in.

## Options considered
- **A. The server removes the teen's authenticators with the ADR 0013 key** (chosen). Same narrow key, which can only list and delete factors; a new trigger for it.
- **B. Send the teen a recovery link instead.** Needs email the teen may not check and a new flow; no simpler.

## Decision
Option A. `POST /api/households/{id}/members/{user}/reset-2fa` needs a fresh code (step-up). The database function `reset_member_2fa` checks the rules, writes the record to `twofa_resets` and removes the teen's backup codes; the API then removes the authenticators inside the same transaction, so a failure at Supabase changes nothing. Refusals all look the same. `twofa_resets` has no policies: only the functions touch it. `GET /api/recovery/2fa-reset`, reachable with only a password like the backup-code route, tells the teen who reset it (their own, the last 30 days).

## Consequences
- The ADR 0013 key now has two triggers: a backup code, and an owner's reset. It still can't do anything else.
- An owner can lock a teen out of the app until the teen sets up a new authenticator; that's the point, and the record says who did it.
- The "MFA method removed" email depends on Supabase's security notifications being switched on in the dashboard.
