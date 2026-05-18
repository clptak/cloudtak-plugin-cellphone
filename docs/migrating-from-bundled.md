# Migrating From Bundled Plugin To Standalone Repo

This document covers the one-time migration from the **bundled** layout
(where this plugin lives inside a CloudTAK fork's `prod` branch as
force-added files) to the **standalone** layout (where the plugin lives
in this repository and gets cloned into a CloudTAK build at deploy time).

Both layouts work. The bundled layout was used during the plugin's
initial development against a pending upstream PR. The standalone layout
is preferred long-term because:

- The plugin can be installed against any compatible CloudTAK release
  without maintaining a fork.
- Updates to CloudTAK don't risk merge conflicts with the plugin
  directory.
- Other operators can use the plugin without having to fork CloudTAK.

Do the migration after [dfpc-coe/CloudTAK PR #XXXX](https://github.com/dfpc-coe/CloudTAK/pulls)
merges and a CloudTAK release containing the new endpoints is tagged.
Until then, keep using the bundled layout.

## Prerequisites

- The upstream PR (`POST /marti/missions/:guid/cot` + `entryUid` on log
  create) has merged into `dfpc-coe/CloudTAK` main.
- A CloudTAK release with that change is available (verify the tag or
  commit SHA on `dfpc-coe/CloudTAK`).
- You have a current backup of your stack (see `backup-stack.sh
  --full-backup` in your tak-stack repo).

## Step 1 — Verify your CloudTAK fork's `prod` branch state

On your dev machine, in your CloudTAK fork checkout:

```bash
cd /Users/paulclifton/CloudTAK
git checkout prod
git fetch origin
git log --oneline -5 origin/main
```

Confirm `origin/main` contains the merged PR commits. Their SHAs should
match what's in your local `prod` branch already.

## Step 2 — Remove the plugin from `prod`

```bash
cd /Users/paulclifton/CloudTAK
git checkout prod

# Remove the force-added plugin files
git rm -rf api/web/plugins/ping

git commit -m "Remove bundled ping plugin (now standalone)"

# Bring prod back in line with upstream main now that the PR is in
git merge origin/main

# Push the slimmer prod branch
git push fork prod
```

After this, your fork's `prod` branch is just upstream main + whatever
stack-specific customizations you have. The plugin no longer lives
inside CloudTAK's source tree.

If `prod` no longer differs from upstream `main` at all, you can simplify
further by deleting the prod branch and pointing your VPS at `main`:

```bash
git branch -d prod
git push fork --delete prod
```

(Skip this if you keep other customizations in `prod`.)

## Step 3 — Update your VPS deployment to clone both repos

On the VPS, update the CloudTAK directory and add a plugin install step.

```bash
cd /home/takadmin/tak-stack

# Update CloudTAK to the now-slimmer prod (or to main if you deleted prod)
cd CloudTAK
git fetch fork
git checkout prod        # or: git checkout main
git pull
cd ..

# Clone or update the plugin
if [ ! -d cloudtak-plugin-cellphone ]; then
    git clone https://github.com/clptak/cloudtak-plugin-cellphone.git
else
    cd cloudtak-plugin-cellphone && git pull && cd ..
fi

# Copy plugin into CloudTAK's plugins directory
mkdir -p CloudTAK/api/web/plugins/ping
cp -r cloudtak-plugin-cellphone/index.ts \
      cloudtak-plugin-cellphone/components \
      cloudtak-plugin-cellphone/lib \
      cloudtak-plugin-cellphone/README.md \
      CloudTAK/api/web/plugins/ping/

# Rebuild
docker compose build --no-cache cloudtak-api
docker compose up -d --force-recreate cloudtak-api cloudtak-tiles cloudtak-events
```

The `cp -r` is important: CloudTAK's plugin loader expects the files at
`api/web/plugins/ping/`, and the plugin repo's top-level files mirror
that layout.

## Step 4 — Fold the install step into `cloudtak.sh update`

The `update` subcommand of `cloudtak.sh` already pulls CloudTAK and
rebuilds containers. Extend it to also pull the plugin and copy files
in. In `cloudtak.sh`, find the `elif [[ "$SUBCOMMAND" == "update" ]];`
block and add the plugin install before the docker build:

```bash
    # Update the CloudTAK clone
    (cd "$CLOUDTAK_DIR" && git pull)

    # Update or clone the cellphone plugin
    PLUGIN_REPO="${PLUGIN_REPO:-https://github.com/clptak/cloudtak-plugin-cellphone.git}"
    PLUGIN_SRC="${PLUGIN_SRC:-$SCRIPT_DIR/cloudtak-plugin-cellphone}"
    if [ ! -d "$PLUGIN_SRC" ]; then
        git clone "$PLUGIN_REPO" "$PLUGIN_SRC"
    else
        (cd "$PLUGIN_SRC" && git pull)
    fi

    # Copy plugin into CloudTAK build
    PLUGIN_DST="$CLOUDTAK_DIR/api/web/plugins/ping"
    rm -rf "$PLUGIN_DST"
    mkdir -p "$PLUGIN_DST"
    cp -r "$PLUGIN_SRC/index.ts" \
          "$PLUGIN_SRC/components" \
          "$PLUGIN_SRC/lib" \
          "$PLUGIN_SRC/README.md" \
          "$PLUGIN_DST/"

    docker compose -p "$PROJECT_NAME" build --no-cache cloudtak-api cloudtak-events cloudtak-tiles cloudtak-media
    docker compose -p "$PROJECT_NAME" up -d --force-recreate cloudtak-api cloudtak-events cloudtak-tiles cloudtak-media
```

Add to `.env.example`:

```
# Cellphone plugin source (optional override)
# PLUGIN_REPO=https://github.com/clptak/cloudtak-plugin-cellphone.git
# PLUGIN_SRC=/home/takadmin/tak-stack/cloudtak-plugin-cellphone
```

Defaults match the convention so most operators don't need to set them.

## Step 5 — Verify and clean up

1. Reload CloudTAK in a browser (hard refresh) and confirm the
   **Cell Ping / RTT** menu item still appears and the form submits
   successfully against a DataSync mission.

2. Run a one-time backup:
   ```bash
   sudo /home/takadmin/tak-stack/backup-stack.sh --full-backup
   ```

3. Once you've confirmed the standalone layout works end-to-end for a
   few days, you can delete the bundled-plugin commit history from your
   fork's `prod` branch (if you kept it) and/or delete the `prod`
   branch entirely. Optional cleanup — both layouts can coexist
   indefinitely.

## Rolling back if needed

If anything breaks during the migration:

```bash
# On the VPS
cd /home/takadmin/tak-stack/CloudTAK
git checkout prod              # whichever branch had the bundled plugin

# Restore the plugin files
mkdir -p api/web/plugins/ping
cp -r /home/takadmin/tak-stack/cloudtak-plugin-cellphone/index.ts \
      /home/takadmin/tak-stack/cloudtak-plugin-cellphone/components \
      /home/takadmin/tak-stack/cloudtak-plugin-cellphone/lib \
      /home/takadmin/tak-stack/cloudtak-plugin-cellphone/README.md \
      api/web/plugins/ping/

cd ..
docker compose build --no-cache cloudtak-api
docker compose up -d --force-recreate cloudtak-api cloudtak-tiles cloudtak-events
```

The plugin files in your CloudTAK working tree will not be tracked by
git (they were originally force-added; without that they're gitignored),
but they'll still be present for the Docker build. That's enough to get
back to a working state.

## Decision checklist

Before starting:

- [ ] Upstream PR merged and a CloudTAK release with the new endpoints
      is available
- [ ] Full backup taken
- [ ] Tested the standalone plugin path on a staging environment, if
      you have one
- [ ] Have a maintenance window of ~15 minutes for the rebuild

If any of those aren't true, keep the bundled layout for now.
