---
type: spec
status: active
owner: Dinesh
updated: 2026-10-12
issue: 8
tags: [spec, plaid, security]
---

# Feature — Bank Linking (Plaid)

## Problem
Tallyn adds up a family's money, so people need to connect their banks and cards. A Plaid access token gives full read access to someone's bank data, so it must be protected like a password.

## Goal and success metric
An owner or adult connects a US bank through Plaid Link, sees its accounts and balances in Tallyn, and can disconnect it again. Success: no access token is ever stored, logged or sent to the browser in plain text, and disconnecting really revokes it at Plaid.

## User stories
- As a parent, I want to link my bank so that Tallyn can show my accounts.
- As a parent, I want to unlink a bank so that Tallyn (and Plaid) stop having access to it.
- As a child in a household, I see only my own accounts and can't link banks.
- As Tallyn, we want a database leak on its own to expose no bank access.

## Scope
**In:**
- Create a household (name and home currency), using `create_household()` from #6
- Link a bank with Plaid Link: **US banks only, Transactions**, plus Liabilities as an optional product where the bank has cards or loans (#27, [[0010-plaid-liabilities-for-credit-cards]])
- **Owners and adults link, only for themselves.** Teens and children can't link
- Save the item and its accounts with balances in minor units; the access token is encrypted first
- List the household's banks and accounts (RLS decides who sees what)
- Unlink: revoke at Plaid (`/item/remove`), then delete our copy and, by cascade, its accounts and transactions
- Unlink is allowed for the person who linked the bank, or a household owner
- **Reconnect** (#51): Plaid Link in update mode for a bank that needs sign-in, or to add APR and due dates for banks linked before Liabilities (`additional_consented_products`). Same people as Unlink; the access token is decrypted only for the Plaid call. Afterwards the bank syncs straight away and is set back to active

**Out:**
- Transactions and balance refresh (#9), Plaid webhooks (#9)
- Other countries, Investments, `auth` (account and routing numbers: never)
- Linking an account *for* a child (#12)
- Choosing between several households (#12); the app uses the first one for now
- Moving the encryption key to a cloud KMS (before launch, see Open questions)

## Design
Home shows **Create your household** until there is one, then **Banks and cards**: each bank with its accounts and current balances (Space Grotesk, tabular figures, `$4,210.00` style), an **Unlink** link where allowed, and a **Link a bank** button for owners and adults. Unlink asks for confirmation. Bare-bones until #25.

## Tech notes
Decisions and security reasoning: [[0004-plaid-token-encryption-and-link-path]].

| Route | Who | What |
|---|---|---|
| `POST /api/households` | any signed-in user | create a household, caller becomes owner |
| `POST /api/plaid/link-token` | owner/adult of the household | Plaid Link token (US, Transactions, opaque user ID) |
| `POST /api/plaid/exchange` | owner/adult of the household | exchange public token → fetch accounts → encrypt token → `link_plaid_item` |
| `GET /api/banks?household_id=` | members | banks and accounts, filtered by RLS |
| `DELETE /api/banks/{id}` | linker or owner | revoke at Plaid, then delete |

- **Encryption:** `internal/tokencrypt`, AES-256-GCM with `TOKEN_ENCRYPTION_KEY`, a fresh nonce per token, the Plaid item ID bound in as associated data, and a version byte.
- **Save path:** `migrations/0004_plaid_link.sql`. `link_plaid_item` and `plaid_item_for_unlink` run with elevated rights (`security definer`, fixed `search_path`), check the caller's role inside the database, and set the owner to `auth.uid()`.
- **No orphans:** if anything fails after the public token is exchanged, the backend revokes the new item at Plaid.
- **Unlink order:** Plaid first. If Plaid can't be reached the bank stays, so the token never stays valid at Plaid without a record on our side.
- **Money:** balances are parsed from Plaid's JSON as text and converted exactly to minor units (`internal/money`). Unofficial currencies (e.g. crypto) keep empty balances.
- Without `PLAID_CLIENT_ID` or `TOKEN_ENCRYPTION_KEY`, the Plaid routes answer `503`.

## Rollout
1. Run `0004_plaid_link.sql` on the dev Supabase project.
2. Plaid sandbox keys and a dev `TOKEN_ENCRYPTION_KEY` in `.env` (see [[Dev Setup]]).
3. Link a sandbox bank (`user_good` / `pass_good`), check accounts, unlink it.
4. Before production: Plaid production access, OAuth redirect URI (`PLAID_REDIRECT_URI`, needed by many big US banks), a separate prod key, ideally in a KMS.

## Open questions
- Move `TOKEN_ENCRYPTION_KEY` to a cloud KMS (envelope encryption) when hosting is chosen?
- How many days of transaction history to ask for (Plaid's default is 90)? Decided in #9.
- Audit log of link and unlink events: who connected or removed which bank, and when.
