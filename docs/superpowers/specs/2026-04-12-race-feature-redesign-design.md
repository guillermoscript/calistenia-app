# Race Feature Redesign

**Date:** 2026-04-12
**Status:** Draft — awaiting user review
**Owner:** Guillermo

## Problem

The current race feature (create/join/run a live cardio race with friends) is broken in production. Concrete symptoms:

1. **Progress never writes.** During and after a race, participants stay at 0 km on the leaderboard. The user's own stats never sync to `race_participants` even though the write path exists in `CardioSessionContext`.
2. **Map is broken.** Route displays, but live participant positions (`last_lat`/`last_lng`) are not visible — for the user or for friends.
3. **Start is desynchronized.** Each participant taps "EMPEZAR A CORRER" on their own clock after the countdown, so elapsed times are not comparable.
4. **Flow is fragmented.** Race lives in `/race/:id`, but tracking redirects to `/cardio?race=X&participant=Y&raceTarget=Z`. This causes re-mounts, potential auth loss, and the user loses the leaderboard while running.
5. **Cardio context is overloaded.** `CardioSessionContext` handles both normal cardio sessions and race progress writes, coupling two unrelated features and making both harder to reason about.
6. **DB allows duplicates.** No unique index on `(race, user)`. Legacy non-idempotent join code created duplicate participant rows, and the cliente still carries dedupe band-aid logic in `useRace.loadRace` and `subscribeToRace`.
7. **No anti-cheat surface.** Any client can write any distance to their own participant row at any time. No server validation of progress sanity or of race status window.
8. **Stale races hang.** A race with `status='active'` stays active forever if the creator never taps Finish.

## Root cause of the "always 0 km" bug

The write path in `CardioSessionContext` (lines 249-337) is logically correct on paper. The most likely failure modes, in order of probability:

- **Silent update failures.** Errors are swallowed with `console.warn` only. If auth is lost on navigation to `/cardio?race=...` (new tab, stale token, refresh), the PB `updateRule: @request.auth.id = user` rejects the update and the user never sees anything.
- **Effect does not fire.** `CardioSessionPage` auto-starts tracking from URL params inside a `useEffect` whose deps include the `start` callback. If `start`'s identity changes, the effect can re-fire, and `start()` resets `distanceRef = 0`, overwriting progress. Under the right timing, progress is always zero at push time.
- **Re-mounts.** Navigating between `/race/:id` and `/cardio?race=...` causes `RacePage` to unmount and lose its subscription, while `CardioSessionPage` mounts fresh. `raceParticipantId` has to round-trip through URL params and state setters.

The fix is not to patch these individually. It is to eliminate the redirect, move race tracking into a dedicated context, and make failures visible.

## Goals

- Leaderboard, own stats, and live map all update in real time during a race.
- Countdown and elapsed time are synchronized across participants using server time.
- Users never leave the `/race/:id` screen during a race. GPS tracking runs inside a dedicated race context, not through the cardio session page.
- Two race modes ship: **distance** (first to reach X km wins) and **time** (most distance in X minutes wins). Route-based racing is out of scope for this iteration.
- Failures (auth loss, PB update errors, GPS errors) are visible to the user.
- Duplicate participant rows become impossible at the DB level.
- Cardio session context has zero race-specific code after this redesign.

## Non-goals

- Route-based race mode (progress measured along a polyline). Tracked as follow-up.
- Public / open races with random matchmaking. Friends-only, link-share.
- Anti-cheat beyond basic server-side status-window enforcement. No teleport detection, no pace-sanity checks, no heuristic flags in this iteration.
- Replay of a finished race from a stored GPS track. `gps_track` is stored for future use, not consumed in v1.
- Scaling beyond ~10 concurrent participants per race. The design assumes small groups.

## Design

### Data model

Two collections are redesigned. Migrations preserve existing field IDs where fields already exist, per the migration safety rule.

**`races`**

| Field | Type | Notes |
|---|---|---|
| `id` | string | PB default |
| `creator` | relation → users | required |
| `name` | text | required, max 60 |
| `mode` | text | required, `'distance' \| 'time'` |
| `target_distance_km` | number | required if `mode='distance'`, else 0 |
| `target_duration_seconds` | number | required if `mode='time'`, else 0 |
| `status` | text | `'waiting' \| 'countdown' \| 'active' \| 'finished' \| 'cancelled'` |
| `starts_at` | datetime | set by server when creator triggers countdown, `now() + 7s` |
| `ends_at` | datetime | `starts_at + 3h`, used for auto-cancel |
| `finished_at` | datetime | nullable, set when status transitions to `'finished'` |
| `route_points` | json | nullable, decorative only in v1 |
| `created` / `updated` | auto | PB |

Indexes:
- `CREATE INDEX idx_races_creator ON races (creator, status)`
- `CREATE INDEX idx_races_status ON races (status)`

Rules:
- `listRule`: `@request.auth.id != ""`
- `viewRule`: `@request.auth.id != ""`
- `createRule`: `@request.auth.id = creator`
- `updateRule`: `@request.auth.id = creator && status != "finished" && status != "cancelled"`
- `deleteRule`: `@request.auth.id = creator && status = "waiting"`

**`race_participants`**

| Field | Type | Notes |
|---|---|---|
| `id` | string | PB default |
| `race` | relation → races, cascade delete | required |
| `user` | relation → users | required |
| `display_name` | text | required |
| `status` | text | `'joined' \| 'ready' \| 'racing' \| 'finished' \| 'dnf'` |
| `distance_km` | number | default 0 |
| `duration_seconds` | number | default 0 |
| `avg_pace` | number | default 0 |
| `last_lat` | number | nullable |
| `last_lng` | number | nullable |
| `last_update` | datetime | nullable |
| `finished_at` | datetime | nullable |
| `gps_track` | json | array of `{lat, lng, t}`, written on finish, not per push |

Indexes:
- **`CREATE UNIQUE INDEX idx_rp_unique ON race_participants (race, user)`** — kills the duplicate-row class of bugs at the source.
- `CREATE INDEX idx_rp_race_distance ON race_participants (race, distance_km)`

Rules:
- `listRule`: `@request.auth.id != ""`
- `viewRule`: `@request.auth.id != ""`
- `createRule`: `@request.auth.id = user && race.status = "waiting"`
- `updateRule`: `@request.auth.id = user && (race.status = "active" || race.status = "countdown")`
- `deleteRule`: `@request.auth.id = user && status = "joined"`

The `updateRule` status window is the core anti-cheat mechanism for v1: clients cannot write progress before the race is live or after it is closed.

### Phase machine

Replaces the current ad-hoc `status + needsToStartTracking` logic with an explicit state:

```
lobby → countdown → racing → finished
  ↓         ↓         ↓
cancelled cancelled cancelled
```

- **lobby** (`race.status='waiting'`): participants join, mark ready, creator starts.
- **countdown** (`race.status='countdown'`, `starts_at` in future): fullscreen overlay, server-synced, ticks to zero.
- **racing** (`race.status='active'`): tracking is live, leaderboard updates, single screen.
- **finished** (`race.status='finished'`): results, podium, share card. Reached when creator taps Finish, when every participant has status `'finished'`, or when `ends_at` has passed.
- **cancelled** (`race.status='cancelled'`): creator cancelled pre-race or mid-race. Terminal.

### Architecture

```
src/
  types/race.ts
  lib/race/
    raceApi.ts              CRUD on PB collections. No state.
    raceRealtime.ts         subscribeRace(id) → returns {unsub, onRace, onParticipants}
                            Server-side filter. Single source. Dedupe by id.
    raceClock.ts            serverNow(), msUntil(datetime). One-shot offset measurement.
    raceTracker.ts          Dedicated GPS tracker for races. Independent of cardio tracker.
  contexts/
    RaceContext.tsx         Owns race state + GPS + realtime + progress push.
                            Exposes: phase, race, participants, me, actions.
  hooks/
    useRaceContext.ts       Selector hook
    useRaceCountdown.ts     Server-synced countdown derived from race.starts_at
  pages/
    RacePage.tsx            <RaceProvider raceId={id}> + phase router
  components/race/
    RaceLobby.tsx
    RaceCountdown.tsx       Fullscreen server-synced countdown
    RaceLive.tsx            Map + my stats + leaderboard in ONE screen
    RaceResults.tsx
    RaceMap.tsx             Reusable: route polyline + participant markers
    CreateRaceDialog.tsx    Mode picker + target input + optional route
```

`CardioSessionContext` loses all race-specific code: lines 249-337 (race progress effect + race closure effect), lines 510-515 (race params in `start()`), lines 617-641 (race finish update in `finish()`), and race fields on the persisted snapshot. The `start()` signature drops race parameters. `CardioSessionPage`'s auto-start-from-URL-race block is deleted.

### Component responsibilities

- **`RaceProvider` / `RaceContext`**: on mount, subscribe to race + participants via `raceRealtime`, load initial data, compute phase from `race.status`. Owns a `raceTracker` instance that starts when phase enters `racing` and stops when it leaves. Pushes progress to PB every 3 seconds via `raceApi.updateProgress`. Surfaces errors via a `lastError` field consumed by the UI. Cleans up GPS watch, realtime subscriptions, and wake lock on unmount.

- **`raceTracker`**: dedicated GPS tracker. `watchPosition` with high accuracy. Haversine distance, smoothing on accuracy > 30m, maintains in-memory `gps_track` array. Calls a callback with `{distance_km, duration_seconds, avg_pace, last_lat, last_lng}` on each valid update. Much smaller than `CardioSessionContext`'s tracker: no splits, no sounds, no auto-pause, no persist to localStorage.

- **`raceClock`**: on subscribe, measures PB server time vs `Date.now()` once (via a cheap collection read or a dedicated endpoint) and stores offset. `serverNow()` returns `Date.now() + offset`. `msUntil(datetime)` returns ms until that datetime in server-synced terms. Countdown UI uses `msUntil(race.starts_at)`, not a local interval against a local start.

- **`RacePage`**: thin router.
  ```tsx
  <RaceProvider raceId={id}>
    {phase === 'lobby'     && <RaceLobby />}
    {phase === 'countdown' && <RaceCountdown />}
    {phase === 'racing'    && <RaceLive />}
    {phase === 'finished'  && <RaceResults />}
    {phase === 'cancelled' && <RaceCancelled />}
  </RaceProvider>
  ```

- **`RaceLive`**: single screen. Map at top (route polyline + every participant marker + my live position), my stats bar (distance, duration, pace, target progress), leaderboard list below. No redirects. No "EMPEZAR A CORRER" button. Tracking has already started because `phase === 'racing'` implies `starts_at` has passed and the tracker is running.

### Data flow

**Create → Lobby**
1. Creator opens `CreateRaceDialog`, picks mode (distance or time), enters name + target, optional route.
2. `raceApi.createRace` writes a `races` row with `status='waiting'`.
3. Navigate to `/race/:id`. `RaceProvider` subscribes.
4. Creator shares link. Friends open `/race/:id`, `joinRace` creates a `race_participants` row. Unique index makes this naturally idempotent — on conflict, fetch the existing row.
5. Participants optionally mark ready (`status='ready'`).

**Start**
1. Creator taps Start. `raceApi.startCountdown` sets `races.status='countdown'`, `starts_at = serverNow() + 7000ms`, `ends_at = starts_at + 3h`.
2. Every subscribed client sees the update, transitions to `phase='countdown'`, renders `RaceCountdown` fullscreen.
3. `RaceCountdown` uses `raceClock.msUntil(starts_at)` to tick down. At zero, it does nothing itself — it waits for the race status update.
4. A client (the creator, or the first client whose countdown hits zero) calls `raceApi.activateRace` which sets `races.status='active'`. This is a write-once gate; PB's updateRule prevents regression.
5. Every client transitions to `phase='racing'`. `RaceProvider` starts the tracker. Initial participant status updates to `'racing'`.

**During race**
1. Tracker fires every ~1s locally. Every 3s, `RaceProvider` pushes `{distance_km, duration_seconds, avg_pace, last_lat, last_lng, last_update, status: 'racing'}` to the user's own `race_participants` row via `raceApi.updateProgress`.
2. On failure (non-404 error from PB), `lastError` is set and surfaced in the UI with a retry banner. Retries continue automatically; the user is not silently in the dark.
3. Realtime delivers every other participant's updates. `RaceLive` re-renders leaderboard + map markers.
4. Auto-finish: for `mode='distance'`, when the user's `distance_km >= target_distance_km`, push one final update with `status='finished'`, `finished_at=serverNow()`, and the full `gps_track`. For `mode='time'`, when `serverNow() - starts_at >= target_duration_seconds * 1000`, do the same.
5. Race closes when all participants have `status='finished'`, when creator taps Finish, or when `ends_at` has passed (any client can trigger the transition to `finished`, though only the creator's client actively checks and writes).

**Finish**
1. `races.status='finished'`, `finished_at=serverNow()`.
2. Any participant still `'racing'` at that moment is frozen with their current stats and marked `'dnf'` (for distance mode, if they did not reach target) or `'finished'` (for time mode).
3. `phase='finished'`, `RaceResults` renders podium, per-participant stats, share card.
4. Optional action: "Save as workout" — explicitly copies the race into a `cardio_sessions` row so it lands in the user's normal cardio history. Not automatic.

### Error handling and visibility

- **Auth loss mid-race.** `raceApi.updateProgress` detects 401/403, emits `authError` on the context. `RaceLive` shows a banner: "Se perdió tu sesión, vuelve a iniciar sesión para seguir compitiendo". Tracker keeps running locally so data is not lost; pushes resume after re-auth.
- **PB update 400/500.** Logged visibly via a toast. Retries with backoff (1s, 3s, 9s). After 3 failures the banner appears.
- **GPS errors.** The tracker surfaces `gpsError` which is rendered in the stats bar. No silent failures.
- **Network offline.** Tracker keeps pushing to a local queue; flushes on reconnect. `gps_track` is the canonical local buffer.

### Testing

- **Unit**: `raceClock.msUntil` with mocked offsets. `raceTracker` distance/pace math with synthetic GPS streams. Phase-machine transitions in `RaceContext` with a mocked PB.
- **Integration (Playwright via two browser contexts)**: create race in context A, join in context B, start, assert both transition to `racing` within 8s of countdown trigger, assert leaderboard updates in A reflect B's pushed progress within 4s, assert finish transition and result view in both contexts.
- **Manual**: test under real GPS on a short loop with two physical devices. Verify no redirects, no 0-km bug, countdown syncs within ~500ms between devices.

## Migrations

Three migrations, all idempotent:

1. `upgrade_races_schema.js`
   - Add `mode`, `target_duration_seconds`, `ends_at`, `route_points` (already exists in some installs — skip if present).
   - Convert `started_at` and `finished_at` from `text` to `datetime`, preserving `field.id`.
   - Rename `started_at` → `starts_at`.
   - Update `status` allowed values (text remains, no enum).
   - Update collection rules.

2. `upgrade_race_participants_schema.js`
   - Add `gps_track` (json), extend `status` values.
   - Convert `last_update` and `finished_at` from `text` to `datetime`, preserving `field.id`.
   - **Dedupe existing duplicate rows** by `(race, user)` keeping the row with the highest `distance_km`, deleting the rest. This must run before the unique index.
   - Create `UNIQUE INDEX idx_rp_unique ON race_participants (race, user)`.
   - Update collection rules.

3. `cleanup_stale_races.js` (optional, one-shot)
   - Mark any `race` with `status='active'` older than 24h as `cancelled`.

All field-type changes preserve `field.id` per the project's migration safety rule, or the data is lost.

## Rollout

1. Land migrations on staging, run Playwright integration test.
2. Land code changes behind no flag — this is a full replacement, not A/B. The feature is already broken, so there is no regression risk from swapping.
3. Delete old code: race-specific blocks in `CardioSessionContext`, old `useRace.ts`, old race components. Keep git history for reference.
4. Ship to prod. Monitor Sentry for `raceApi` errors for 48h.
5. Announce to daily-users (you). Real-world test on a two-device run.

## Open questions

- Should `gps_track` be written progressively (every push) or only on finish? v1 writes on finish to minimize PB load; progressive may be needed if the tracker loses data on crash. Deferred until observed.
- Should creator be able to kick a participant from lobby? Not in v1.
- Should a participant be able to leave an active race cleanly (voluntary DNF button)? Yes, small button in `RaceLive`, sets own status to `'dnf'`.
- QR-code join flow for in-person races? Nice-to-have, not v1.

## Files touched

**New:**
- `src/types/race.ts`
- `src/lib/race/raceApi.ts`
- `src/lib/race/raceRealtime.ts`
- `src/lib/race/raceClock.ts`
- `src/lib/race/raceTracker.ts`
- `src/contexts/RaceContext.tsx`
- `src/hooks/useRaceContext.ts`
- `src/hooks/useRaceCountdown.ts`
- `src/components/race/RaceCountdown.tsx`
- `src/components/race/RaceLive.tsx`
- `src/components/race/RaceMap.tsx` (replaces `RaceRouteMap.tsx`)
- `pb_migrations/*_upgrade_races_schema.js`
- `pb_migrations/*_upgrade_race_participants_schema.js`

**Rewritten:**
- `src/pages/RacePage.tsx`
- `src/components/race/RaceLobby.tsx`
- `src/components/race/RaceResults.tsx`
- `src/components/race/CreateRaceDialog.tsx`

**Modified (race code removed):**
- `src/contexts/CardioSessionContext.tsx` — drop lines 249-337, 510-515, 617-641, race fields from snapshot, race params from `start()` signature.
- `src/pages/CardioSessionPage.tsx` — drop URL race params handling and auto-start-race block.

**Deleted:**
- `src/hooks/useRace.ts`
- `src/components/race/RaceLiveDashboard.tsx`
- `src/components/race/RaceRouteMap.tsx` (replaced by `RaceMap.tsx`)

**Untouched for now:**
- `src/components/race/RaceShareCard.tsx`, `RouteDrawer.tsx` — reused as-is.
