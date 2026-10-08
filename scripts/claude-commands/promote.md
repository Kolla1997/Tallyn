---
description: Promote an idea from Tallyn Ideas to Tallyn Board (Backlog)
argument-hint: <issue number> [feature|bug|design|docs|tech-debt]
allowed-tools: Bash(python3 scripts/promote.py:*), Bash(python3 scripts/sync_board.py:*), Bash(gh issue view:*)
---

Promote idea $ARGUMENTS to Tallyn Board.

Typing `/promote` is the approval to move the card (CLAUDE.md §0 exception). Anything beyond that still needs an OK.

1. `gh issue view <number>` to read the idea. If no type was given, pick the best fit (feature / bug / design / docs / tech-debt) and say which you chose.
2. Run `python3 scripts/promote.py <number> <type>`.
3. Run `python3 scripts/sync_board.py`.
4. Reply in two lines: `Promoted #N: <title> → Tallyn Board (Backlog) as type:<type>`, then whether it needs a Feature Spec (yes if it's bigger than about a day's work).
5. If it needs a spec, propose a 5-line outline (problem, goal, scope in/out, open questions) and **ask before writing** `docs/01 Product/Feature - <Title>.md`.
