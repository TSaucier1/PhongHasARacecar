# AXtime Next

A modern rebuild of **AXtime RM**, the autocross timing and scoring app Chesapeake Region PCA has run since 2016. It keeps
the same screens, flows and look, so workers who know the old app can pick it up quickly. Underneath, it's rebuilt so rules
can change without code surgery.

**Status: demo / early beta.** The core event-day loop works:
- registration and check-in
- queue
- timing (hardware or manual)
- cone calls with lettered stations
- live results

Seasons and points, imports, printouts and polish come next. See [What's not done yet](#whats-not-done-yet).

## Running it

**Windows (event laptop):** double-click `AXtimeNext.exe`. A window opens showing the addresses to use. Open
`http://localhost:8080` on the laptop. Phones and tablets on the same Wi-Fi use the other address it prints. Keep the
window open during the event, and close it to stop. Data is stored in an `axtime-data` folder next to the .exe; back up
that folder.

**Docker (Unraid or any server):** see `docker/`. Copy `docker-compose.yml`, `Dockerfile.prebuilt` and the Linux
`axtime-next` file into one folder, then run this from that folder:

```
docker compose up -d --build
```

Open `http://<server-ip>:8090`.

To build the Docker image from source instead (no prebuilt file needed), run this from the repo root:

```
docker build -t axtime-next .
```

**Settings (environment variables):**
- `AX_PORT`: web port (default 8080)
- `AX_DATA_DIR`: where the database lives

## Developing

Needs Node 22 (22.13 or newer). Install the dependencies:

```
npm install
```

Build the starter database from the old AXtime export (the `json/` folder of the CSV export):

```
npm run seed -- /path/to/export/json
```

Start the server (port 8080, reloads on change):

```
npm run dev
```

The server serves the built web app from `dist/web`. Build it once first:

```
npm run build:web
```

Or run Vite's dev server on port 5173 instead, which proxies to a server on 8181:

```
npm run dev:web
```

Type-check everything:

```
npm run typecheck
```

Run the timer parser tests (simulated serial data):

```
npm test
```

Replay every past event against the published results:

```
npm run test:baseline -- data/seed.db /path/to/baseline/stored
```

Build the Windows .exe and Linux executable into `dist/release/`:

```
npm run build
```

The build downloads matching Node runtimes from npm (cached in `.cache/`), bundles the server and web app, and turns them
into single-file executables with Node's single-executable feature. Starter data in `data/seed.db` is embedded if present.

## How it's put together

| Path | What it is |
|---|---|
| `src/shared/scoring.ts` | **The scoring engine.** Pure functions: runs in, results out. Every rule is a setting (`EventRules`, `PointsRules`). |
| `src/server/events.ts` | Event-day operations: registrations, queue, timer start/finish, cone calls, run edits, audit log |
| `src/server/hardware.ts` | Serial timing: JA Circuits/FarmTek Normal and Chrono, RaceAmerica TLink. Formats ported from the original. |
| `src/server/main.ts` | Web server (Fastify), live updates (Socket.IO), first-run setup, serving the web app |
| `src/server/db.ts` | SQLite schema. Times are whole milliseconds; cone stations are text, so "A", "B" or "Slalom" all work. |
| `src/server/import-legacy.ts` | Imports the old AXtime database export |
| `web/src/` | Vue 3 + Vuetify screens, styled after the original |
| `tests/` | Timer parser tests; the baseline replay against published results |

### Scoring rules (per event, editable on the Event Setup screen)
- **Cone penalty:** seconds per cone.
- **Counted runs per driver:** 0 = no limit. Re-runs don't count, and runs are always taken in run order (this fixes the
  old app's Recalculate bug).
- **Cones on off-course runs:** whether they count toward a driver's cone total.
- **PAX rounding:** truncate (the original's behavior) or round.
- **PAX exclusions:** classes left out of PAX results (originally anything containing "fun").
- **Class grouping:** classes in the same PAX group (e.g. OC_PAX-xx) are ranked together on PAX time.

### Checked against history
Replaying all 73 past events (2016 to May 2024) through the new engine reproduces the published results. Every
difference has a known cause:
- drivers reclassed after running (the old app kept the old PAX index)
- 0.001 s rounding differences in the old app
- an old run-numbering glitch
- ties the old app ordered arbitrarily
- stale values the old app left behind

## What's not done yet
- Season standings and points pages. Points are calculated per event, but there's no standings screen.
- Printouts, exports, MotorsportReg import, member management screens.
- Logins and roles. Anyone on the network can use any screen. The role picker only labels the audit log.
- Announcer and timer-display screens; split timing; the RA6X80 display board.
- Tested against simulated serial data only. **Needs a bench test with the real timer before an event.**
