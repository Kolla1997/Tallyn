---
type: idea
status: draft
owner: Dinesh
updated: 2026-10-23
issue: 136
tags: [idea, ai]
---

# Idea — TallyX AI

**One-liner:** Ask Tallyn about your money in plain words ("what did I spend on food this month?"), first from Discord, later in the app.

Tickets: [#136](https://github.com/Kolla1997/Tallyn/issues/136) (TallyX on Discord), building on [#15](https://github.com/Kolla1997/Tallyn/issues/15) (AI assistant). Related: [#132](https://github.com/Kolla1997/Tallyn/issues/132) (messaging between household members).

> [!todo] Name not final
> "TallyX" is a working name. Dinesh is open to others.

## Why (problem / opportunity)
People want a quick answer without opening the app and finding the right screen. A chat app they already use makes Tallyn feel close at hand.

## Rough shape

**Tools, not maths.** The model never calculates a number. It picks a tool, such as "spending by category for a period", "budget left" or "account balances", and the Go backend works out the answer from the database, much like `budget_spending()` already does for Budgets. The model only puts the result into words. That keeps every number exact and checkable.

**Maybe no RAG.** Most questions are lookups in structured data, not searches through documents. Tool calls may cover them, so #15's pgvector RAG may not be needed at first. Revisit if people ask about free text (notes, merchant names).

**Same privacy rules as the app.** TallyX acts as the person asking and sees only what they can see in Tallyn. Row-level security and the household roles apply unchanged: a teen can't ask about a parent's spending.

**Model choice (from the Model Routing Playbook, read 2026-10-23):**
1. Start with **one** fast, low-cost model (e.g. Haiku) at low effort. Simple lookups are most questions.
2. Keep the system prompt and tool list fixed so prompt caching keeps repeat questions cheap. Switching models breaks the cache.
3. Add a second, stronger model (e.g. Sonnet) only if the measurements show it's needed, for open questions like "help me plan a holiday budget". Use a plain rule to choose, not an AI judge (a judge can eat about a fifth of the spend).
4. No router until the numbers below show clear savings.

**What to measure (before launch, and on every change):**
- A set of 50–100 real questions against fake household data, each with a known correct answer. These become TallyX rows in `docs/04 Tech/Test Plan.md`.
- Cost per *correct* answer, not per token. Also p90 cost per question and cache hit rate.
- Wrong answers that sound right (false passes). For a money app this matters most; the target is zero wrong numbers.
- Privacy cases: questions that try to reach another member's data must be refused.

**Discord.** Direct messages only, never public channels. People link their Discord account from Tallyn settings, and can unlink it at any time.

**Voice.** Clear and calm, as in `docs/02 Brand/Voice and Tone.md`. TallyX answers questions about your own money. It doesn't give investment or financial advice and says so when asked.

## Effort guess
L. Split it when promoted: (1) the tool API and answer engine with the measurement set, (2) in-app chat, (3) the Discord link.

## Open questions
> [!warning] Legal and consent before any real data
> Sending financial data to an AI provider, and answers through Discord, needs a Privacy Policy update in `legal/` (lawyer-reviewed) and a clear opt-in per person. How kids' and teens' data is handled needs a decision first.

- Discord first, or in-app chat first? In-app is simpler and keeps data inside Tallyn; Discord is the original idea.
- Which AI provider, and what does their data retention allow? Needs an ADR.
- Who can turn TallyX on for a household: each person, or owners and adults only?
- Rough cost per active user per month we can accept. Set this before picking the model.
- Final name.
