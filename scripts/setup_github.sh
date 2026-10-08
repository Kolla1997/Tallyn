#!/usr/bin/env bash
# One-time setup: labels + "Tallyn Board" GitHub Project with a Stage field.
# Usage: scripts/setup_github.sh OWNER/REPO
# Needs: gh CLI logged in with project scope →  gh auth refresh -s project
set -euo pipefail
REPO="${1:?usage: setup_github.sh OWNER/REPO}"
OWNER="${REPO%%/*}"
cd "$(dirname "$0")/.."

echo "→ Installing issue forms into .github/ISSUE_TEMPLATE"
mkdir -p .github/ISSUE_TEMPLATE
cp scripts/github/ISSUE_TEMPLATE/*.yml .github/ISSUE_TEMPLATE/
cp scripts/github/labels.yml .github/labels.yml

echo "→ Creating labels in $REPO"
python3 - "$REPO" <<'PY'
import re, subprocess, sys
repo = sys.argv[1]
txt = open(".github/labels.yml").read()
for n, c, d in re.findall(r'name: "(.*?)"\n  color: "(.*?)"\n  description: "(.*?)"', txt):
    subprocess.run(["gh","label","create",n,"--color",c,"--description",d,"--repo",repo,"--force"], check=True)
    print("  ✓", n)
PY

echo "→ Creating project 'Tallyn Board'"
NUM=$(gh project create --owner "$OWNER" --title "Tallyn Board" --format json --jq .number)
gh project field-create "$NUM" --owner "$OWNER" --name "Stage" \
  --data-type SINGLE_SELECT --single-select-options "Ideas,Backlog,In Progress,Review,Done"
gh project link "$NUM" --owner "$OWNER" --repo "$REPO"

cat > scripts/board.env <<EOF
BOARD_OWNER=$OWNER
BOARD_NUMBER=$NUM
EOF
echo "✓ Project #$NUM created and linked. Saved to scripts/board.env"
echo
echo "Two clicks left in the GitHub UI (Project → ⋯):"
echo "  1. View → Layout: Board → Column by: Stage"
echo "  2. Workflows → 'Auto-add to project' → filter: is:issue,pr is:open → On"
