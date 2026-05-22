# Upstream CloudTAK Sync Runbook

A repeatable procedure for incorporating an upstream `dfpc-coe/CloudTAK`
update into your fork (`clptak/CloudTAK#prod`) and rolling it out to
production. Use this whenever a new CloudTAK release lands and your PR
hasn't merged yet, **or** any time you want to pull in upstream fixes.

Once your PR merges upstream, the same runbook still applies — git will
just silently absorb the now-duplicate commits during the merge.

## Branch layout this runbook assumes

- `dfpc-coe/CloudTAK` — upstream (added as remote `origin`)
- `clptak/CloudTAK` — your fork (added as remote `fork`)
- `prod` branch in your fork — what the VPS deploys from. Contains
  upstream main + any unmerged PR commits + the bundled plugin
  (if not yet migrated to standalone)
- `clptak/cloudtak-plugin-cellphone` — standalone plugin repo
- `clptak/tak-stack` — your deployment config repo

The VPS lives at `/home/takadmin/tak-stack/` with `CloudTAK/` and (post-
migration) `cloudtak-plugin-cellphone/` as sibling clones.

## Pre-flight: backup

Always before touching anything that affects the running stack.

```bash
ssh takadmin@<vps>
cd /home/takadmin/tak-stack
./cloudtak.sh backup
# Optional full-stack snapshot:
# sudo ./backup-stack.sh --full-backup
```

If the CloudTAK backup completes and lands a fresh `.sql` file in
`cloudtak-backups/`, you have a safe rollback. Continue.

## Step 1 — Decide whether this is a small or large update

Quick check on your dev machine:

```bash
cd /Users/paulclifton/CloudTAK
git fetch origin --tags
git log --oneline prod..origin/main | wc -l
git log --oneline prod..origin/main | head -20
```

- **< 50 commits**: minor or patch release. Likely smooth.
- **50–200 commits**: minor release with notable changes. Read the
  release notes on https://github.com/dfpc-coe/CloudTAK/releases for the
  tags between your last sync and current upstream tip.
- **200+ commits**: major release. Read release notes carefully. Look
  for renamed/moved files, deprecated APIs, dependency bumps.

Look at the release notes especially for:

- Files in `api/web/src/` that the plugin imports — particularly
  `database.ts`, `stores/map.ts`, `std.ts`, `base/database.ts`. Each of
  these has moved in past releases.
- The plugin loader path (`api/web/src/main.ts` `import.meta.glob`).
- TypeScript / Vue / ESLint version bumps that might introduce new lint
  errors against your plugin code.
- `@tak-ps/node-tak` version — your custom endpoints may already be
  upstream by now.

## Step 2 — Merge upstream into prod (on dev machine)

```bash
cd /Users/paulclifton/CloudTAK
git checkout prod
git fetch origin
git fetch fork

# Pull anything new from your fork's prod first (in case VPS pushed)
git pull --ff-only fork prod 2>/dev/null || git pull --rebase fork prod

# Now merge upstream
git merge origin/main
```

### If the merge is clean

Push and continue to Step 3:

```bash
git push fork prod
```

### If the merge has conflicts

Likely conflict locations:

- **Files your PR added or modified** (if PR not yet merged upstream)
  — e.g., `api/routes/marti-mission.ts`,
  `api/routes/marti-mission-logs.ts`. Compare both versions; if upstream
  added similar functionality (e.g., a maintainer's migration), prefer
  upstream and drop your PR's version of those files.
- **`api/package-lock.json`** — almost always conflicts on minor
  releases. Just take upstream:
  ```bash
  git checkout --theirs api/package-lock.json api/web/package-lock.json
  git add api/package-lock.json api/web/package-lock.json
  ```
  Then run `cd api && npm install && cd ../web && npm install` after the
  merge completes to regenerate them properly.
- **Plugin files** (`api/web/plugins/ping/*`) — upstream shouldn't
  touch these (gitignored), but a force-add can cause confusion. If
  conflicts here, keep your version (`git checkout --ours`).

After resolving:

```bash
git add <resolved-files>
git commit
git push fork prod
```

## Step 3 — Verify plugin imports still resolve

CloudTAK has moved `api/web/src/` files between releases. Each move
breaks the plugin's hardcoded relative imports.

```bash
# Confirm each path still exists
for path in \
    api/web/src/database.ts \
    api/web/src/stores/map.ts \
    api/web/src/std.ts ; do
  [ -f "$path" ] && echo "OK   $path" || echo "MISSING $path"
done
```

If any show MISSING, find the new location:

```bash
grep -rln "export const db\|^export { db" api/web/src/      # for db
grep -rln "useMapStore" api/web/src/                        # for mapStore
grep -rln "export.*function std\|^export { std" api/web/src/ # for std
```

Update the import lines in
`api/web/plugins/ping/components/PingForm.vue` to match the new paths,
then commit:

```bash
# example
sed -i '' "s|from '../../../src/base/database.ts'|from '../../../src/database.ts'|" \
  api/web/plugins/ping/components/PingForm.vue

git add -f api/web/plugins/ping/components/PingForm.vue
git commit -m "Update plugin imports for CloudTAK X.Y.Z"
git push fork prod
```

(macOS uses `sed -i ''`; Linux drops the empty string.)

Note the `-f` on `git add` — the plugins directory is gitignored, so
modifications to tracked plugin files need force-add.

## Step 4 — Reinstall dev dependencies

```bash
cd /Users/paulclifton/CloudTAK/api
npm install

cd /Users/paulclifton/CloudTAK/api/web
npm install
```

Run your dev server briefly to confirm it starts:

```bash
cd /Users/paulclifton/CloudTAK/api
npm run dev
# Watch for "ok - http://localhost:5000" then Ctrl+C
```

If it fails with `Cannot find package '...'`, the dependency wasn't
installed — try `npm install --legacy-peer-deps` and rerun.

## Step 5 — Deploy to the VPS

```bash
ssh takadmin@<vps>
cd /home/takadmin/tak-stack/CloudTAK
git fetch fork
git pull fork prod
```

If `git pull` shows local modifications that block the pull, see the
"VPS-side label customizations" section below.

Then rebuild:

```bash
cd /home/takadmin/tak-stack
docker compose build --no-cache cloudtak-api cloudtak-tiles cloudtak-events
docker compose up -d --force-recreate cloudtak-api cloudtak-tiles cloudtak-events
docker compose logs --tail=50 -f cloudtak-api
```

Watch for `ok - http://localhost:5000`. Ctrl+C when seen.

`--force-recreate` is mandatory: without it, `docker compose up -d` will
silently keep the old container if image hashes happen to match.

### If the build fails on lint

Common after CloudTAK ESLint config changes. Two paths:

- **Roll back to keep production deployable** while you fix:
  ```bash
  cd /home/takadmin/tak-stack/CloudTAK
  git checkout main
  cd ..
  docker compose build --no-cache cloudtak-api
  docker compose up -d --force-recreate cloudtak-api
  ```
  This gets you to upstream main without the plugin. Existing
  running container is unaffected — `docker compose build` failures
  don't kill running containers, so you may be fine without rolling
  back at all.
- **Fix the lint errors on dev and redeploy**:
  Address each error in `api/web/plugins/ping/...`, commit, push to
  `fork prod`, pull on VPS, rebuild. Common patterns from past lint
  bumps:
  - `[^\.]` → `[^.]` (dot inside character class doesn't need escaping)
  - `let coords = ''` followed by reassignment → use ternary
  - `defineComponent({ setup() {...} })` → convert to
    `<script setup lang='ts'>`

## Step 6 — Update the standalone plugin repo (if relevant)

If you applied any plugin-code fixes during Steps 3–5, those need to
land in the standalone repo too, otherwise it stays behind.

```bash
cd /Users/paulclifton/dev/cloudtak-plugin-cellphone

# Copy the relevant fix(es) from the CloudTAK fork
cp /Users/paulclifton/CloudTAK/api/web/plugins/ping/lib/coordinates.ts \
   lib/coordinates.ts
cp /Users/paulclifton/CloudTAK/api/web/plugins/ping/components/PingForm.vue \
   components/PingForm.vue

git diff
```

If the diff includes label changes you only want on your VPS, revert
those before committing:

```bash
sed -i '' \
  -e 's|>Cellphone Ping</button>|>Cell Ping</button>|' \
  -e 's|>RTT Timing Advance</button>|>RTT</button>|' \
  -e 's|>CARRIER</label>|>Name / Callsign</label>|' \
  components/PingForm.vue
```

Then commit, push, and tag:

```bash
git add lib/ components/
git commit -m "Compatibility with CloudTAK X.Y.Z"
git push origin main

git tag -a vX.Y.Z -m "CloudTAK X.Y.Z compatibility"
git push origin vX.Y.Z
```

Update the README's Requirements section to reflect the new tested
version.

## Step 7 — Browser verification

In a browser:

1. Hard refresh `https://cloudtak.<your-domain>` (Cmd/Ctrl+Shift+R) to
   bypass the service worker cache.
2. Confirm the **Cellphone Ping / RTT** menu item appears in the main
   menu.
3. Submit a test ping against an active DataSync mission.
4. Confirm the feature appears on the map and (if the toggle was on)
   the log entry shows in the mission's Logs view.

If the menu item is missing:
- Open dev tools → Application/Storage → Service Workers → Unregister
- Hard refresh again

If the form submits but features don't appear, check the API container
logs for an error:
```bash
docker compose logs --tail=100 cloudtak-api
```

## VPS-side label customizations

You have local label edits committed on `fork/prod` (Cellphone Ping,
RTT Timing Advance, CARRIER). The VPS pulls from `fork/prod`, so as long
as those commits are in fork/prod, the VPS deploy keeps them.

If you ever do a `git reset --hard` or rewrite history on `fork/prod`
that drops those commits, the labels revert. After any history rewrite,
verify with:

```bash
grep 'CARRIER\|Cellphone Ping\|RTT Timing Advance' \
  api/web/plugins/ping/components/PingForm.vue
```

If empty, cherry-pick the label rename commit back on or re-apply the
edit and push.

## When your PR finally merges upstream

The next time you run this runbook after the merge, Step 2's
`git merge origin/main` will detect that your PR's commits are already
in upstream main (same patch content) and silently skip them. Nothing
extra to do.

Optional cleanup: delete the PR branch from your fork:

```bash
cd /Users/paulclifton/CloudTAK
git branch -D feat/mission-cot-and-log-entryuid
git push fork --delete feat/mission-cot-and-log-entryuid
```

And update the standalone plugin repo's README to drop the "Requires
CloudTAK PR #XXXX" line — switch to "Requires CloudTAK ≥ <version>".

## Quick reference — one-pass commands for a typical minor release

For most uneventful CloudTAK point releases (no breaking changes), the
whole flow is:

```bash
# DEV
cd /Users/paulclifton/CloudTAK
git checkout prod
git fetch origin && git fetch fork
git merge origin/main
git push fork prod
cd api && npm install
cd ../web && npm install

# VPS
ssh takadmin@<vps>
cd /home/takadmin/tak-stack
./cloudtak.sh backup
cd CloudTAK && git pull fork prod && cd ..
docker compose build --no-cache cloudtak-api cloudtak-tiles cloudtak-events
docker compose up -d --force-recreate cloudtak-api cloudtak-tiles cloudtak-events
```

Five minutes if everything's clean. Slower when you hit moved imports
or new lint rules — but the runbook above covers each of those.
