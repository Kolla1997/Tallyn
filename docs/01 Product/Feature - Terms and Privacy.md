---
type: spec
status: draft
owner: Dinesh
updated: 2026-10-11
issue: 36
tags: [spec, legal]
---

# Feature — Terms and Privacy

> [!warning] Not legal advice
> The documents in `legal/` were drafted by Claude from what Tallyn actually does. A lawyer must review them, and every `[TO CONFIRM]` must be filled in, before any real user signs up.

## Problem
Tallyn handles families' bank data. Before anyone real signs up, it needs a Terms of Service and a Privacy Policy, people must agree to them, and rules already decided (no children under 13, read-only, consent-based sharing) must be written down for users.

## Goal and success metric
Every person using Tallyn has agreed to the current versions of both documents, and we can show which version and when.

## User stories
- As someone signing up, I want to read the terms and privacy policy and agree before my account is made.
- As an existing user, I want to be asked again, clearly, when the terms change.
- As anyone, I want to read the documents without signing in.

## Scope
**In:**
- `legal/terms.md` and `legal/privacy.md`: the documents, with a `version` and `effective` date in their frontmatter. Draft `0.1-draft`
- Public pages `/terms` and `/privacy` built from those files, with a "Draft, not yet in effect" banner until the lawyer signs off
- Consent: a required "I agree" at sign-up, and a "Before you start" step after sign-in for anyone who hasn't agreed to the current versions
- `migrations/0010_consents.sql`: one row per person, document and version; you can only add and read your own; the database sets the time; rows can't be changed or deleted
- API: `GET /api/consent` (current versions and whether you still need to agree), `POST /api/consent` (agree; refused with `version_changed` if the versions you saw are old)

**Out:** cookie banner (Tallyn sets no tracking cookies), GLBA notice (only if the lawyer says it's needed), closing an account (#56), data download (#54).

## Design
The pages, the sign-up checkbox and the "Before you start" step get drafts for Dinesh to pick from before they're built (CLAUDE.md §0).

## Tech notes
- `internal/api/consent.go` holds `CurrentVersions`. A test fails if it doesn't match the versions in `legal/*.md`, so the text and what people agree to can't drift apart.
- Publishing a new version: edit the document, bump `version` and `effective` in its frontmatter and in `CurrentVersions`. Everyone is asked again at their next sign-in.
- Agreeing is checked in the app, not in every API call. The record is server-side and can't be backdated.

## Rollout
1. Lawyer review; fill in every `[TO CONFIRM]`; version `1.0`, remove the draft banner.
2. Run migration 0010 on each environment.
3. Publish before the first real (non-test) user.

## Open questions (for Dinesh or the lawyer)
> [!todo] Unknown — ask Dinesh
> - Legal entity name, state of registration and postal address
> - Contact email for privacy and legal questions
> - Governing law, and courts or arbitration for disputes (and whether to have an arbitration clause or class-action waiver)
> - How long to keep data after an account is closed, and how long to keep consent records
> - Hosting provider (Render or Railway is still open)

> [!todo] For the lawyer
> - Does Tallyn count as a "financial institution" under the GLBA? If so: a GLBA privacy notice and the FTC Safeguards Rule (a written security programme)
> - Legal bases and the CCPA/CPRA wording, and how we verify data requests
> - Teens 13–17: is a parent's invitation enough consent? Any state rules for minors' data
> - Children under 13: confirm "no accounts" for now; what verifiable parental consent would need later
> - Disclaimer and limitation of liability wording
> - Plaid's required disclosures: check against Plaid's current developer policy
> - Exact logs kept by Supabase and the hosting provider, for section 1 of the Privacy Policy

## Related
[[Feature - Auth]], [[Feature - Bank Linking]], [[Feature - Sharing]], [[Feature - Household Members]], #12 (children not invitable), #34 (limits are alerts only), #56 (close account), #54 (download data)
