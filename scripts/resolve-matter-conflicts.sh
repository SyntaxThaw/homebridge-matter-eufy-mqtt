#!/usr/bin/env bash
set -euo pipefail

# Resolves recurring merge conflicts for Matter migration files.
# Usage:
#   ./scripts/resolve-matter-conflicts.sh ours
#   ./scripts/resolve-matter-conflicts.sh theirs

STRATEGY="${1:-}"
if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "Usage: $0 <ours|theirs>" >&2
  exit 1
fi

FILES=(
  "src/matter/accessory.ts"
  "src/platform.ts"
  "dist/matter/accessory.js"
  "dist/platform.js"
)

echo "Resolving conflicts with strategy: $STRATEGY"
for file in "${FILES[@]}"; do
  git checkout "--$STRATEGY" -- "$file"
  git add "$file"
done

echo "Rebuilding dist from src..."
npm run build

echo "Re-adding rebuilt files..."
git add "${FILES[@]}"

echo "Checking for remaining conflict markers..."
if rg -n '<<<<<<<|=======|>>>>>>>' "${FILES[@]}"; then
  echo "Conflict markers still found. Resolve manually before commit." >&2
  exit 2
fi

echo "Done. Continue with:"
echo "  git rebase --continue  (or git commit)"
