---
type: spec
status: active
owner: Dinesh
updated: 2026-10-24
issue: 14
tags: [spec, goals, privacy]
---

# Feature — Savings goals

## Problem
Families save toward things (a trip, a school fund, an emergency fund) and want to see how close they are, without Tallyn pretending it can move money.

## Goal and success metric
Anyone can set a goal in under a minute and see, at a glance, how close it is and what it takes to get there on time. Success: most households with a savings account have at least one goal.

## User stories
- As a parent, I want a goal that follows our savings account, so its progress updates on its own.
- As a teen, I want my own goal for a laptop, which my parents can see.
- As a partner, I want to share a goal with my partner only, not the whole household.

## Scope
**In** (decided by Dinesh 2026-10-09 in #14, and 2026-10-24):
- A goal has a name, a target, an optional "by" month, and fills one of two ways: it **follows a savings account** (progress = that account's balance, updated at each bank sync) or is **updated by hand**. No "Add money": Tallyn can't move money.
- **Who can see it**, per goal: only me, me and one chosen member, or everyone in the household. Separate from the sharing switches (#28).
- **A goal never reveals a balance** someone can't already see: if a goal follows an account the viewer may not see, they get the name and target only, with "Progress is private". No percentage either (it gives the balance away).
- **Currency per goal**, no conversion (#11 stays parked): a goal that follows an account takes that account's currency; one updated by hand defaults to the household's and can be another. Totals count goals in the household currency, with a note like "+1 goal in EUR".
- **Kids:** teens and children can make their own goals; owners and adults see and can set up kids' goals (the budget rules, [[0014-budget-totals-opt-in]]).
- **On track:** for a goal with a "by" month, "Put aside $200 a month to get there by June", from what's left and the months to go.
- **Home:** the Goals card on Home shows the same answer, in short.

**Out (later):**
- Matching transfers into savings to a goal (Tallyn can't tell which goal a transfer was for); linking to the plan's goal buckets (#133)
- Converting goals in other currencies into one total (#11)

## Design
Dinesh picked the **mix** of draft 2 (2026-10-24, `docs/03 Design/Comps/web-goals-ideas-draft.html`), chosen part by part:
- **Summary: "This month"** (from H): what to do this month as a short checklist, e.g. "2 of 3 set-asides are done this month. Paris trip still needs €170 by 31 October." Goals that follow an account tick when the balance grows; others when you update the amount.
- **The list: pots** (from E): each goal a glass jar that fills from the bottom, with what's left in big type. A goal whose progress is private shows a locked jar.
- **One goal up close: forecast + next milestone** (from G and F): "At this pace you'll be there in March, about 3 months early", with the next milestone ("$350 to three quarters"). The forecast needs two months of history; until then it says so.
- **New goal:** name, target, optional month, how it fills, who can see it.

Earlier drafts: `web-goals-answer-draft.html` (answer first, four layouts) and `web-goals-draft.html` (#39).

## Tech notes
- New `goals` table with row-level security; who sees a goal follows its own setting, and kids' goals follow the budget rules.
- Progress comes from one database function, `goal_progress()`, worked out per viewer: an account balance only when the viewer may see that person's balances (`can_see_member_data`, ADR 0007), otherwise nothing. The amount column itself isn't readable by the app.
- `goal_months` keeps each goal's amount at the end of each month, for the forecast and "this month": hand updates write it as they happen; the bank sync's login writes it daily for goals that follow an account (migration 0018).
- A goal follows only its own person's account; unlinking that bank turns the goal into one updated by hand.
- Tests: [[Test Plan]] rows under Money.

## Open questions
> [!todo] Whether goals should notify when they're reached (#55).
