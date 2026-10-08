---
description: Log an idea to the Tallyn Ideas board
argument-hint: <your idea>
allowed-tools: Bash(scripts/idea.sh:*), Bash(gh issue list:*), Bash(gh issue comment:*), Bash(python3 scripts/sync_board.py:*)
---

Log this idea to the Tallyn Ideas board: $ARGUMENTS

Typing `/i` is the approval, so don't ask before logging (CLAUDE.md §0 exception). Change nothing else.

1. **Duplicate check:** `gh issue list --label type:idea --state all --search "<2-3 keywords>" --limit 10`. If an existing idea clearly matches, add this one as a comment there (`gh issue comment <N> --body "..."`), reply `Added to #N: <title>` and stop.
2. **Title:** at most 8 words, sentence case, saying what the idea is (e.g. "Weekly allowance auto-transfer for kids").
3. **Body:**
   ```
   **Idea (as written):** <the user's exact words>

   **Why it might matter:** <one line>

   **Related:** <#N of related ideas or roadmap issues, or "none">
   ```
4. **Area:** pick one of brand, design, frontend, backend, infra, or leave it empty if unclear.
5. **Log it:** `scripts/idea.sh "<title>" "<body>" "<area>"`
6. **Sync:** `python3 scripts/sync_board.py` so the Obsidian boards are up to date.
7. **Reply in at most two lines:** `Logged #N: <title> → Tallyn Ideas (New)`, then a one-line Impact (High/Medium/Low) and Effort (S/M/L) guess for Dinesh to set on the board.
