# Race Feature Redesign — Implementation Plan

**Spec:** [2026-04-12-race-feature-redesign-design.md](./2026-04-12-race-feature-redesign-design.md)
**Date:** 2026-04-12
**Status:** Draft

## Strategy

Build the new stack in parallel with the old one, then flip. Each phase lands as its own commit and leaves the app buildable and runnable. Old race code stays live until Phase 7, so nothing breaks during implementation.

- Phases 1-2: foundation (types, migrations). No UI impact.
- Phases 3-5: new lib + context + components, unreferenced. Old feature still works (well, still broken, but unchanged).
- Phase 6: flip `RacePage` to the new context. Remove `/cardio?race=...` redirect path.
- Phase 7: delete dead code, strip race code from `CardioSessionContext`.
- Phase 8: test, tune, ship.

Each phase has a **checkpoint**: build passes, typecheck passes, manual smoke-test of the affected surface. Do not start the next phase until the checkpoint is green.

---

## Phase 1 — Types and migrations

**Goal:** DB schema and TS types ready. App still compiles and runs. Old race feature still "works" as before.

### 1.1 Update `src/types/race.ts` (new file, extracted from `types/index.ts`)

```ts
export type RaceMode = 'distance' | 'time'
export type RaceStatus = 'waiting' | 'countdown' | 'active' | 'finished' | 'cancelled'
export type ParticipantStatus = 'joined' | 'ready' | 'racing' | 'finished' | 'dnf'

export interface Race {
  id: string
  creator: string
  name: string
  mode: RaceMode
  target_distance_km: number
  target_duration_seconds: number
  status: RaceStatus
  starts_at: string          // ISO datetime, server-set
  ends_at: string            // ISO datetime
  finished_at: string | null
  route_points: Array<{ lat: number; lng: number }> | null
  created: string
  updated: string
}

export interface RaceParticipant {
  id: string
  race: string
  user: string
  display_name: string
  status: ParticipantStatus
  distance_km: number
  duration_seconds: number
  avg_pace: number
  last_lat: number | null
  last_lng: number | null
  last_update: string | null
  finished_at: string | null
  gps_track: Array<{ lat: number; lng: number; t: number }> | null
}

export interface RaceGpsPoint {
  lat: number
  lng: number
  t: number  // ms since race start
}
```

Update `src/types/index.ts` to re-export from `./race` and remove the old inline definitions.

### 1.2 Migration: `pb_migrations/<ts>_upgrade_races_schema.js`

- Fetch `races` collection.
- Add field `mode` (text, required, default `'distance'`) — skip if present.
- Add field `target_duration_seconds` (number, default 0) — skip if present.
- Add field `ends_at` (datetime, nullable) — skip if present.
- Rename `started_at` → `starts_at` while preserving `field.id`.
- Convert `starts_at` from text → datetime preserving `field.id`.
- Convert `finished_at` from text → datetime preserving `field.id`.
- Update `updateRule`: `@request.auth.id = creator && status != "finished" && status != "cancelled"`.
- Update `deleteRule`: `@request.auth.id = creator && status = "waiting"`.
- Add index: `CREATE INDEX idx_races_status ON races (status)`.
- Down: restore previous field types by id and revert rules.

**Safety:** follow the project rule — `field.id` must be preserved on type changes or data is lost. Read existing fields first, reuse their `id`, only change `type`.

### 1.3 Migration: `pb_migrations/<ts>_upgrade_race_participants_schema.js`

- Fetch `race_participants` collection.
- Add field `gps_track` (json, nullable) — skip if present.
- Convert `last_update` from text → datetime preserving `field.id`.
- Convert `finished_at` from text → datetime preserving `field.id`.
- **Dedupe pass before adding the unique index**: list all rows grouped by `(race, user)`, keep the row with the highest `distance_km`, delete the rest. Log deletions.
- Create `UNIQUE INDEX idx_rp_unique ON race_participants (race, user)`.
- Create `CREATE INDEX idx_rp_race_distance ON race_participants (race, distance_km)`.
- Update `createRule`: `@request.auth.id = user && race.status = "waiting"`.
- Update `updateRule`: `@request.auth.id = user && (race.status = "active" || race.status = "countdown")`.
- Down: drop indexes, revert rules, drop `gps_track`.

### 1.4 Checkpoint

- `bun run build` passes.
- `bun run typecheck` passes (expect errors in old `useRace.ts` / `CardioSessionContext.tsx` if the types changed shape — fix by adding nullable where needed or leave as `any` locally with a `// TODO phase 7` comment; do not rewrite logic yet).
- Migrations run cleanly on a fresh PB instance and on a prod-like snapshot.
- Old race UI still opens without runtime errors (even if it still has the 0-km bug — that's fine, it's dead code walking).

**Commit:** `feat(race): schema upgrade + typed race model`

---

## Phase 2 — `lib/race/` foundation

**Goal:** Pure libraries with zero React. Unit-testable. No UI wiring yet.

### 2.1 `src/lib/race/raceApi.ts`

Functions, no state:

- `createRace(input: { name, mode, target_distance_km?, target_duration_seconds?, route_points? }): Promise<Race>`
- `loadRace(id: string): Promise<{ race: Race; participants: RaceParticipant[] }>`
- `joinRace(raceId: string, displayName: string): Promise<RaceParticipant>` — idempotent via unique index: on conflict, fetch existing.
- `markReady(participantId: string): Promise<void>`
- `startCountdown(raceId: string, countdownSeconds: number): Promise<Race>` — sets `status='countdown'`, `starts_at = serverNow() + countdownSeconds*1000`, `ends_at = starts_at + 3h`.
- `activateRace(raceId: string): Promise<Race>` — sets `status='active'`. Write-once: call only when `status='countdown'`.
- `updateProgress(participantId: string, progress: { distance_km, duration_seconds, avg_pace, last_lat, last_lng }): Promise<void>`
- `finishParticipant(participantId: string, final: { distance_km, duration_seconds, avg_pace, gps_track }): Promise<void>`
- `finishRace(raceId: string): Promise<void>`
- `cancelRace(raceId: string): Promise<void>`
- `leaveRace(participantId: string): Promise<void>`

All functions throw typed errors: `RaceAuthError`, `RaceNotFoundError`, `RaceRuleError`. Callers can branch on `instanceof`.

### 2.2 `src/lib/race/raceClock.ts`

- `measureOffset(): Promise<number>` — reads PB server time once (cheapest call: `pb.health.check()` if it returns time, else a HEAD on any collection and read `Date` header). Computes `offsetMs = serverTime - Date.now()`. Caches in module.
- `serverNow(): number` — `Date.now() + offset`.
- `msUntil(isoDatetime: string): number` — `new Date(iso).getTime() - serverNow()`.
- `resetOffset(): void` — test helper.

### 2.3 `src/lib/race/raceRealtime.ts`

- `subscribeRace(raceId, handlers: { onRace, onParticipants, onError }): () => void` — single function that owns both subscriptions. Uses PB server-side filter syntax for participants when available (`race_participants/*?filter=race="${raceId}"`); otherwise subscribes to `*` and filters in the event callback. Maintains a local participants array, applies create/update/delete events, fires `onParticipants(next)` with a fresh array each time. Returns a single unsub closure that tears down both.

### 2.4 `src/lib/race/raceTracker.ts`

Dedicated GPS tracker. Does not share code with `CardioSessionContext`'s tracker — that's the whole point.

```ts
export interface RaceTrackerOptions {
  onUpdate: (s: {
    distance_km: number
    duration_seconds: number
    avg_pace: number
    last_lat: number
    last_lng: number
  }) => void
  onError: (e: Error) => void
  minAccuracyM?: number  // default 30
  startAtMs: number      // absolute race start time (server-synced)
}
export interface RaceTracker {
  start(): void
  stop(): void
  getGpsTrack(): RaceGpsPoint[]
  dispose(): void
}
export function createRaceTracker(opts: RaceTrackerOptions): RaceTracker
```

- Uses `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`.
- Rejects positions with `accuracy > minAccuracyM`.
- Computes haversine distance between consecutive accepted positions.
- `duration_seconds = (serverNow() - startAtMs) / 1000` — derived from the clock, not a local interval. This removes drift.
- `avg_pace = duration_seconds / distance_km / 60` minutes per km, or 0 if distance is 0.
- `gps_track` stored in memory, relative `t = now - startAtMs`.
- Fires `onUpdate` on every accepted position AND every 1s via a small interval (so the stats bar keeps ticking even when GPS is stuck).

### 2.5 Unit tests

- `raceClock.msUntil` with mocked `serverNow`.
- `raceTracker` distance math fed a synthetic position stream, assert distance, pace, filtering of low-accuracy points.
- `raceApi.joinRace` idempotency: simulate duplicate insert, assert it returns the existing row.

### 2.6 Checkpoint

- Unit tests green.
- `bun run build` + typecheck green.
- No UI changes yet.

**Commit:** `feat(race): lib foundation (api, clock, realtime, tracker)`

---

## Phase 3 — `RaceContext`

**Goal:** The brain. Pure state + lifecycle. Still not wired into any page.

### 3.1 `src/contexts/RaceContext.tsx`

```ts
type RacePhase = 'loading' | 'lobby' | 'countdown' | 'racing' | 'finished' | 'cancelled' | 'not_found'

interface RaceContextValue {
  phase: RacePhase
  race: Race | null
  participants: RaceParticipant[]
  me: RaceParticipant | null
  isCreator: boolean
  myStats: { distance_km, duration_seconds, avg_pace } | null
  lastError: { kind: 'auth' | 'push' | 'gps' | 'realtime'; message: string } | null
  actions: {
    join(): Promise<void>
    markReady(): Promise<void>
    startCountdown(): Promise<void>
    cancelRace(): Promise<void>
    finishRace(): Promise<void>
    leaveRace(): Promise<void>
  }
}
```

Responsibilities:
1. On mount: `loadRace(id)` → seed state → subscribe via `raceRealtime`.
2. Derive `phase` from `race.status` + `me.status`. Small pure function: `computePhase(race, me)`.
3. When `phase` enters `'countdown'`, schedule a single timer with `raceClock.msUntil(race.starts_at)`; when it fires, call `raceApi.activateRace(id)` (creator client only — others just wait for the realtime update).
4. When `phase` enters `'racing'`: instantiate `raceTracker` with `startAtMs = new Date(race.starts_at).getTime()` (server-synced). Wire `onUpdate` to set local `myStats` immediately and to schedule a debounced `raceApi.updateProgress` call every 3s. Wire `onError` to `lastError`.
5. During `'racing'`: check auto-finish on each update. Distance mode → when `distance_km >= target`. Time mode → when `serverNow() - starts_at >= target_duration_seconds * 1000`. On auto-finish, call `raceApi.finishParticipant` with current `gps_track` and stop the tracker.
6. When `phase` leaves `'racing'`: stop and dispose the tracker, release wake lock.
7. On unmount: unsub realtime, dispose tracker, clear timers, release wake lock.
8. Push path has retry: on PB error (not 401/403), retry at 1s, 3s, 9s. On 3 failures in a row, set `lastError = { kind: 'push', ... }` and surface. On 401/403, set `lastError = { kind: 'auth', ... }` and stop pushing until re-auth.

### 3.2 `src/hooks/useRaceContext.ts` and `src/hooks/useRaceCountdown.ts`

- `useRaceContext()` — simple consumer.
- `useRaceCountdown()` — subscribes to `race.starts_at`, ticks every 100ms against `raceClock.serverNow()`, returns `{ secondsLeft, isCounting }`. Caps at 0.

### 3.3 Checkpoint

- Typecheck + build pass.
- Context is written but not imported anywhere. That's intentional.

**Commit:** `feat(race): RaceContext with phase machine + tracker lifecycle`

---

## Phase 4 — New UI components (unwired)

**Goal:** Build the new components next to the old ones. File names distinct so both can exist. Old `RacePage` still routes to the old components.

### 4.1 New files

- `src/components/race/RaceMap.tsx` — reusable: `{ routePoints?, markers: Array<{lat, lng, label, isMe, isLeader}> }`. Leaflet init, invalidateSize on mount, fit bounds once. Replaces `RaceRouteMap.tsx`.
- `src/components/race/RaceCountdown.tsx` — fullscreen overlay. Uses `useRaceCountdown`. Big number, tick sound via `playCountdownTick`, vibrate. Renders nothing when `secondsLeft <= 0` (waits for status update).
- `src/components/race/RaceLive.tsx` — single-screen race view. Top: map (route + all participant markers + me). Middle: my stats bar (distance, duration, pace, target progress bar). Bottom: leaderboard list (copy styling from current `RaceLiveDashboard` but drive from context). Error banner when `lastError` is set. Leave-race button for non-creator, finish-race for creator.
- `src/components/race/RaceLobbyV2.tsx` — temporary name during the dual-write phase. Same visual as current lobby but drives actions from context; adds ready-check button.
- `src/components/race/CreateRaceDialogV2.tsx` — adds mode picker (distance vs time) and target input that switches unit accordingly.
- `src/components/race/RaceResultsV2.tsx` — podium + per-participant cards + "Save as workout" button that copies into `cardio_sessions`.

### 4.2 Checkpoint

- Build passes, new components are unused. Storybook-style manual check: temporarily mount each at a dev route `/race-dev/*`, click through, verify no runtime errors.

**Commit:** `feat(race): new UI components (unwired)`

---

## Phase 5 — `RacePage` v2 behind an env flag? No, flip directly

The old feature is broken. There is no regression to guard. Just flip.

### 5.1 Rewrite `src/pages/RacePage.tsx`

```tsx
export default function RacePage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <NotFound />
  return (
    <RaceProvider raceId={id}>
      <RaceRouter />
    </RaceProvider>
  )
}

function RaceRouter() {
  const { phase } = useRaceContext()
  switch (phase) {
    case 'loading':   return <Loader />
    case 'lobby':     return <RaceLobbyV2 />
    case 'countdown': return <RaceCountdown />
    case 'racing':    return <RaceLive />
    case 'finished':  return <RaceResultsV2 />
    case 'cancelled': return <RaceCancelled />
    case 'not_found': return <RaceNotFound />
  }
}
```

### 5.2 Update `CreateRaceDialog` usage in `CardioSessionPage`

- Point the "Create race" button at `CreateRaceDialogV2`.
- Remove the "Join race by link" input from `CardioSessionPage`? Keep it — it's harmless and nice, just make sure it still routes to `/race/:id`.
- **Delete** the `/cardio?race=...&participant=...` auto-start `useEffect` in `CardioSessionPage` (lines 78-88). This path no longer exists.

### 5.3 Checkpoint

- Manual two-browser test (or two incognito windows): create race in A, copy link, join in B, A starts, both see countdown, both transition to racing, **both see distance updating on each other's client within ~4s**, one finishes, both see results.
- Playwright integration test covering the same flow (optional but recommended).

**Commit:** `feat(race): flip RacePage to new context + components`

---

## Phase 6 — Strip race code from `CardioSessionContext`

**Goal:** Cardio context has zero knowledge of races.

### 6.1 Edits to `src/contexts/CardioSessionContext.tsx`

- **Delete** lines 249-337 (race progress effect + race closure effect).
- **Delete** lines 510-515 in `start()` that set race fields.
- **Delete** lines 617-641 in `finish()` that push race finish.
- **Delete** race state: `raceId`, `raceParticipantId`, `raceTargetKm`, and all refs `raceIdRef`, `raceParticipantIdRef`, `raceTargetKmRef`, `raceAutoFinishedRef`.
- **Update** `start()` signature: drop `startRaceId`, `startRaceParticipantId`, `startRaceTargetKm` parameters.
- **Update** persisted snapshot shape: drop race fields. Add a one-time migration in the snapshot loader that ignores race fields from old snapshots instead of crashing.
- **Update** `CardioSessionContextValue` type: drop race fields.

### 6.2 Edits to `src/pages/CardioSessionPage.tsx`

- Already done in Phase 5: the auto-start-from-URL-race block is gone.
- Ensure no remaining references to `urlRace`, `urlParticipant`, `urlRaceTarget`.
- The `start(...)` call at line 213 drops the race args.

### 6.3 Checkpoint

- Typecheck + build pass.
- Manual smoke test of **normal cardio** (non-race): start run, tracks distance, pause, resume, finish, saves. Verify unchanged.
- Manual smoke test of a race end-to-end.

**Commit:** `refactor(cardio): remove race-specific code from CardioSessionContext`

---

## Phase 7 — Delete dead code

### 7.1 Files to delete

- `src/hooks/useRace.ts`
- `src/components/race/RaceLiveDashboard.tsx`
- `src/components/race/RaceRouteMap.tsx`

### 7.2 Files to rename (drop V2 suffix)

- `RaceLobbyV2.tsx` → `RaceLobby.tsx`
- `CreateRaceDialogV2.tsx` → `CreateRaceDialog.tsx`
- `RaceResultsV2.tsx` → `RaceResults.tsx`

### 7.3 Grep for leftovers

```
rg "raceParticipantId|raceTargetKmRef|raceIdRef|useRace\b" src/
```

Should return zero matches outside `src/lib/race/` and `src/contexts/RaceContext.tsx`.

### 7.4 Checkpoint

- Build, typecheck, tests all green.
- `bun run lint` green.

**Commit:** `chore(race): delete legacy race code, rename V2 → final`

---

## Phase 8 — Test, tune, ship

### 8.1 Two-device real-world test

Two phones, same WiFi, fresh prod PB. Create race on device A, join from device B, start, run 500m in a parking lot. Verify:
- Countdown ends within 500ms of each other.
- Leaderboard shows both distances updating in both devices.
- Map shows both positions moving.
- Finish on target triggers results on both devices.
- No 0-km bug. No silent errors in console.

### 8.2 Sentry watch

Leave Sentry filters on `raceApi.*` and `RaceContext` for 48h after deploy. Triage anything that pops.

### 8.3 Analytics events

Add OpenPanel events (keeps the project convention):
- `race_created` — `{ mode, target }`
- `race_joined` — `{ race_id }`
- `race_started` — `{ race_id, participants }`
- `race_finished` — `{ race_id, won, my_distance_km, my_duration }`
- `race_cancelled` — `{ race_id }`

### 8.4 Ship

PR → review → merge → deploy. Announce in whatever channel you use for self-dogfooding.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| PB server time drift breaks countdown sync | Low | `raceClock` measures offset once per session; countdown tolerant to ±500ms |
| `navigator.geolocation` delivers no points indoors during test | Medium | Test outdoors; also add GPS-error banner in `RaceLive` from day one |
| PB realtime drops during a race | Medium | Realtime lib already handles reconnects; tracker keeps pushing to local queue, flushes on reconnect |
| Migration deletes data on field type change | High impact, low likelihood | Follow `field.id` preservation rule; test on a snapshot clone first |
| Leftover `useRace` imports crash page | Low | Phase 7 grep pass + build |
| Cardio session snapshot backward compat breaks on upgrade | Medium | Snapshot loader ignores unknown fields instead of failing |

## Time estimate

Rough, calendar-aware:
- Phase 1: 0.5 day
- Phase 2: 1 day
- Phase 3: 1 day
- Phase 4: 1 day
- Phase 5: 0.5 day
- Phase 6: 0.5 day
- Phase 7: 0.25 day
- Phase 8: 0.5 day

Total: **~5 days** of focused work, plus real-world testing window.
