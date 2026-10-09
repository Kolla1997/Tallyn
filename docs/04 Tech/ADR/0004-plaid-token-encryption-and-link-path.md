---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-08
issue: 8
tags: [adr, security, plaid, database]
---

# 0004 — Plaid tokens are encrypted in Go, and linking writes through checked database functions

- **Status:** Proposed
- **Date:** 2026-10-08
- **Ticket:** #8

## Context
A Plaid access token gives read access to a person's bank data until it's revoked. Tallyn must store it to sync transactions (#9). [[0002-backend-database-access]] says users can't write bank tables and request handlers only use `AsUser`, but linking a bank is a user action. See [[Feature - Bank Linking]].

## Options considered
**Encryption**
1. AES-256-GCM in the Go backend, key in an environment secret (`TOKEN_ENCRYPTION_KEY`).
2. Supabase Vault / pgsodium: encryption inside the database.
3. A cloud KMS (envelope encryption).

**Writing a linked bank**
1. `security definer` SQL functions, called through `AsUser`, that check the caller's role inside the database.
2. A Go system role, used by the link handler after a Go-only permission check.

## Decision
Encryption option 1 now, with option 3 as the target before launch. Write option 1.

- **AES-256-GCM** (`internal/tokencrypt`): a random 96-bit nonce per token, the Plaid item ID as associated data (a ciphertext moved to another row won't decrypt), and a leading version byte so keys can be rotated.
- **Key handling:** 32 random bytes, base64. Separate keys for dev and prod. Kept only in a password manager and the host's secret store, never in git, chat, logs or `.env.example`. A malformed key stops the server at startup.
- **Plain text only in memory:** between Plaid and `Seal` when linking, and between `Open` and Plaid when unlinking. Never logged, never in errors, never sent to the browser.
- **`link_plaid_item`** checks that the caller is an owner or adult of the household and sets `owner_user_id = auth.uid()` itself. It validates every input and is callable only by `authenticated`. **`plaid_item_for_unlink`** returns the ciphertext only to the linker or a household owner, and returns nothing (not an error) otherwise.
- **Least data:** US only, Transactions only, an opaque user ID for Plaid, and only the account mask (never full numbers).
- **Unlinking revokes at Plaid first**, then deletes our row. If saving a new link fails, the backend revokes the item at Plaid straight away.
- The bank sync (#9) has no user, so it still gets the separate system role from ADR 0002. These functions aren't for it.

## Consequences
- A database leak alone exposes no usable tokens: the key lives elsewhere. A leak of the key **and** the database exposes every token, which is why the key should move to a KMS.
- **Losing the key means every family must re-link their banks.** It must be backed up.
- Who may link is enforced twice: in Go (before calling Plaid) and in the database (inside `link_plaid_item`). A handler bug can't attach a bank to someone else's household.
- `security definer` functions bypass RLS, so every change to them needs careful review and tests (`internal/db/banks_test.go`).
- Key rotation later: add version 2, re-encrypt tokens in a one-off job, keep version 1 readable until done.
- The Content-Security-Policy work (#24) must allow Plaid Link (`cdn.plaid.com`).
