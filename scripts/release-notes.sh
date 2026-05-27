#!/usr/bin/env bash
set -euo pipefail

NEW_TAG="${1:-}"
if [[ -z "$NEW_TAG" ]]; then
  echo "Usage: scripts/release-notes.sh <new-tag>" >&2
  echo "Example: scripts/release-notes.sh v0.4.0" >&2
  exit 1
fi

REPO_URL="$(git remote get-url origin)"
REPO_SLUG="$(printf "%s" "$REPO_URL" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"

if git rev-parse -q --verify "refs/tags/${NEW_TAG}" >/dev/null; then
  PREV_TAG="$(git tag -l --sort=-v:refname | awk -v t="$NEW_TAG" '$0 != t { print; exit }')"
else
  PREV_TAG="$(git tag -l --sort=-v:refname | head -n 1)"
fi

if [[ -z "$PREV_TAG" ]]; then
  RANGE="HEAD"
  COMPARE_URL="https://github.com/${REPO_SLUG}/commits/${NEW_TAG}"
else
  RANGE="${PREV_TAG}..HEAD"
  COMPARE_URL="https://github.com/${REPO_SLUG}/compare/${PREV_TAG}...${NEW_TAG}"
fi

TMP_COMMITS="$(mktemp)"
git log "$RANGE" --oneline > "$TMP_COMMITS"

cat <<EOF
## What's changed

- TODO: Add 3-6 highlight bullets.

## Included commits
$(sed 's/^/- /' "$TMP_COMMITS")

## Compatibility

- TODO: Note minimum CloudTAK/GitHub/runtime compatibility.

**Full Changelog**: ${COMPARE_URL}
EOF

rm -f "$TMP_COMMITS"
