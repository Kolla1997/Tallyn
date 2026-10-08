#!/usr/bin/env bash
# Log an idea on the Tallyn Ideas board (Stage = New).
# Usage: scripts/idea.sh "Title" ["Body"] [area]     area: brand|design|frontend|backend|infra
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source scripts/board.env; set +a
TITLE="${1:?usage: idea.sh \"Title\" [\"Body\"] [area]}"
BODY="${2:-$TITLE}"
LABELS="type:idea"; [ -n "${3:-}" ] && LABELS="$LABELS,area:$3"

URL=$(gh issue create --title "$TITLE" --body "$BODY" --label "$LABELS")
ITEM=$(gh project item-add "$IDEAS_NUMBER" --owner "$BOARD_OWNER" --url "$URL" --format json --jq .id)
gh project item-edit --id "$ITEM" --project-id "$IDEAS_PROJECT_ID" \
  --field-id "$IDEAS_STAGE_FIELD" --single-select-option-id "$IDEAS_STAGE_NEW" > /dev/null
echo "✓ #${URL##*/} $TITLE → Tallyn Ideas (New)"
echo "  $URL"
