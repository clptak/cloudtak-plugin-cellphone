# CloudTAK Cellphone Plugin

A CloudTAK plugin that adds a "Cell Ping / RTT" menu item for manually
entering cellphone-derived location data and posting it to a DataSync
mission as CoT features.

Ports the `ping2tak` and `rtt2tak` HTTP endpoints from the node-red
SAROPS deployment into a fully client-side CloudTAK plugin.

## Features

- **Cell Ping** — given a tower location, range, and azimuth, produces a
  `u-d-c-c` (Circle) feature with the required `shape.ellipse` detail so
  TAK clients render the uncertainty circle natively.
- **RTT (Round Trip Time)** — given a tower location, azimuth and
  distance, produces a `u-rb-a` arc (±70° wedge) plus an `a-f-G` point
  for the tower.
- Coordinate parsing for **DD / DMS / DM / MPS** formats (US-SW band).
- Optional **DataSync mission log entry** linked to the posted CoT via
  `entryUid`.
- Automatic map refresh after a successful mission post.

## How it works

The form parses the coordinate string and builds GeoJSON features
entirely in the browser, then:

- **With an active DataSync mission** — posts features via CloudTAK's
  `POST /api/marti/missions/:guid/cot` endpoint, which broadcasts them
  as CoT through the user's TAK connection with a
  `<marti><dest mission="...">` tag so they appear as map-visible
  features in the mission. Optionally posts a mission log entry via
  `POST /api/marti/missions/:guid/log`.
- **Without an active mission** — writes the features into the local
  feature DB (`db.feature.put`) so they render on the map for the local
  session only.

## Requirements

CloudTAK with the following endpoints, which are part of
[dfpc-coe/CloudTAK PR #XXXX](https://github.com/dfpc-coe/CloudTAK/pulls):

- `POST /api/marti/missions/:guid/cot` — broadcasts user-authored
  features as CoT into a mission feature stream.
- `entryUid` (and `contentHashes`) accepted on
  `POST /api/marti/missions/:name/log` so the log entry links to the
  CoT.

Until that PR merges, the plugin requires CloudTAK built from a branch
with those two additions.

## Installation

Drop this repo's files into your CloudTAK build at
`api/web/plugins/ping/`:

```bash
# from your CloudTAK checkout root
mkdir -p api/web/plugins/ping
cp -r /path/to/cloudtak-plugin-cellphone/* api/web/plugins/ping/
```

Plugin files mirror the directory layout expected by CloudTAK's plugin
loader, so no rewiring is needed. The loader auto-discovers the plugin
via the `import.meta.glob` in CloudTAK's `api/web/src/main.ts`.

Rebuild CloudTAK's web tier — for a Dockerized stack:

```bash
docker compose build --no-cache cloudtak-api
docker compose up -d --force-recreate cloudtak-api
```

Then reload the CloudTAK UI. A **Cell Ping / RTT** entry appears in the
main menu.

## Usage

1. Open **Cell Ping / RTT** from the main menu.
2. Pick the mode (Cell Ping or RTT).
3. Enter:
   - **Name / Callsign** — identifies the produced feature(s).
   - **Coordinates** — tower location in any of DD / DMS / DM / MPS.
   - **Range** (Cell Ping) or **Distance** (RTT) — in meters by default;
     uncheck the meters box to use miles.
   - **Azimuth** (RTT only) — degrees from true north to the center of
     the wedge.
   - **Date / Time** — local time of the observation; converted to UTC
     for the DataSync log entry's `dtg`.
4. Toggle **Add DataSync Log** if you want a mission log entry linked
   to the produced CoT (only available when a mission is active).
5. **Submit**.

If a DataSync mission is active, the features are posted there and the
map auto-refreshes. If no mission is active, features write to the local
session only.

## Known limitations

- The coordinate parser regexes are hard-coded to US-SW latitude (`3X`)
  and longitude (`11X`) bands — preserved from the source node-red
  flows. Adjust the regex character classes in
  [lib/coordinates.ts](lib/coordinates.ts) for other regions.
- The Cell Ping `shape.ellipse` uses `major = minor = range` and
  `angle = 0`, producing a circle. The TAK type `u-d-c-c` rendering
  varies between TAK clients.
- RTT `dtg` treats the input local-datetime as UTC (suffix `:00.0Z`),
  preserved from the source flow for parity with downstream tooling.

## Development

Files are TypeScript / Vue 3 SFC, built into the CloudTAK SPA bundle by
Vite. No separate build step is required for the plugin itself — just
copy the files into a CloudTAK build and rebuild the web tier.

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

Originally ported from a node-red SAROPS deployment. Designed for use
with CloudTAK by [dfpc-coe](https://github.com/dfpc-coe/CloudTAK).
