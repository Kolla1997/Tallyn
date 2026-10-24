---
type: spec
status: active
owner: Dinesh
updated: 2026-10-24
issue: 54
tags: [spec, privacy]
---

# Feature — Download your data

## Problem
The Privacy Policy (§8) says people can ask for a copy of their data by writing to us. That's slow for them and manual for us, and Settings → Your data shows "Coming soon".

## Goal and success metric
Anyone can download everything Tallyn holds about them from Settings, in one step, without writing to us. Success: no copy-of-my-data requests need handling by hand.

## User stories
- As an account holder, I want a copy of my Tallyn data so that I can keep it, check it or take it elsewhere.
- As a parent who shares with my partner, I want my download to hold only my own money, so that their accounts never leave Tallyn in my file.

## Scope
**In** (agreed with Dinesh, 2026-10-24):
- Your profile (name, email, when you joined) and the households you're in (name, home currency, your role, when you joined)
- Your banks (institution, status, linked and last-synced dates) and accounts (name, type, last 4 digits, currency, balances)
- Your transactions, with their time and place; your card and loan details
- Budgets you made, your "count my spending" choice per household
- Who you share with and what (by their display name)
- Your Terms and Privacy agreements (versions and dates)
- Backup codes: how many are left and when they were made

**Out:**
- Other people's accounts, transactions and balances, even if shared with you
- Invites you sent (they hold other people's email addresses)
- Plaid access tokens, sync cursors, any encrypted value, backup-code hashes
- App-wide tables (exchange rates)
- Emailing a link instead of downloading (needs #55)

## Design
Settings → Your data → **Download your data**: the "Coming soon" tag becomes a **Download** button. It opens the existing confirm dialog ([[UI Patterns]]), which asks for a fresh 6-digit code, then saves `tallyn-data-YYYY-MM-DD.zip`. No new visual pattern, so no draft (Dinesh, 2026-10-24).

The ZIP holds:
- `tallyn-data.json`: everything above, amounts in minor units with their currency
- `transactions.csv`: one row per transaction, amounts as decimals, for spreadsheets
- `README.txt`: what each file and field means

## Tech notes
- `GET /api/me/export` reads everything **as the person** (`AsUser`, RLS on) and filters to rows they own (`owner_user_id`, `created_by`, `user_id`), so shared-with-you rows can't slip in even though RLS lets them be read.
- Needs a 2FA code from the last few minutes (`reauth_required` otherwise), like removing a member (#38).
- Rate-limited: 3 downloads an hour per person. The log records counts only, never contents.
- Built with Go's `archive/zip`; no new dependency.
- Tests: [[Test Plan]] rows under Sign-in and security.

## Rollout
Ships to everyone at once; nothing to migrate. The Privacy Policy stays as it is for now (a change bumps its version and asks everyone to agree again). Mentioning the in-app download goes on the list for the lawyer review (#36).

## Open questions
> [!todo] Whether state privacy laws need anything more than this download (e.g. a 45-day answer for emailed requests) — part of the lawyer review (#36).
