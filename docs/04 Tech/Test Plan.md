---
type: spec
status: draft
owner: Dinesh
updated: 2026-10-25
issues: [111, 113]
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
  - **the launch bar** (agreed): every **P0** row is covered at the level the plan asks for, and the release checklist passes;
  - a manual release checklist covers the few things automation can't, such as a real bank and a real authenticator.

## Test levels
| Level | What it proves | Tools | Runs |
|---|---|---|---|
| **Unit** | One function or component, with no network or database. Rules, formatting, edge cases | Go `testing`; Vitest + Testing Library (jsdom) | Every PR |
| **Integration** | The API with a real Postgres: RLS, roles, SQL, handlers end to end with a test token | Go tests with `TALLYN_TEST_DATABASE_URL` (Postgres 16 in CI) | Every PR |
| **Layout** | Every page at phone, laptop and desktop width: no sideways scroll, no error, key parts really visible (#117) | Playwright (Chromium) against the production build, with fake data and a fake session (`web/e2e`) | Every PR |
| **Contract** | Our Plaid and Supabase code against recorded responses | Go `httptest` fakes (Plaid today) | Every PR |
| **Browser end-to-end** | A person's path through the real app: sign-in, 2FA, a page, a change | **Playwright** with a separate Supabase test project and the Plaid sandbox (#113) | Nightly, and before each release |
| **Manual** | What can't be automated safely: real email, a real authenticator app, a real bank, how it looks | Release checklist (below) | Before a release |

**Priority:**
- **P0:** money, privacy or security. Wrong totals, someone seeing what they shouldn't, sign-in bypassed.
- **P1:** a core flow broken.
- **P2:** polish.

**Coverage** below: **Yes** means tested at the level shown; **Partly** means some cases, or a lower level only; **No** means not tested; **Planned** means the row was written before the code (P0 rule) and its tests come with the feature.

## Use cases and coverage

### Sign-in and security (Feature - Auth, ADR 0003, 0011, 0012)
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Sign up, confirm email, agree to Terms | P1 | Yes | Yes | No | `SignIn.test.jsx` (8-character rule, notes), `ConsentGate.test.jsx` (asks, records the versions, agreed at sign-up, changed documents, can't check); `consent_test.go` |
| Sign in with password, then the 2FA code | P0 | Yes | Yes | Planned (#113) | `CodeForm.test.jsx`; `auth_test.go` (`aal2` required); `e2e-full/p0.spec.js` (sign in with password and 2FA code: a wrong code is refused) |
| Sign-in, sign-up, reset and 2FA errors use Tallyn’s words, never Supabase’s text; sign-up never reveals an existing account (#152) | P0 | Yes | — | — | `authErrors.test.js`, `SignIn.errors.test.jsx`, `SetUp2FA.test.jsx` (`says so calmly when setup can’t start`) |
| Set up 2FA (QR, then a code) | P0 | Yes | — | No (#113) | `SetUp2FA.test.jsx` (QR and key, half-finished setup cleared, backup codes next, after recovery), `CodeForm.test.jsx` |
| Every `/api/` route refuses no token, a bad token, no 2FA | P0 | — | Yes | — | `router_test.go` (`TestAPIRequiresAuth`), `auth_test.go` |
| Sign out after 30 minutes idle, warning at 29 (#91) | P1 | Yes | — | No | `idle.test.js`, `SignIn.test.jsx`, `IdleGuard.test.jsx` (warning, countdown, Stay, Esc, activity, after sleep) |
| Sign in again after 12 hours, enforced by the API (#92) | P0 | Yes | Yes | No | `session.test.js`, `SessionLimit.test.jsx`, `auth_test.go` |
| Automatic sign-outs end only this device; the Sign out button ends every session (#116) | P1 | Yes | — | No | `session.test.js` (`signOutHere`, `signOutEverywhere`), `App.test.jsx` (which one each part gets), `api.test.js` (`session_expired` signs out this device once, with the note), `Settings.test.jsx` (label) |
| Password reset, code before the new password (#22) | P0 | Yes | — | No | `recovery.test.js`, `ResetPassword.test.jsx`, `SignIn.test.jsx`, `Verify2FA.test.jsx` (PR #110); a real reset email is manual (release checklist) |
| Add a second authenticator; remove one, never the last; any of them gives a valid code (#23) | P0 | Yes | — | No (#113) | `Settings.test.jsx`, `mfa.test.js`, `Verify2FA.test.jsx` |
| Backup codes: 10 shown once after 2FA setup, stored hashed, each works once (#23) | P0 | Yes | Yes | — | `BackupCodes.test.jsx`; `api/backupcodes_test.go` (`TestNewBackupCodes`, `TestBackupCodeRoutes`); `db/backupcodes_test.go` (RLS, no hash readable) |
| Backup codes that can’t be made offer Try again, or ask for one more code when the last one was too long ago, never a dead end (#151) | P0 | Yes | — | No | `BackupCodes.test.jsx` (`making them fails`, `too long since the last code`) |
| 2FA code check that can’t reach Supabase says so, keeps the digits and doesn’t lock the form (#151) | P1 | Yes | — | — | `CodeForm.test.jsx`, `mfa.test.js`, `api.test.js` (status on errors) |
| Existing 2FA accounts asked once to save backup codes (#23) | P1 | Yes | — | No | `BackupCodes.test.jsx` (`BackupCodesGate`) |
| Regenerate backup codes needs a fresh 2FA code; old codes stop working (#23) | P0 | Yes | Yes | — | `Settings.test.jsx`; `TestBackupCodeRoutes` (step-up); `TestBackupCodes` (old set stops working) |
| Lost authenticator: password, then a backup code, then a new authenticator; never without a second factor (#23) | P0 | Yes | Yes | No (#113) | `BackupCodes.test.jsx` (`UseBackupCode`), `Verify2FA.test.jsx`; `TestRecoverWithBackupCode`, `TestVerifySignedIn`; a real recovery is manual (release checklist) |
| Backup-code tries are rate-limited and logged; a wrong code changes nothing (#23) | P0 | — | Yes | — | `TestRecoveryRateLimit`, `TestRecoverWithBackupCode`, `TestRecoveryFailsSafely` |
| The server key only removes authenticators, and never reaches the browser (#23) | P0 | Yes | Yes | — | `supabaseadmin_test.go` (only list and delete factors; errors never contain the key); `TestRecoveryUnavailableWithoutSetup`; ADR 0013 |
| Step-up 2FA for member changes (#38) | P0 | — | Yes | No | `members_test.go` (`TestMemberStepUp`) |
| Security headers, CSP, caching | P0 | — | Yes | No | `security_test.go` (`TestSecurityHeaders`) |
| Rate limits per user and per route | P1 | — | Yes | — | `security_test.go` (`TestLimiter`, `TestInviteAcceptRateLimit`) |
| Legal pages and consent versions match the documents | P1 | — | Yes | No | `consent_test.go` (`TestConsentVersionsMatchDocuments`) |
| Terms and Privacy reachable in the signed-in app: profile menu, ☰ menu on phones, new tab; no footer (#122) | P1 | Yes | — | No (#117) | `Shell.test.jsx`; sizes checked in the browser (#122 PR) |
| Redesign shell (#187): the rail starts collapsed without a saved choice, every page keeps its name (screen readers, hover and keyboard focus), the choice is remembered; glass Mix with solid fallbacks | P1 | Yes | — | No (#117) | `Shell.test.jsx`; look checked in `/preview.html` with the taste-skill inspector (light, phone) |
| Download your data: only your own rows (never accounts or transactions shared with you), no Plaid tokens, cursors, encrypted values or code hashes (#54) | P0 | Yes | Yes | No | `db/export_test.go` (`TestExportOnlyYours`, incl. your own goals only), `api/export_test.go` (`TestExportZip`) |
| Download your data needs a fresh 2FA code and is limited to 3 an hour (#54) | P0 | — | Yes | No | `api/export_test.go` (`TestExportNeedsFreshCode`, `TestExportRateLimit`) |
| Settings → Download your data asks for a code, then saves the ZIP (#54) | P1 | Yes | — | No | `Settings.test.jsx` (download) |
| Close your account: your banks removed at Plaid first, then everything of yours deleted; household budgets you made, other members’ data and kids’ banks stay; households you’re alone in close with you (#56) | P0 | Yes | Yes | No | `db/close_test.go` (`TestClosingAnAccount`, `TestClosingBanksAreOnlyYours`, `TestClosingTakesYourEmptyHousehold`), `api/close_test.go` (`TestCloseAccount`) |
| Closing refuses without a fresh code, a matching email, or another owner for a shared household; a Plaid failure stops before anything else is deleted; trying again finishes (#56) | P0 | Yes | Yes | No | `api/close_test.go` (`TestCloseAccountRefusals`, `TestCloseAccountStopsWhenPlaidFails`, `TestCloseAccountBankAlreadyGone`), `db/close_test.go` (`TestClosingNeedsAnotherOwner`) |
| The closing record holds only id, email hash, date and versions; the app can’t read or purge it; records over 3 years old are purged (#56) | P0 | — | Yes | — | `db/close_test.go` (`TestClosingAnAccount`, `TestClosingRecordsArePurged`) |
| Settings → Close account: type your email, fresh code, then the closed screen; the last owner is sent to Family (#56) | P1 | Yes | — | No | `Settings.test.jsx` (close account) |

### Households, family and sharing (ADR 0007, 0008, 0009)
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Create a household | P1 | — | Yes | No | `db/banks_test.go`, `api/banks_test.go` (`TestCreateHousehold`) |
| Rename a household: owners only; the name is trimmed, 1–80 characters, never blank; Settings shows Rename to owners only (#53) | P2 | Yes | Yes | No | `db/households_test.go` (`TestRenameHousehold`), `api/households_test.go`, `Settings.test.jsx` (rename) |
| One household's data never reaches another | P0 | — | Yes | No | `db_test.go` (`TestHouseholdIsolation`, `TestEveryTableHasRLS`) |
| Joining on a network error keeps the invite and offers Try again; a refused invite is cleared (#151) | P1 | Yes | — | — | `Join.test.jsx` |
| Invite, accept, refuse, revoke | P0 | — | Yes | Planned (#113) | `invites_test.go`, `members_test.go` (`TestInviteRoutes`); `e2e-full/p0.spec.js` (invite a member, who accepts: link from the Family page, joined in a second browser) |
| Change a member's role, remove a member | P0 | — | Yes | No | `invites_test.go` (`TestMemberManagement`), `members_test.go` |
| Sharing is the owner's choice, step by step | P0 | — | Yes | Planned (#113) | `sharing_test.go` (db: 7 tests; api: `TestSharingRoutes`); `e2e-full/p0.spec.js` (share balances with a member, then stop sharing: the member's Home shows it, then doesn't) |
| Leaving removes your shares | P0 | — | Yes | No | `sharing_test.go` (`TestLeavingRemovesShares`) |
| Family page and sharing screen | P1 | Yes | — | Planned (#113) | `FamilyPage.test.jsx` (switches save, transactions before time and location, failure reverts, owner-only actions, remove needs name and code, no sharing with teens) |

### Banks, sync and Plaid (ADR 0004, 0005, 0010)
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Connect a bank (link token, exchange) | P0 | Yes | Yes | Planned (#113) | `plaid_test.go`, `api/banks_test.go` (`TestLinkToken`, `TestExchange`); `e2e-full/p0.spec.js` (connect a sandbox bank through Plaid Link, then its accounts and transactions) |
| Plaid access tokens encrypted at rest | P0 | Yes | Yes | — | `tokencrypt_test.go`, `db/banks_test.go` |
| Reconnect a bank that needs attention | P1 | Yes | Yes | No | `api/banks_test.go` (`TestReconnect`), `sync_test.go` (`TestReconnected`) |
| Unlink a bank, and who may | P0 | — | Yes | No | `TestUnlink` (db, api), `TestUnlinkRules` |
| Scheduled sync: transactions, cards, loans; one bad bank doesn't stop the others | P1 | Yes | Yes | — | `sync_test.go` (9), `plaid/transactions_test.go`, `liabilities_test.go`, `system_test.go` |
| The sync login can't reach what it shouldn't | P0 | — | Yes | — | `logins_test.go`, `system_test.go` (`TestSyncRoleLimits`) |
| Connect a bank isn't blocked by the Plaid rate limit after normal browsing | P1 | Yes | — | No | `Banks.test.jsx` (#115: no token until clicked, one per click, closing Plaid and retrying, rate-limit message); fixed in [#115](https://github.com/Kolla1997/Tallyn/issues/115) |

### Money, transactions and debts
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| Amounts in minor units, any currency's decimals | P0 | Yes | — | — | `money_test.go`, `money.test.js` |
| Totals in the home currency, across currencies | P0 | Yes | Partly | Planned (#113), one currency | `HomePage.test.jsx`, `AccountsPage.test.jsx` (home currency, have − owe); `TestTransactionSummary`; `e2e-full/p0.spec.js` (Home shows the total in the home currency, matching the API's balances). Several currencies at once: not yet (#11) |
| Transactions: filters, paging, owner, logo, bank | P1 | Partly | Yes | Planned (#113), list only | `db/transactions_test.go` (7), `api/transactions_test.go`, `TransactionsPage.test.js`, `TransactionRow.test.jsx` |
| Summary: spent, money in, transfers left out | P0 | Yes | Yes | No | `TxSummary.test.jsx`, `TestTransactionSummary`, `TestSummaryRoute` |
| Home’s “spent this month” on the balance card comes from the month summary, so every transaction counts, not just recent ones (#147) | P0 | Yes | Yes (summary) | — | `HomePage.test.jsx` (`spent this month comes from the month summary`, `nothing spent this month`); `TestTransactionSummary` |
| Year of dots, keyboard included (#75, #98) | P2 | Yes | Yes | No | `SpendingDots.test.jsx`, `TestDailyAndDayFilter`, `TestDailyRoute` |
| Debts: grouping, credit cards, loans | P0 | Yes | Yes | No | `DebtsPage.test.js`, `cards.test.js`, `TestSaveCreditCards`, `TestSaveLoans`, `liabilities_test.go` |
| Budgets: who may set and see which budget (household; one person; owners and adults on teens and children; your own) (#13) | P0 | — | Yes | No (#113) | `db/budgets_test.go` (`TestBudgetRules`, `TestBudgetVisibility`, `TestChangingBudgets`) |
| Budgets count only opted-in members plus kids, as totals; nobody switches it on for someone else (#13, ADR 0014) | P0 | — | Yes | — | `TestBudgetCounting`, `TestOnlyYouChooseToCount` |
| Budget progress: spending only (no income, transfers, loan payments, refunds), this week or month, local date (#13) | P0 | Yes | Yes | — | `TestBudgetCounting`, `TestPeriodBounds`; `api/budgets_test.go` (`TestBudgetRoutes`) |
| Budget amounts typed as people write them: comma or point decimal, thousands separators, currency sign or code; ambiguous amounts (“1.250”) turned down (#146) | P0 | Yes | — | — | `lib/budgets.test.js` (`reads a comma decimal and other currencies`, `turns down amounts that could be read two ways`) |
| Budgets page: pace-line tiles for the household, notches for one person, add / edit / delete, count-my-spending switch; Budgets in the menu and phone tab bar, Goals in ☰ (#13) | P1 | Yes | — | Yes (#117 layout) | `lib/budgets.test.js` (period, pace, colours, running totals, amounts, whom you can set budgets for); `e2e/layout.spec.js` (Budgets) |
| Plan from your income: each bucket measures the right Plaid categories this month; a credit card bill never counts as debt; mortgage counts as Essentials (#133) | P1 | Yes | Yes | — | `db/plans_test.go`, `lib/plans.test.js`, `IncomePlan.test.jsx` (answer first) |
| Goals: who can see a goal (only me / me and one member / everyone); kids’ goals seen by owners and adults; teens and children don’t set up their own; nobody else sees them (#14) | P0 | — | Yes | — | `db/goals_test.go` (`TestGoalWhoSees`), `api/goals_test.go` |
| Goals never reveal a balance: a goal following an account shows progress and history only to people who may see that person’s balances, otherwise name and target only; the amount column isn’t readable; a goal follows only its own person’s account (#14) | P0 | — | Yes | No | `db/goals_test.go` (`TestGoalNeverRevealsABalance`, checked it fails without the rule) |
| Goal progress: follows an account’s balance or set by hand; monthly history (hand updates, daily snapshot); unlinking turns it into a hand goal; currency per goal; this month’s set-asides, forecast and next milestone; totals only in the home currency (#14) | P1 | Yes | Yes | Yes (#117 layout) | `db/goals_test.go` (`TestGoalByHandAndHistory`), `lib/goals.test.js`, `GoalsPage.test.jsx`, `MonthPicker.test.jsx`, `e2e/layout.spec.js` (Goals) |
| Plans follow the budget rules: household plans count opted-in members plus kids, as totals only; personal plans only their person; who may see and change them (#133) | P0 | — | Yes | — | `db/plans_test.go` |
| Income suggestion: average of the last 3 full months of pay-type income, no tax refunds or one-offs; always editable (#133) | P1 | Yes | Yes | — | `db/plans_test.go`, `IncomePlan.test.jsx` (suggests the income) |
| Templates 55/5/10/15/15, 50/30/20 and your own (shares add up to 100); the plan sits above category budgets (#133) | P1 | Yes | — | Yes (#117 layout) | `lib/plans.test.js` (incl. the template order whatever order the database returns), `IncomePlan.test.jsx`, `e2e/layout.spec.js` (Budgets with a plan) |
| Spending by category | P1 | — | Yes | No | `TestSpending`, `TestSpendingRoute` |
| Home page: balance, net worth, accounts, recent | P0 | Yes | Partly | No (#113) | `HomePage.test.jsx` (balance, net worth, Yours / Everyone, have and owe, biggest balances, shared with you, spending, who may link, empty, error) |
| Accounts page, bank cards, hidden balances | P1 | Yes | Yes | No | `AccountsPage.test.jsx` (columns by type, hidden balance as —, whose accounts, bank chips, status, Reconnect, Unlink); `TestBankHiddenWithoutBalances` |

### App-wide
| Use case | P | Unit | Integration | End-to-end | Tests today |
|---|---|---|---|---|---|
| SQL is always constant, never built from input | P0 | — | Yes | — | `sqlsafety_test.go` |
| Pages load on demand, and reload once after an update (#99) | P2 | No | — | No | — |
| Phone layout: no sideways scroll, nothing hidden (#97, #94) | P1 | — | — | Yes | `web/e2e/layout.spec.js` (#117): every page at 375, 1024 and 1440 px: no sideways scroll, no error, key parts really visible (size, on screen, not hidden by display, visibility or opacity); menus with Terms and Privacy; sign-in, 2FA, reset, legal pages. Fake data and session, every PR |
| A page that can’t load offers Try again (glass card); a reload that fails keeps the money on screen under a banner (#151) | P1 | Yes | — | No | `HomePage.test.jsx` (`a first load that fails offers Try again`, `a reload that fails keeps the money on screen`); other pages share `LoadFailed.jsx` |
| Keyboard and screen reader basics on every page: each screen names its tab, its heading takes focus when the screen or step changes, phone transaction details keep focus inside and return it (#153) | P1 | Partly | — | No | Dots, code boxes, sign-in notes; `Heading.test.jsx`, `takeover.test.jsx` (#153, part 1 of 3) |
| Settings: your name, legal links, Soon items | P2 | Yes | Yes | No | `Settings.test.jsx`; `TestSetMe`, `TestSharingRoutes`, `TestSharingScreenData` (80-character limit) |

## Scope
**In:**
- This plan, and keeping it current: every PR that adds a use case adds a row, or updates one.
- One ticket per gap, agreed with Dinesh first.
- Browser end-to-end tests: the tool, a test Supabase project, the Plaid sandbox, and CI.
- The release checklist.

**Out:**
- Writing all the missing tests here: each gap gets its own ticket.
- Load and penetration testing: separate tickets, closer to launch.

## Gap tickets (agreed 2026-10-12)
1. [#113](https://github.com/Kolla1997/Tallyn/issues/113) **Browser end-to-end tests** for the P0 paths: sign-in with 2FA, Home totals, connecting a sandbox bank, inviting a member, sharing. They use a separate Supabase test project, with keys in GitHub secrets and never in the repo. **Written (2026-10-23)** in `web/e2e-full/`, nightly (`.github/workflows/e2e.yml`); the rows say **Planned (#113)** until the first green run against the test project.
2. [#114](https://github.com/Kolla1997/Tallyn/issues/114) **Tests for the untested screens:** Home, Accounts, Family and sharing, Settings, ConsentGate, IdleGuard, SetUp2FA. Plus a `PUT /api/me` handler test. **Done (2026-10-16).** `PUT /api/me` already had a success test; #114 added its failure cases.
3. [#115](https://github.com/Kolla1997/Tallyn/issues/115) **Fix the Plaid link-token bug** (ask only on Connect a bank), with a test.
4. [#116](https://github.com/Kolla1997/Tallyn/issues/116) **Automatic sign-outs end only this device:** tests for `scope: 'local'`. **Done (2026-10-16).**
5. [#117](https://github.com/Kolla1997/Tallyn/issues/117) **Layout checks in the browser:** phone and desktop width, no sideways scroll, no hidden content. These would have caught #94 and #97. **Done (2026-10-16):** runs on every PR with fake data, so it doesn't wait for #113.

## Release checklist (manual, before each release)
- [ ] Sign up with a new email, confirm it, set up 2FA with a real authenticator app.
- [ ] Sign in with the code; reset the password from a real email (#22).
- [ ] **Second authenticator (#23):** Settings → Sign-in and security → **+ Add another**: a name, scan the QR code, enter its code. Sign out and in with a code from the new one, then **Remove** it (asks for a fresh code). Your last one can't be removed.
- [ ] **Backup codes (#23):** Settings → Sign-in and security → **Get codes** (asks for a fresh 2FA code). Ten codes show once; Copy, Download and Print work; tick "I've saved these codes" to continue. Settings then shows "10 of 10 left".
- [ ] **Recover with a backup code (#23)**, with your phone to hand, because this removes your authenticator: sign out → sign in with your password → "Can't get a code?" → **Use a backup code** → enter one code → "You're in with a backup code" → set up your authenticator again → save the **new** set of codes. Then check: the used code no longer works, Settings shows "10 of 10 left", and the "MFA method added" email arrives.
- [ ] Connect a Plaid sandbox bank; see accounts, transactions, cards and loans.
- [ ] Invite a second account, accept, change the role, share and unshare an account.
- [ ] Home totals match the bank sandbox's balances in the home currency.
- [ ] Wait 30 minutes idle: the warning, then the sign-out note.
- [ ] Phone (375px) and desktop: every page, no sideways scroll.
- [ ] Production build: security headers present, fonts are WOFF2, pages load on demand.

## Open questions
None at the moment. New ones go here as `> [!todo]` callouts.

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | Browser end-to-end tests run nightly and before each release, not on every PR | Dinesh: cheaper and faster PRs; unit and integration tests still run on every PR (#111) |
| 2026-10-12 | A separate Supabase project for automated tests | Dinesh: tests never touch tallyn-dev's real sign-ins or data (#111, #113) |
| 2026-10-23 | End-to-end tests make fresh test people each run (with 2FA set up then) and delete them after, instead of one seeded user with a stored TOTP secret | No authenticator secret kept anywhere, and no test depends on another (#113) |
| 2026-10-23 | Connecting a bank goes through the real Plaid Link sandbox screen; other tests link a bank through Plaid's sandbox API to save time | Dinesh picked A: test what people do; fall back to the API if Link proves flaky (#113) |
| 2026-10-12 | Launch bar: every P0 row covered at its level, and the release checklist passed | Dinesh (#111) |
| 2026-10-12 | Every feature and bug-fix PR updates this plan and adds its tests (CLAUDE.md §5) | Dinesh: so the plan never falls out of date and gaps can't hide again (#111) |
