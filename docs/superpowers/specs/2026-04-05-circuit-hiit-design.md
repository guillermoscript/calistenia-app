# Circuit & HIIT Training Feature Design

**Date:** 2026-04-05
**Status:** Draft

## Problem

The app supports standard set-based strength workouts, free sessions, cardio GPS tracking, and yoga — but has no support for circuit-style training where users perform multiple exercises in sequence, rest, and repeat. This is a common training style (HIIT, Tabata, EMOM, bodyweight circuits) requested by users.

## Requirements

- **Two modes:**
  - **Circuit mode** — Rep-based. User does exercises in order, taps "Done" to advance. Quick check-off flow, no detailed set logging.
  - **Timed mode** — Clock-driven (HIIT/Tabata). Each exercise has a work period, followed by rest. Auto-advances.
- **Available in:** Programs (as a day type), Free Sessions (as a mode toggle), and a dedicated `/circuit` page.
- **Configurable rest:** Rest between exercises (default 0s) and rest between rounds (default 60s), both user-adjustable.
- **Timed mode timing:** Per-circuit defaults (work/rest seconds) with optional per-exercise overrides.
- **Preset templates:** Tabata (20s/10s, 8 rounds), EMOM (60s/minute, 4 rounds), Bodyweight Circuit (5 exercises, 3 rounds).
- **Reuse existing components:** Timer, RestTimer, audio/haptics, exercise catalog/picker, celebration screen.
- **i18n:** Circuit names and exercise names use `TranslatableField` (JSON with language keys), consistent with the rest of the app.

## Architecture: New CircuitView alongside SessionView

A new `CircuitView` component parallel to `SessionView`, with its own execution flow optimized for circuits. Shares existing reusable components (Timer, RestTimer, audio, celebration). A new `CircuitSessionContext` manages circuit state and persistence.

SessionView remains untouched — no risk of regressions in the core workout flow.

## Data Model

### CircuitDefinition (TypeScript)

```typescript
interface CircuitDefinition {
  id: string
  name: TranslatableField               // i18n, e.g., { es: "Circuito Superior", en: "Upper Body Blast" }
  mode: 'circuit' | 'timed'            // Simple vs HIIT/Tabata
  exercises: CircuitExercise[]
  rounds: number                        // how many times to repeat
  restBetweenExercises: number          // seconds, default 0 (circuit mode only, ignored in timed mode)
  restBetweenRounds: number             // seconds, default 60

  // Timed mode defaults (per-circuit)
  workSeconds?: number                  // e.g., 40
  restSeconds?: number                  // e.g., 20 (this is the per-exercise rest in the work/rest cycle)
}

interface CircuitExercise {
  exerciseId: string
  name: TranslatableField               // i18n
  reps?: string                         // circuit mode: "10", "12/lado"

  // Timed mode overrides (optional)
  workSecondsOverride?: number
  restSecondsOverride?: number
}
```

**Rest clarification for timed mode:** In timed mode, `restSeconds` (per-exercise work/rest cycle) is the only rest between exercises. `restBetweenExercises` is ignored — the work/rest cycle handles transitions. `restBetweenRounds` still applies between rounds. In circuit mode, `restBetweenExercises` applies between exercises and `restBetweenRounds` between rounds.

### PocketBase — `circuit_sessions` collection

| Field | Type | Notes |
|-------|------|-------|
| `user` | relation | owner |
| `circuit_name` | json | TranslatableField, name of the circuit |
| `mode` | text | 'circuit' or 'timed' |
| `exercises` | json | array of exercise IDs + names |
| `rounds_completed` | number | how many rounds finished |
| `rounds_target` | number | how many were planned |
| `duration_seconds` | number | total time |
| `started_at` | text | ISO timestamp |
| `finished_at` | text | ISO timestamp |
| `note` | text | optional |
| `program` | relation | optional, if from a program |
| `program_day_key` | text | optional |

API rules: owner-only read/write, authenticated users can view (for leaderboard).

### PocketBase Migration

Create a new migration file (next sequential number after existing migrations) to create the `circuit_sessions` collection with the fields above. Follow the same pattern as `1774000029_created_cardio_sessions.js`.

## Circuit Builder UI

### Entry points

1. **Dedicated page (`/circuit`)** — New nav item. Preset templates at top, "Build Custom" button below.
2. **Free Session** — New toggle/tab at top: "Exercises" | "Circuit". Switching to Circuit shows the builder.
3. **Programs** — No builder. Circuit days are pre-defined in workout data and launch directly into execution.

### Builder flow

1. **Pick a preset or start blank**
   - Presets: Tabata (20s/10s, 8 rounds), EMOM simplified (60s work/0s rest per exercise, 4 rounds — note: true EMOM "finish early, rest the remainder" mechanic is out of scope for v1), Bodyweight Circuit (5 exercises, 3 rounds)
   - "Custom" starts with empty exercise list

2. **Configure the circuit**
   - Mode selector: "Circuit" or "Timed" (pill toggle)
   - Rounds input (number stepper, default 3)
   - Rest between exercises (seconds stepper, default 0)
   - Rest between rounds (seconds stepper, default 60)
   - Timed mode only: work/rest seconds (steppers, default 40/20)

3. **Add exercises**
   - Reuse existing exercise catalog/picker from FreeSessionPage
   - Drag to reorder (or up/down buttons)
   - Circuit mode: each exercise shows a reps field
   - Timed mode: each exercise shows work/rest with "override" toggle
   - Remove with X

4. **Start button** pinned at bottom with summary: "3 rounds x 4 exercises ~ 12 min"

**Estimated time formula:**
- Timed mode: `(workSeconds + restSeconds) * exercises * rounds + restBetweenRounds * (rounds - 1)`
- Circuit mode: no reliable estimate (depends on user pace). Show "3 rounds x 4 exercises" without time estimate.

Single compact screen: config at top, exercise list below, start button pinned at bottom.

## Circuit Execution UI (CircuitView)

### Header bar (always visible)

- Circuit name
- Round indicator: "Round 2 / 3"
- Total elapsed time
- Close/exit button (with confirmation dialog)

### Circuit Mode execution

**Exercise screen:**
- Exercise name (large)
- Reps target: "10 Push-ups"
- Exercise position in round: "3 / 4"
- Big "Done" button — advances to next exercise (or rest)
- Small "Skip" link underneath
- Exercise demo images/video if available

**Between exercises** (if restBetweenExercises > 0):
- Reuse `RestTimer` component
- Shows next exercise name as preview

**Between rounds:**
- Reuse `RestTimer` with restBetweenRounds duration
- "Round X complete!" message
- "Round Y / Z coming up" preview

### Timed Mode execution

**Work phase:**
- Exercise name (large)
- Countdown timer ring (reuse `Timer` component visuals)
- Exercise position: "3 / 4"
- "Work" label in green
- Auto-advances when timer ends

**Rest phase:**
- Countdown timer ring
- "Rest" label in red/orange
- Next exercise name preview
- Auto-advances when timer ends

**Between rounds:**
- Longer rest countdown
- "Round X complete!" message

### Shared behaviors (both modes)

- **Audio/haptics:** Reuse existing audio system — 3-2-1 countdown, round completion, session end celebration.
- **Auto-advance:** Timed mode auto-advances everything. Circuit mode auto-advances rest timers, exercises wait for tap.
- **Pause:** Tap timer to pause. Resume button to continue. Pauses total elapsed time.
- **Completion screen:** Reuse celebration phase from SessionView — confetti, motivational quote, duration summary. Add circuit-specific stats: total rounds, exercises per round.
- **Persistence:** Save progress to `CircuitSessionContext` -> localStorage. Resume if user navigates away (24h expiry, same pattern as ActiveSessionContext).

## Integration with Programs

### New day type

Add `'circuit'` to the `DayType` union:

```typescript
type DayType = 'push' | 'pull' | 'lumbar' | 'legs' | 'full' | 'rest' | 'cardio' | 'yoga' | 'circuit'
```

Also add `'circuit'` entries to `DAY_TYPE_COLORS` in `style-tokens.ts` and `stretchTemplates` in `stretch-templates.ts` (empty/no-stretch template for circuit days) to avoid TypeScript errors from the `Record<DayType, ...>` types.

### Workout data structure

```typescript
{
  phase: 2,
  day: 'sab',
  title: 'Circuito Cardio',
  dayType: 'circuit',
  circuit: {
    mode: 'timed',
    rounds: 4,
    restBetweenExercises: 10,
    restBetweenRounds: 60,
    workSeconds: 40,
    restSeconds: 20,
    exercises: [
      { exerciseId: 'burpees', name: 'Burpees' },
      { exerciseId: 'mountain_climbers', name: 'Mountain Climbers' },
      { exerciseId: 'jump_squats', name: 'Jump Squats' },
      { exerciseId: 'plank_shoulder_taps', name: 'Plank Shoulder Taps' },
    ]
  }
}
```

### WorkoutPage changes

- Circuit days show a card with circuit summary (exercises, rounds, mode, estimated time)
- "Start" launches `CircuitView` instead of `SessionView`
- Same pattern as cardio days redirecting to `CardioSessionPage`

### Session completion

- Circuit sessions saved to `circuit_sessions` collection (not `sessions`)
- **Streak integration:** Update `useProgress` to also query `circuit_sessions` when calculating daily streaks. A circuit session on a given day counts as a workout done.
- **Leaderboard integration:** Update `useLeaderboard` to include `circuit_sessions` in session counts. Add a new `completeCircuitSession` function (parallel to `markWorkoutDone`) that saves to `circuit_sessions` and updates user stats.
- **Session detail:** Use route-based detection: `/session/:date/:workoutKey` for regular sessions, `/circuit/history/:id` for circuit sessions. `CircuitSessionDetailPage` (new) renders round/exercise summary. Link from calendar/history views based on session type.

## Routing

| Route | Component | Purpose |
|-------|-----------|---------|
| `/circuit` | `CircuitPage` | Presets + builder |
| `/circuit/active` | `CircuitActivePage` | Circuit execution (CircuitView) |
| `/circuit/history/:id` | `CircuitSessionDetailPage` | Past circuit session detail |

Program circuit days redirect to `/circuit/active`. The `CircuitSessionContext` persists the circuit definition to localStorage **before** navigation, so the data survives page refreshes (same pattern as `ActiveSessionContext`).

## Reused Components

| Component | From | Used for |
|-----------|------|----------|
| `Timer` | `Timer.tsx` | Timed mode work/rest countdown rings |
| `RestTimer` | `RestTimer.tsx` | Rest between exercises and rounds |
| Audio/haptics system | `SessionView` (extract if needed) | 3-2-1 cues, completion sounds |
| Exercise catalog/picker | `FreeSessionPage` | Adding exercises in builder |
| Celebration phase | `SessionView` | Completion screen with confetti |
| Exercise demo viewer | `SessionView` | Demo images/video in exercise screen |

## New Components

| Component | Purpose |
|-----------|---------|
| `CircuitView` | Main circuit execution orchestrator |
| `CircuitBuilder` | Circuit configuration + exercise picker |
| `CircuitPage` | Dedicated page with presets + builder |
| `CircuitActivePage` | Wrapper for active circuit execution |
| `CircuitSessionContext` | Circuit state management + persistence |
| `CircuitSessionDetailPage` | Past circuit session view (rounds, exercises, duration) |
| `completeCircuitSession` | Function to save circuit to PB + update stats/streak |

## Preset Templates

| Name | Mode | Work | Rest | Rounds | Exercises |
|------|------|------|------|--------|-----------|
| Tabata | timed | 20s | 10s | 8 | User picks |
| EMOM (simplified) | timed | 60s | 0s | 4 | User picks |
| Bodyweight Circuit | circuit | — | — | 3 | 5 pre-selected bodyweight exercises |

## Out of Scope

- True EMOM mechanic ("finish early, rest the remainder of the minute") — future iteration
- Hybrid mode (mix of timed and rep-based in same circuit) — future iteration
- Circuit-specific exercise logging (reps, weight, RPE per exercise) — future iteration
- Sharing circuits with friends — future iteration
- Circuit history/analytics beyond session detail — future iteration
