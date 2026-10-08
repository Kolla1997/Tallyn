#!/usr/bin/env bash
# One-time setup: "Tallyn Ideas" GitHub Project (Stage, Impact, Effort) + IDs for scripts/idea.sh.
# Usage: scripts/setup_ideas_board.sh OWNER/REPO
set -euo pipefail
REPO="${1:?usage: setup_ideas_board.sh OWNER/REPO}"
OWNER="${REPO%%/*}"
cd "$(dirname "$0")/.."

echo "→ Installing Claude Code commands (/i)"
mkdir -p .claude/commands
cp scripts/claude-commands/*.md .claude/commands/

echo "→ Creating project 'Tallyn Ideas'"
NUM=$(gh project create --owner "$OWNER" --title "Tallyn Ideas" --format json --jq .number)
gh project field-create "$NUM" --owner "$OWNER" --name "Stage"  --data-type SINGLE_SELECT --single-select-options "New,Exploring,Promoted,Parked,Rejected"
gh project field-create "$NUM" --owner "$OWNER" --name "Impact" --data-type SINGLE_SELECT --single-select-options "High,Medium,Low"
gh project field-create "$NUM" --owner "$OWNER" --name "Effort" --data-type SINGLE_SELECT --single-select-options "S,M,L"
gh project link "$NUM" --owner "$OWNER" --repo "$REPO"

PID=$(gh project view "$NUM" --owner "$OWNER" --format json --jq .id)
gh project field-list "$NUM" --owner "$OWNER" --format json > /tmp/tallyn_ideas_fields.json
python3 - "$NUM" "$PID" <<'PY'
import json, sys
num, pid = sys.argv[1], sys.argv[2]
fields = {f["name"]: f for f in json.load(open("/tmp/tallyn_ideas_fields.json"))["fields"]}
stage = fields["Stage"]
opts = {o["name"]: o["id"] for o in stage["options"]}
lines = [l for l in open("scripts/board.env").read().splitlines() if l and not l.startswith("IDEAS_")]
lines += [f"IDEAS_NUMBER={num}", f"IDEAS_PROJECT_ID={pid}",
          f"IDEAS_STAGE_FIELD={stage['id']}", f"IDEAS_STAGE_NEW={opts['New']}"]
open("scripts/board.env", "w").write("\n".join(lines) + "\n")
PY
echo "✓ Tallyn Ideas is project #$NUM. IDs saved to scripts/board.env"
echo
echo "In the GitHub UI:"
echo "  Tallyn Ideas → View: Board, Column by: Stage"
echo "  Tallyn Ideas → Workflows → Auto-add: filter  is:issue label:type:idea  → On"
echo "  Tallyn Board → Workflows → Auto-add: change filter to  is:issue,pr is:open -label:type:idea"
echo "  Tallyn Board → Stage field: delete the 'Ideas' option (ideas live on their own board now)"
