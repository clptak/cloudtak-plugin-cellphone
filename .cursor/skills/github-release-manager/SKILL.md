---
name: github-release-manager
description: Prepare and publish GitHub releases for this repository using semantic versioning, annotated tags, and GitHub release notes. Use when the user asks to cut a release, draft release notes, bump version tags, or publish a GitHub release.
disable-model-invocation: true
---

# GitHub Release Manager

## Inputs To Confirm
1. Target branch (default `main`)
2. New tag (for example `v0.4.0`)
3. Previous tag (for changelog range)
4. Release type (`patch`, `minor`, or `major`)
5. Publish now or draft only

## Workflow
1. Verify branch and local state:
   - `git status`
   - `git pull origin <branch>`
2. Discover last tag and commit range:
   - `git tag -l --sort=-v:refname`
   - `git log <previous_tag>..HEAD --oneline`
3. Propose next version using semver intent:
   - patch = fixes/docs/chore only
   - minor = new behavior/features
   - major = breaking compatibility
4. Draft release notes with:
   - Highlights
   - Included commits since previous tag
   - Compatibility notes
   - Compare link
5. On explicit approval, create and push an annotated tag:
   - `git tag -a <new_tag> -m "<tag message>"`
   - `git push origin <new_tag>`
6. Create GitHub release:
   - `gh release create <new_tag> --title "<new_tag>" --notes-file <file>`
7. Return:
   - Tag name and commit
   - Release URL
   - Any follow-up actions

## Guardrails
- Never force-push tags.
- Never delete existing tags unless explicitly requested.
- If `gh` is unavailable or unauthenticated, provide browser-based release steps.
- If the working tree has unrelated local changes, do not revert them.
- Do not publish until the user confirms.

## Optional Helper Script
If `scripts/release-notes.sh` exists, run it to generate a release notes template:
- `scripts/release-notes.sh v0.4.0`
