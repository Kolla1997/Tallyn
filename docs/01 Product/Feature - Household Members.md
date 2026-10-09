---
type: spec
status: active
owner: Dinesh
updated: 2026-10-09
issue: 12
tags: [spec, members, invitations, security]
---

# Feature — Household members and invitations

## Problem
Partners, teens and other family members need a way to join a household with the right role. Before #12, the only way in was a database edit.

## Goal and success metric
An owner can invite someone in under a minute, and only the invited person can use the invite. Success: no invite link works for anyone but the invited, confirmed email; links work once and expire.

## User stories
- As an owner, I invite my partner by email and send them the link myself.
- As the invited partner, I sign up or sign in, open the link and join.
- As an owner, I change someone's role, remove someone, or cancel an invite.
- As anyone, I can leave a household (unless I'm its last owner).
- As someone in two households, I switch between them.

## Scope
**In:** invite links; join; members list; role changes; remove and leave; household switcher.

**Out:**
- **Children's logins (under 13)**: not until a legal check on US COPPA parental consent (decided 2026-10-09). Teens, adults and viewers can be invited.
- Tallyn sending the invite email itself (link only for now).
- Spending limits: split to [#34](https://github.com/Kolla1997/Tallyn/issues/34).

## Rules (decided 2026-10-09)
- Only **owners** invite, change roles and remove others. Anyone can leave; a household always keeps at least one owner.
- Roles you can invite: **adult, teen, viewer**. An owner can later make an adult an owner.
- An invite link is **single use**, lasts **7 days**, and works **only for the invited email, once it's confirmed**. A new invite to the same email cancels the old one. At most 20 open invites per household.
- Joining **shares nothing** ([[Feature - Sharing]]): a new partner sees none of your money until you share it. Parents see teens' money automatically.

## Design
Home → **Members**: each member with their role (owners get a role menu), Remove / Leave household with an in-page confirmation; **Invite someone** (email, role) → the link is shown once with **Copy link** and "It works once, only for that email, for 7 days"; **Waiting to join** with Cancel invite. A **Household** menu appears when you're in more than one. Opening a link shows "You've been invited" with **Join household** after sign-in.

## Tech notes
[[0008-invitations]]. `migrations/0008_invites.sql`: `household_invites` (hash only), `create_household_invite`, `revoke_household_invite`, `accept_household_invite`. Links are `/join#<token>`; the fragment never reaches the server. API: `GET/POST /api/households/{id}/invites`, `DELETE /api/invites/{id}`, `POST /api/invites/accept`, `GET /api/households/{id}/members`, `PUT/DELETE /api/households/{id}/members/{user}`.

## Rollout
Run 0008 on `tallyn-dev`, then test with the second account: remove it, invite it again, join from its window.

## Open questions
- Children's logins after the COPPA check, or children shown under a parent without a login?
- Send invite emails from Tallyn (needs an email provider)?
- Show who invited whom, and when, in a household history?
