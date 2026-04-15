# Countdown Race Feature (Future)

Status: **planned** — not yet implemented
Created: 2026-04-12
Context: Extension to the Race Competition feature built for La Perla Run

## What it is

A race mode where the goal is **"most distance in X minutes"** instead of "first to X km".

**Examples:**
- 30-minute sprint — whoever covers most ground in 30 min wins
- 1-hour endurance — who can run the furthest in an hour
- 15-minute team challenge — fast-paced group competition

Opposite of the current distance-target mode (first to 5km wins).

## Why it matters

Current feature only supports distance goals. Countdown races unlock:
- **Track / gym workouts** — e.g., 20 min on a track
- **Treadmill competitions** — fixed time, variable distance
- **HIIT-style cardio** — short intense bursts
- **Beginner-friendly events** — new runners aren't intimidated by "you have to reach 10km"

## How it works

### Race creation
New field: `race_duration_seconds` in the `races` collection.
Creator picks EITHER `target_distance_km` OR `race_duration_seconds` (not both, or maybe both for hybrid "first to 5km OR most distance in 30 min").

UI in CreateRaceDialog: toggle between "Distancia" / "Tiempo" as race mode.

### During the race
- Race starts with countdown (same 5-4-3-2-1-GO as now)
- **Visible countdown timer** counts DOWN from `race_duration_seconds` (e.g., 30:00 → 00:00)
- Participants run normally, progress pushed every 10s
- When timer hits 0:
  - Client-side: auto-calls `finish()` on CardioSessionContext
  - Participant's final distance is locked in
  - Race auto-transitions to `status: 'finished'`

### Winner determination
- Sort by `distance_km` descending (unlike distance races which sort by finish time)
- Ties broken by pace

## Technical changes needed

### 1. Database
```js
// Migration: add race_duration_seconds to races
collection.fields.add(new Field({ name: "race_duration_seconds", type: "number" }))
```

Type update:
```typescript
export interface Race {
  // ... existing fields
  race_duration_seconds: number  // 0 = no time limit (distance race)
}
```

### 2. CardioSessionContext
- Add `raceDurationSeconds` state/ref
- Extend `start()` signature with `raceDurationSeconds?: number`
- When `duration >= raceDurationSeconds` and tracking, auto-call `finish()`
- Show remaining time in context value: `raceTimeRemaining: number | null`

### 3. CreateRaceDialog
- Mode toggle: "Distancia" vs "Tiempo"
- If "Tiempo": show minutes input (5, 10, 15, 30, 60 presets)
- Validate: either target OR duration must be set

### 4. RaceLiveDashboard
- If countdown race: show BIG countdown timer instead of elapsed time
- Flash red + sound on last 10 seconds
- On 0: "TIEMPO" overlay + freeze leaderboard

### 5. RaceResults
- Countdown race winner label: "RECORRIÓ MÁS" instead of "LLEGÓ PRIMERO"
- Sorting: by distance descending (same as no-target mode)
- Display: prominent distance, smaller pace/time

### 6. Auto-finish propagation (already implemented for distance)
Creator doesn't need to do anything — each client's CardioSessionContext auto-finishes itself when timer reaches 0. Creator can still force-finish early.

### 7. Sounds
Reuse existing:
- `playCountdownTick()` — each second in last 10 seconds
- `playSessionComplete()` — on time up
- `vibrate([200, 100, 200, 100, 400])` — on time up

## UI mocks (rough)

```
┌─────────────────────────┐
│ ⏱  COUNTDOWN RACE       │
│                         │
│     27:43               │  ← big countdown, turns red last 10s
│     RESTANTE            │
│                         │
│  #1 Maria    5.24 km    │  ← live leaderboard, sorted by distance
│  #2 Carlos   4.89 km    │
│  #3 Yo       4.12 km    │
│                         │
└─────────────────────────┘
```

## Edge cases to handle later

1. **User pauses cardio during countdown race** — should pause the race timer too? Or keep counting? Decision: race timer keeps counting (pause = strategic cost, like real races)
2. **User's phone dies** — their last synced distance is their final score. Same as distance races.
3. **Creator finishes race early** — current logic freezes each participant's latest data. Works for countdown too.
4. **Timer drift** — client-side timer could drift vs server. Use `started_at + race_duration_seconds` as authoritative end time, not client counter.
5. **Very short races (< 5 min)** — countdown should scale nicely. Maybe disable "warning at 10 seconds" if race < 30 seconds.

## Not in scope (for MVP of this feature)

- Elimination races (slowest drops out every interval)
- Handicap starts (slower runners start first)
- Relay team races
- Power-ups / modifiers

## Files that would need changes

```
pb_migrations/XXXXX_add_duration_to_races.js   (new)
src/types/index.ts                              (extend Race)
src/contexts/CardioSessionContext.tsx           (duration tracking + auto-finish)
src/components/race/CreateRaceDialog.tsx        (mode toggle)
src/components/race/RaceLiveDashboard.tsx       (countdown timer UI)
src/components/race/RaceResults.tsx             (sort by distance for countdown mode)
src/components/race/RaceShareCard.tsx           (different label)
src/pages/RacePage.tsx                          (pass duration to countdown logic)
src/hooks/useRace.ts                            (createRace accepts duration)
src/locales/es/translation.json                 (new strings)
src/locales/en/translation.json                 (new strings)
```

Estimated effort: 2-3 hours focused work. Most infra already exists (subscriptions, auto-finish, countdown overlay).
