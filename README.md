# CloudTAK Cellphone Plugin

A CloudTAK plugin that adds a "Cell Ping / RTT" menu item for manually
entering cellphone-derived location data and posting it to a DataSync
mission as CoT features.

Ports the `ping2tak` and `rtt2tak` HTTP endpoints from the node-red
SAROPS deployment into a fully client-side CloudTAK plugin.

<img width="200" height="250" alt="CloudTAK_plugin_RTTTA" src="https://github.com/user-attachments/assets/35ae1d30-863e-483c-874d-5a3416ca3072" />

<img width="200" height="279" alt="CloudTAK_plugin_email-parse" src="https://github.com/user-attachments/assets/528a265d-1c5b-4254-94ee-5d530855e426" />



## Features

- **Cell Ping** — given a tower location, range, and azimuth, produces a
  `u-d-c-c` (Circle) feature with the required `shape.ellipse` detail so
  TAK clients render the uncertainty circle natively.
- **RTT (Round Trip Time)** — given a tower location, azimuth and
  distance, produces a `u-rb-a` arc (±70° wedge) plus an `a-f-G` point
  for the tower.
- **Email Parse** — paste a carrier "location result" email body
  (Verizon, AT&T, or T-Mobile) and the plugin extracts latitude,
  longitude, uncertainty radius, and the transaction time, then plots
  the same `u-d-c-c` (Circle) feature as Cell Ping. The DataSync log
  `dtg` uses the transaction instant in UTC; a selectable US **market
  time zone** controls only how the callsign timestamp is displayed.
- Coordinate parsing for **DD / DMS / DM / MPS** formats (global lat/lon).
- Optional **DataSync mission log entry** linked to the posted CoT via
  `entryUid`.
- Automatic map refresh after a successful mission post.

## How it works

The form parses the coordinate string and builds GeoJSON features
entirely in the browser, then passes them to CloudTAK's map worker via
`mapStore.worker.db.add(feature, { authored: true })` — the same
mechanism used by CloudTAK's built-in drawing tools.

- **With an active DataSync mission** — the worker automatically links
  each feature to the mission and broadcasts it to TAK Server over the
  user's existing connection. Optionally posts a DataSync log entry via
  `POST /api/marti/missions/:guid/log`.
- **Without an active mission** — features appear on the local map for
  the current session only.

No custom server routes are required. The plugin works with an
unmodified upstream CloudTAK installation.

## Requirements

- **CloudTAK** — upstream `main` branch from
  [dfpc-coe/CloudTAK](https://github.com/dfpc-coe/CloudTAK). No fork
  or custom routes needed.
- `POST /api/marti/missions/:name/log` — available in CloudTAK 13.2+
  ([PR #1454](https://github.com/dfpc-coe/CloudTAK/pull/1454)).
  Required only if you use the **Add DataSync Log** option.

## Installation

**1. Clone the plugin into your CloudTAK tree**

```bash
# from your CloudTAK checkout root
git clone https://github.com/clptak/cloudtak-plugin-cellphone.git api/web/plugins/ping
```

The plugin directory is listed in CloudTAK's `.gitignore` so git will
not track or overwrite it. The loader auto-discovers it via
`import.meta.glob` in `api/web/src/main.ts` — no wiring needed.

**2. Rebuild and restart**

For a Dockerized stack:

```bash
docker compose build --no-cache cloudtak-api
docker compose up -d --force-recreate cloudtak-api
```

Then reload the CloudTAK UI. A **Cell Ping / RTT** entry appears in the
main menu.

**Updating the plugin**

```bash
cd api/web/plugins/ping
git pull
cd ../../../..
docker compose build --no-cache cloudtak-api
docker compose up -d --force-recreate cloudtak-api
```

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

### Email Parse tab

1. Open **Cell Ping / RTT** and select the **Email Parse** tab.
2. Choose the **Carrier** (Verizon, AT&T, or T-Mobile).
3. Choose the **Market Time Zone** (US zones) — this only affects the
   callsign timestamp; the DataSync `dtg` is always UTC.
4. Paste the full carrier location-result email body into the text box.
5. Toggle **Add to Active DataSync** to also write a mission log entry
   (only available when a mission is active).
6. **Submit**. The plugin extracts the coordinates, uncertainty radius,
   and transaction time, plots the uncertainty circle, and — if enabled
   — posts a log entry with the transaction time as `dtg`.

Carrier time zones are read from the email body itself: Verizon
`Timestamp` and AT&T `located on ... GMT` are UTC; T-Mobile
`Pacific Standard/Daylight Time` is US Pacific. These determine the true
instant used for `dtg`.

## Known limitations

- Compass-direction suffixes (e.g., `34.12345N 118.56789W`) are not
  parsed. Use a leading hyphen for negative values.
- The first number in the input is treated as latitude, the second as
  longitude — there is no auto-detection by magnitude.
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
