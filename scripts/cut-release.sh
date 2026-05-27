#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  scripts/cut-release.sh <new-tag> [--draft|--publish] [--branch <name>] [--notes-file <path>] [--yes]

Examples:
  scripts/cut-release.sh v0.5.0 --draft
  scripts/cut-release.sh v0.5.0 --publish --branch main --yes
EOF
}

NEW_TAG="${1:-}"
if [[ -z "$NEW_TAG" || "$NEW_TAG" == "--help" || "$NEW_TAG" == "-h" ]]; then
  usage
  exit 1
fi
shift

MODE="draft"
BRANCH="main"
NOTES_FILE=""
ASSUME_YES="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --draft)
      MODE="draft"
      shift
      ;;
    --publish)
      MODE="publish"
      shift
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --notes-file)
      NOTES_FILE="${2:-}"
      shift 2
      ;;
    --yes)
      ASSUME_YES="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BRANCH" ]]; then
  echo "Branch name cannot be empty." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI ('gh') is required for this script." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "Current branch is '$CURRENT_BRANCH', expected '$BRANCH'." >&2
  echo "Switch branches first: git checkout $BRANCH" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit/stash changes before cutting a release." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/${NEW_TAG}" >/dev/null; then
  echo "Tag ${NEW_TAG} already exists locally. Use a new tag or delete it intentionally first." >&2
  exit 1
fi

if git ls-remote --tags origin "refs/tags/${NEW_TAG}" | grep -q .; then
  echo "Tag ${NEW_TAG} already exists on origin." >&2
  exit 1
fi

git fetch --tags origin "$BRANCH"

if [[ -z "$NOTES_FILE" ]]; then
  NOTES_FILE="$(mktemp)"
  scripts/release-notes.sh "$NEW_TAG" > "$NOTES_FILE"
  AUTO_NOTES="true"
else
  AUTO_NOTES="false"
fi

echo "About to create release:"
echo "  branch:     $BRANCH"
echo "  tag:        $NEW_TAG"
echo "  mode:       $MODE"
echo "  notes file: $NOTES_FILE"

if [[ "$ASSUME_YES" != "true" ]]; then
  read -r -p "Proceed? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    [[ "$AUTO_NOTES" == "true" ]] && rm -f "$NOTES_FILE"
    exit 1
  fi
fi

git tag -a "$NEW_TAG" -m "Release ${NEW_TAG}"
git push origin "$NEW_TAG"

if [[ "$MODE" == "draft" ]]; then
  gh release create "$NEW_TAG" --title "$NEW_TAG" --notes-file "$NOTES_FILE" --draft
else
  gh release create "$NEW_TAG" --title "$NEW_TAG" --notes-file "$NOTES_FILE"
fi

RELEASE_URL="$(gh release view "$NEW_TAG" --json url -q .url)"
echo "Release created: $RELEASE_URL"

if [[ "$AUTO_NOTES" == "true" ]]; then
  rm -f "$NOTES_FILE"
fi
