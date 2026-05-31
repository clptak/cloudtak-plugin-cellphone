#!/bin/sh
# Pre-commit guard: block the commit if ESLint fails, so lint errors are
# caught here instead of 55 seconds into the CloudTAK Docker build.
#
# Install (run once per clone):
#   ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
# or copy:
#   cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -e

echo "pre-commit: running eslint…"
if ! npm run --silent lint; then
    echo ""
    echo "pre-commit: ESLint failed. Fix the errors above (try 'npm run lint:fix') and re-commit."
    echo "            To bypass intentionally: git commit --no-verify"
    exit 1
fi

echo "pre-commit: lint clean."
