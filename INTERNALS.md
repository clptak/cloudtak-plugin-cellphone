# Plugin internals — how to draw GeoJSON features from a CloudTAK plugin

This document records exactly what was discovered while building this plugin
so the same approach can be reused in future plugins that need to draw
features on the live map.

## The goal

Post GeoJSON features from a client-side Vue 3 plugin so they:

- appear on the live map immediately, and
- if a DataSync mission is active, are linked to that mission and broadcast
  to TAK Server over the user's existing connection.

No server-side changes. No fork of CloudTAK. Works with upstream `main`.

---

## What does NOT work (and why)

**`PUT /api/import` (multipart file import)**
CloudTAK has an import pipeline that accepts GeoJSON files. It runs through a
background processor and is not designed for real-time CoT posting.

**`POST /Marti/api/cot/xml` (raw CoT XML to TAK Server)**
Posting XML directly to the TAK Server REST API bypasses CloudTAK's map
entirely — the map does not know about it, the feature does not appear
locally, and you have to generate XML yourself.

**`api.Mission.attachContents` / `PUT /marti/missions/:guid/contents`**
Even if you get CoT UIDs back from TAK Server, attaching them after the fact
is a race and requires a custom CloudTAK server route. The whole pattern of
"send CoT → get UID → attach UID to mission" is the wrong shape for a plugin.

**Custom server route (e.g. `POST /api/marti/cot`)**
Works, but requires the user to run a fork of CloudTAK. Not a real plugin.

---

## What DOES work

### `mapStore.worker.db.add(feature, { authored: true })`

This is the exact same mechanism CloudTAK's built-in drawing tools use. It is
the correct, supported, fork-free approach.

**Where to confirm this in the CloudTAK source:**

`api/web/src/workers/atlas-database.ts`, method `add()`:

```typescript
if (!exists && (
    (this.mission && opts.authored)
    // ...
)) {
    // Fires sub.feature.update → worker broadcasts to TAK Server
    // AND links the feature to the active mission
}
```

`api/web/src/components/CloudTAK/Inputs/GeoJSONInput.vue` — the canonical
in-tree example of the same pattern:

```typescript
import { normalize_geojson } from '@tak-ps/node-cot/normalize_geojson';
// ...
await mapStore.worker.db.add(feat, { authored: true });
```

---

## The complete pattern

### Imports

```typescript
import { useMapStore } from '../../../src/stores/map.ts';
import { normalize_geojson } from '@tak-ps/node-cot/normalize_geojson';
```

### Get the active mission GUID

```typescript
const mapStore = useMapStore();
const missionGuid = computed(() => mapStore.mission?.meta.guid);
```

Use `missionGuid.value` to show the user whether their features will go to a
mission or just the local map.

### Post features

```typescript
for (const feat of geojsonFeatureCollection.features) {
    // normalize_geojson converts a plain GeoJSON Feature into CloudTAK's
    // internal InputFeature format (adds required fields: callsign, type,
    // time, start, stale, center, etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const norm = await normalize_geojson(feat as any);

    // authored: true is the key flag.
    //   With active mission  → links feature to mission + broadcasts to TAK Server
    //   Without active mission → adds to local map for this session only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await mapStore.worker.db.add(norm as any, { authored: true });
}
```

The `as any` casts are required because `normalize_geojson` types `path` as
`string | undefined` but `InputFeature` requires `string`. The cast is safe —
the runtime value is correct, only the declared type is imprecise.

### Optional: post a DataSync log entry (CloudTAK 13.2+ / PR #1454)

```typescript
import { std } from '../../../src/std.ts';

if (missionGuid.value && wantLogEntry) {
    await std(`/api/marti/missions/${encodeURIComponent(missionGuid.value)}/log`, {
        method: 'POST',
        body: {
            content: 'Human-readable description',
            dtg: new Date().toISOString(),
            keywords: ['your', 'keywords'],
            entryUid: String(geojsonFeatureCollection.features[0].id)
            // entryUid links the log entry to a specific CoT UID
        }
    });
}
```

---

## What `normalize_geojson` does

`@tak-ps/node-cot/normalize_geojson` takes a plain GeoJSON Feature and fills
in all the CloudTAK-required properties: `callsign`, `type`, `how`, `time`,
`start`, `stale`, `center`, and others.

Your input features need at minimum:

| Property | Description |
|---|---|
| `id` | A UUID string — becomes the CoT UID |
| `properties.callsign` | Display name shown on the map |
| `properties.type` | CoT type string (e.g. `a-f-G`, `u-d-c-c`, `u-rb-a`) |
| `geometry` | Standard GeoJSON geometry |

For specialized CoT detail (e.g. `shape.ellipse` for uncertainty circles, arc
geometry for RTT wedges), set those in `properties` before normalizing —
CloudTAK passes them through to the CoT XML.

---

## Why `authored: true` is the key flag

Without `authored: true`, `db.add` is a passive local read — the feature
appears on your map but is **not** broadcast to TAK Server.

With `authored: true` and an active mission, the worker fires a
`sub.feature.update` event that:

1. Broadcasts the CoT to TAK Server via the user's existing connection.
2. Tags it with `<dest mission="NAME"/>` so TAK Server links it to the mission.
3. The feature appears in the mission for all other connected users.

---

## Installation pattern for any plugin using this approach

Place the plugin directory at `api/web/plugins/<name>/` inside the CloudTAK
checkout. The loader auto-discovers it via `import.meta.glob` in
`api/web/src/main.ts` — no manual wiring needed. Rebuild the web tier:

```bash
docker compose build --no-cache cloudtak-api
docker compose up -d --force-recreate cloudtak-api
```

No server routes. No fork. No config changes.
