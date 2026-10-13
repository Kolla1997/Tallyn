---
type: spec
status: draft
owner: Dinesh
updated: 2026-10-12
issue: 111
tags: [spec, tech, testing]
---

# Test Plan

> [!warning] Keep this plan current (rule, 2026-10-12)
> Every ticket that adds or changes a feature, and every bug fix, updates this plan **in the same PR**:
> - add or update its rows (priority, coverage, test names);
> - write the tests at the level asked for (for a bug, a test that would have caught it);
> - list what can't be tested yet as a gap, and manual-only checks in the release checklist.
>
> For P0 features, write the rows when the scope is agreed, before the code. The PR description says which rows changed. See CLAUDE.md §5.

## Problem
Tallyn has a solid base of tests, but nothing says which use cases they cover and which they don't. Gaps get found by chance. For example, the hidden category legend (#94) was only caught by looking at the screen.

**What exists on `main` (2026-10-12):**
- **Go:** 22 test files. Database tests run against a real Postgres when `TALLYN_TEST_DATABASE_URL` is set, and are skipped otherwise.
- **Web:** 12 Vitest files with 43 tests (jsdom).
- **CI:** every PR runs both, Postgres included (`.github/workflows/checks.yml`, #100).
- **No browser end-to-end tests.**

## Goal and success metric
- **One plan** that maps every use case to the tests that prove it, at the right level, with a ticket for each gap.
- **Success:**
  - every row below is either covered, or has a ticket;
  - before launch, every **P0** row is covered at the level the plan asks for;
  - a manual release checklist covers the few things automation can't, such as a real bank and a real authenticator.

## Test levels
| Level | What it proves | Tools | Runs |
|---|---|---|---|
| **Unit** | One function or component, with no network or database. Rules, formatting, edge cases | Go `testing`; Vitest + Testing Library (jsdom) | Every PR |
| **Integration** | The API with a real Postgres: RLS, roles, SQL, handlers end to end with a test token | Go tests with `TALLYN_TEST_DATABASE_URL` (Postgres 16 in CI) | Every PR |
| **Contract** | Our Plaid and Supabase code against recorded responses | Go `httptest` fakes (Plaid today) | Every PR |
| **Browser end-to-end** | A person's path through the real app: sign-in, 2FA, a page, a change | Proposed: **Playwright** with a test Supabase project and the Plaid sandbox | Proposed: nightly, and before a release |
| **Manual** | What can't be automated safely: real email, a real authenticator app, a real bank, how it looks | Release checklist (below) | Before a release |

**Priority:**
- **P0:** money, privacy or security. Wrong totals, someone seeing what they shouldn't, sign-in bypassed.
- **P1:** a core flow broken.
- **P2:** polish.

**Coverage** below: **Yes** means tested at the level shown; **Partly** means some cases, or a lower level only; **No** means not tested.

## Use cases and coverage

### Sign-in and security (Feature - Auth, ADR 0003, 0011, 0012)
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Sign up, confirm email, agree to Terms | P1 | Partly | — | No | `SignIn.test.jsx` (notes only); consent API in `consent_test.go` |
| Sign in with password, then the 2FA code | P0 | Yes | Yes | No | `CodeForm.test.jsx`; `auth_test.go` (`aal2` required) |
| Set up 2FA (QR, then a code) | P0 | Partly | — | No | `CodeForm.test.jsx`; the screen itself isn't tested |
| Every `/api/` route refuses no token, a bad token, no 2FA | P0 | — | Yes | — | `router_test.go` (`TestAPIRequiresAuth`), `auth_test.go` |
| Sign out after 30 minutes idle, warning at 29 (#91) | P1 | Yes | — | No | `idle.test.js`, `SignIn.test.jsx`; the `IdleGuard` dialog isn't tested |
| Sign in again after 12 hours, enforced by the API (#92) | P0 | Yes | Yes | No | `session.test.js`, `SessionLimit.test.jsx`, `auth_test.go` |
| Automatic sign-outs end only this device | P1 | No | — | No | — |
| Password reset, code before the new password (#22) | P0 | Yes | — | No | `recovery.test.js`, `ResetPassword.test.jsx`, `SignIn.test.jsx`, `Verify2FA.test.jsx` (PR #110); a real reset email is manual (release checklist) |
| Step-up 2FA for member changes (#38) | P0 | — | Yes | No | `members_test.go` (`TestMemberStepUp`) |
| Security headers, CSP, caching | P0 | — | Yes | No | `security_test.go` (`TestSecurityHeaders`) |
| Rate limits per user and per route | P1 | — | Yes | — | `security_test.go` (`TestLimiter`, `TestInviteAcceptRateLimit`) |
| Legal pages and consent versions match the documents | P1 | — | Yes | No | `consent_test.go` (`TestConsentVersionsMatchDocuments`) |

### Households, family and sharing (ADR 0007, 0008, 0009)
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Create a household | P1 | — | Yes | No | `db/banks_test.go`, `api/banks_test.go` (`TestCreateHousehold`) |
| One household's data never reaches another | P0 | — | Yes | No | `db_test.go` (`TestHouseholdIsolation`, `TestEveryTableHasRLS`) |
| Invite, accept, refuse, revoke | P0 | — | Yes | No | `invites_test.go`, `members_test.go` (`TestInviteRoutes`) |
| Change a member's role, remove a member | P0 | — | Yes | No | `invites_test.go` (`TestMemberManagement`), `members_test.go` |
| Sharing is the owner's choice, step by step | P0 | — | Yes | No | `sharing_test.go` (db: 7 tests; api: `TestSharingRoutes`) |
| Leaving removes your shares | P0 | — | Yes | No | `sharing_test.go` (`TestLeavingRemovesShares`) |
| Family page and sharing screen | P1 | No | — | No | — |

### Banks, sync and Plaid (ADR 0004, 0005, 0010)
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Connect a bank (link token, exchange) | P0 | Yes | Yes | No | `plaid_test.go`, `api/banks_test.go` (`TestLinkToken`, `TestExchange`) |
| Plaid access tokens encrypted at rest | P0 | Yes | Yes | — | `tokencrypt_test.go`, `db/banks_test.go` |
| Reconnect a bank that needs attention | P1 | Yes | Yes | No | `api/banks_test.go` (`TestReconnect`), `sync_test.go` (`TestReconnected`) |
| Unlink a bank, and who may | P0 | — | Yes | No | `TestUnlink` (db, api), `TestUnlinkRules` |
| Scheduled sync: transactions, cards, loans; one bad bank doesn't stop the others | P1 | Yes | Yes | — | `sync_test.go` (9), `plaid/transactions_test.go`, `liabilities_test.go`, `system_test.go` |
| The sync login can't reach what it shouldn't | P0 | — | Yes | — | `logins_test.go`, `system_test.go` (`TestSyncRoleLimits`) |
| Connect a bank isn't blocked by the Plaid rate limit after normal browsing | P1 | No | No | No | **Known bug**: pages ask for a link token on every visit (found in #99) |

### Money, transactions and debts
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Amounts in minor units, any currency's decimals | P0 | Yes | — | — | `money_test.go`, `money.test.js` |
| Totals in the home currency, across currencies | P0 | Partly | Partly | No | `TestTransactionSummary`; Home's totals aren't tested |
| Transactions: filters, paging, owner, logo, bank | P1 | Partly | Yes | No | `db/transactions_test.go` (7), `api/transactions_test.go`, `TransactionsPage.test.js`, `TransactionRow.test.jsx` |
| Summary: spent, money in, transfers left out | P0 | Yes | Yes | No | `TxSummary.test.jsx`, `TestTransactionSummary`, `TestSummaryRoute` |
| Year of dots, keyboard included (#75, #98) | P2 | Yes | Yes | No | `SpendingDots.test.jsx`, `TestDailyAndDayFilter`, `TestDailyRoute` |
| Debts: grouping, credit cards, loans | P0 | Yes | Yes | No | `DebtsPage.test.js`, `cards.test.js`, `TestSaveCreditCards`, `TestSaveLoans`, `liabilities_test.go` |
| Spending by category | P1 | — | Yes | No | `TestSpending`, `TestSpendingRoute` |
| Home page: balance, net worth, accounts, recent | P0 | No | Partly | No | API only (`TestMe`, routes); `HomePage.jsx` isn't tested |
| Accounts page, bank cards, hidden balances | P1 | No | Yes | No | `TestBankHiddenWithoutBalances`; the page isn't tested |

### App-wide
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| SQL is always constant, never built from input | P0 | — | Yes | — | `sqlsafety_test.go` |
| Pages load on demand, and reload once after an update (#99) | P2 | No | — | No | — |
| Phone layout: no sideways scroll, nothing hidden (#97, #94) | P1 | No | — | No | Checked by hand in each PR |
| Keyboard and screen reader basics on every page | P1 | Partly | — | No | Dots, code boxes, sign-in notes |
| Settings: your name, legal links, Soon items | P2 | No | No | No | Saving your name (`PUT /api/me`) isn't tested; `TestMe` covers only `GET` |

## Scope
**In:**
- This plan, and keeping it current: every PR that adds a use case adds a row, or updates one.
- One ticket per gap, agreed with Dinesh first.
- Browser end-to-end tests: the tool, a test Supabase project, the Plaid sandbox, and CI.
- The release checklist.

**Out:**
- Writing all the missing tests here: each gap gets its own ticket.
- Load and penetration testing: separate tickets, closer to launch.

## Proposed gap tickets (to agree before creating)
1. **Browser end-to-end tests (Playwright)** for the P0 paths: sign-in with 2FA, Home totals, connecting a sandbox bank, inviting a member, sharing. This needs a test Supabase project with a seeded test user and a test TOTP secret, kept in CI secrets and never in the repo.
2. **Component tests for the untested screens:** Home, Accounts, Family and sharing, Settings, ConsentGate, IdleGuard, SetUp2FA. Add a `PUT /api/me` handler test.
3. **Fix the Plaid link-token bug** (ask only on Connect a bank), with a test.
4. **Automatic sign-outs end only this device:** a test that `IdleGuard` and `SessionLimit` use `scope: 'local'`.
5. **Layout checks in the browser:** phone and desktop width, no sideways scroll, no hidden content. These would have caught #94 and #97.

## Release checklist (manual, before each release)
- [ ] Sign up with a new email, confirm it, set up 2FA with a real authenticator app.
- [ ] Sign in with the code; reset the password from a real email (#22).
- [ ] Connect a Plaid sandbox bank; see accounts, transactions, cards and loans.
- [ ] Invite a second account, accept, change the role, share and unshare an account.
- [ ] Home totals match the bank sandbox's balances in the home currency.
- [ ] Wait 30 minutes idle: the warning, then the sign-out note.
- [ ] Phone (375px) and desktop: every page, no sideways scroll.
- [ ] Production build: security headers present, fonts are WOFF2, pages load on demand.

## Open questions
> [!todo] Ask Dinesh
> - Browser end-to-end tests in CI on every PR, or nightly plus before releases? Every PR is safer but slower. Nightly is cheaper.
> - What coverage counts as good enough to launch? Proposed: every P0 row covered at its level, and the release checklist passed.
> - A separate Supabase project for automated tests (the free plan allows two active projects, so check how many are in use), or reuse tallyn-dev?

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | Every feature and bug-fix PR updates this plan and adds its tests (CLAUDE.md §5) | Dinesh: so the plan never falls out of date and gaps can't hide again (#111) |
