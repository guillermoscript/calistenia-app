# Circuit & HIIT Training — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-04-05-circuit-hiit-design.md`

## Phase 1: Foundation (Types, DB, Config)

### Step 1.1: TypeScript types & DayType extension
**Files:** `src/types/index.ts`, `src/lib/style-tokens.ts`, `src/data/stretch-templates.ts`

- Add `'circuit'` to `DayType` union (line 3)
- Add `CircuitDefinition` and `CircuitExercise` interfaces
- Add `circuitConfig?: CircuitDefinition` to `WeekDay` interface (line 73, parallel to `cardioConfig`)
- Add `circuit` entry to `DAY_TYPE_COLORS` (orange-500 tones to distinguish from cardio's emerald)
- Add `circuit` entry to `stretchTemplates` (reuse cardio's warmup/cooldown — similar movement patterns)

### Step 1.2: PocketBase migration — `circuit_sessions` collection
**Files:** `pb_migrations/<next_sequential>_created_circuit_sessions.js`

- Create `circuit_sessions` collection following `1774000029_created_cardio_sessions.js` pattern
- Fields: `user` (relation->users), `circuit_name` (json), `mode` (text), `exercises` (json), `rounds_completed` (number), `rounds_target` (number), `duration_seconds` (number), `started_at` (text), `finished_at` (text), `note` (text), `program` (relation->programs), `program_day_key` (text), `config` (json)
- API rules: owner-only create/update/delete, authenticated list/view (for leaderboard)

### Step 1.3: i18n keys
**Files:** `src/i18n/locales/es.json`, `src/i18n/locales/en.json` (or wherever locale files are)

- Add keys: `nav.circuit`, `circuit.title`, `circuit.builder.*`, `circuit.execution.*`, `circuit.presets.*`, `circuit.modes.circuit`, `circuit.modes.timed`, `circuit.rest.*`, `circuit.rounds.*`, `circuit.completion.*`

---

## Phase 2: Circuit Session Context & Completion Logic

### Step 2.1: CircuitSessionContext
**Files:** `src/contexts/CircuitSessionContext.tsx` (new)

- Create new context following `ActiveSessionContext.tsx` pattern
- State: `circuitDefinition`, `currentRound`, `currentExerciseIndex`, `phase` ('exercise' | 'rest' | 'roundRest' | 'work' | 'celebrate'), `isActive`, `isPaused`, `startedAt`, `elapsedSeconds`
- localStorage persistence with key `calistenia_circuit_active`, 24h expiry
- Persist circuit definition **before** navigation (for program launch + page refresh survival)
- Functions: `startCircuit(def)`, `advanceExercise()`, `advanceRound()`, `pause()`, `resume()`, `completeCircuit()`, `abandonCircuit()`
- Auto-redirect to `/circuit/active` if persisted session exists (same as ActiveSessionContext)

### Step 2.2: completeCircuitSession function
**Files:** `src/contexts/CircuitSessionContext.tsx` (or `src/lib/circuit-session.ts`)

- Save record to `circuit_sessions` PB collection
- Include full `config` snapshot of the CircuitDefinition
- Track OpenPanel event: `circuit_completed`

### Step 2.3: PB hook for streak/stats
**Files:** `pb_hooks/notification_service.pb.js`

- Add `onRecordAfterCreateSuccess` hook for `circuit_sessions` collection
- On creation: look up user's `user_stats`, increment `total_sessions`, update `workout_streak_current` / `workout_streak_best`
- Same logic as existing session completion streak updates

### Step 2.4: Leaderboard fix — count all session types
**Files:** `src/hooks/useLeaderboard.ts`

- Update `sessions_week` and `sessions_month` counting to query `sessions` + `circuit_sessions` + `cardio_sessions` (parallel PB queries, sum totalItems)
- This fixes the existing cardio omission too

---

## Phase 3: Circuit Builder

### Step 3.1: Preset templates data
**Files:** `src/data/circuit-presets.ts` (new)

- Define preset circuit templates:
  - Tabata: `{ mode: 'timed', workSeconds: 20, restSeconds: 10, rounds: 8, exercises: [] }`
  - EMOM (simplified): `{ mode: 'timed', workSeconds: 60, restSeconds: 0, rounds: 4, exercises: [] }`
  - Bodyweight Circuit: `{ mode: 'circuit', rounds: 3, restBetweenExercises: 0, restBetweenRounds: 60, exercises: [5 pre-selected exercises with reps] }`
- Each preset has `id`, `name` (TranslatableField), `description` (TranslatableField), and partial `CircuitDefinition`

### Step 3.2: CircuitBuilder component
**Files:** `src/components/circuit/CircuitBuilder.tsx` (new)

- **Config section (top):** Mode pill toggle (Circuit/Timed), rounds stepper, rest steppers, work/rest steppers (timed mode only)
- **Exercise list (middle):** Reuse exercise catalog/picker extracted from FreeSessionPage. Each item shows reps field (circuit mode) or work/rest override toggle (timed mode). Up/down reorder + X remove.
- **Start button (bottom, sticky):** Summary text with estimated time formula. Disabled until >= 1 exercise added.
- Outputs a `CircuitDefinition` object

### Step 3.3: CircuitPage (dedicated entry point)
**Files:** `src/pages/CircuitPage.tsx` (new)

- Preset template cards at top (Tabata, EMOM, Bodyweight)
- "Build Custom" button opens CircuitBuilder with blank state
- Selecting a preset pre-fills CircuitBuilder with that preset's config
- On "Start": persist to CircuitSessionContext, navigate to `/circuit/active`

---

## Phase 4: Circuit Execution (CircuitView)

### Step 4.1: CircuitView — circuit mode
**Files:** `src/components/circuit/CircuitView.tsx` (new)

- **Header:** Circuit name, "Round X / Y", elapsed time, close button (with confirm dialog)
- **Exercise phase:** Large exercise name, reps target, position indicator "3 / 4", big "Done" button, "Skip" link, demo images if available
- **Rest phase (between exercises):** Reuse `RestTimer` with `restBetweenExercises` duration, show next exercise preview
- **Round rest phase:** Reuse `RestTimer` with `restBetweenRounds` duration, "Round X complete!" message
- **Flow:** exercise -> (exercise rest) -> exercise -> ... -> round rest -> next round -> ... -> celebrate
- Audio/haptics: reuse existing sounds for rest start/end, 3-2-1 countdown

### Step 4.2: CircuitView — timed mode
**Files:** `src/components/circuit/CircuitView.tsx` (same component, mode branch)

- **Work phase:** Large exercise name, countdown timer ring (reuse Timer visuals), "WORK" label (green), position indicator. Auto-advances on timer end.
- **Rest phase:** Countdown timer ring, "REST" label (red/orange), next exercise preview. Auto-advances.
- **Round rest:** Longer countdown with `restBetweenRounds`, round complete message.
- Per-exercise overrides: check `workSecondsOverride`/`restSecondsOverride` on each CircuitExercise, fall back to circuit defaults.
- Pause: tap to pause, resume button. Pauses elapsed time too.

### Step 4.3: Celebration screen
**Files:** `src/components/circuit/CircuitView.tsx`

- Reuse confetti + motivational quote from SessionView's celebration phase
- Circuit-specific stats: rounds completed, total exercises, duration
- Optional note input
- "Done" button -> calls `completeCircuitSession()` -> navigates home

### Step 4.4: CircuitActivePage wrapper
**Files:** `src/pages/CircuitActivePage.tsx` (new)

- Reads circuit definition from `CircuitSessionContext`
- If no active circuit, redirect to `/circuit`
- Renders `CircuitView` with the active definition
- Handles URL params from program launch: `?program=X&dayKey=Y`

---

## Phase 5: Integration

### Step 5.1: Routing & navigation
**Files:** `src/App.tsx`

- Add lazy imports: `CircuitPage`, `CircuitActivePage`, `CircuitSessionDetailPage`
- Add routes: `/circuit`, `/circuit/active`, `/circuit/history/:id`
- Add `CircuitSessionContext.Provider` wrapping the app (or just circuit routes)
- Add nav item to `NAV_SECTIONS` training section: `{ path: '/circuit', labelKey: 'nav.circuit', icon: CircuitIcon }`
- Auto-redirect to `/circuit/active` if active circuit in localStorage

### Step 5.2: Program integration — WorkoutPage
**Files:** `src/pages/WorkoutPage.tsx`

- Detect `type === 'circuit'` days in the week schedule
- Show circuit summary card: exercise names, rounds, mode, estimated time
- "Start" button navigates to `/circuit/active?program=X&dayKey=Y`
- Persist `circuitConfig` from WeekDay to CircuitSessionContext before navigating

### Step 5.3: Free Session integration
**Files:** `src/pages/FreeSessionPage.tsx`

- Add "Exercises | Circuit" toggle/tab at top of page
- "Circuit" tab renders `CircuitBuilder` inline
- On "Start": persist to CircuitSessionContext, navigate to `/circuit/active`
- Existing free session queue (`calistenia_free_session_queue`) preserved independently

### Step 5.4: Analytics events
**Files:** `src/components/circuit/CircuitView.tsx`, `src/pages/CircuitPage.tsx`

- `circuit_started`: on circuit execution begin
- `circuit_completed`: on successful finish
- `circuit_abandoned`: on exit mid-circuit
- `circuit_preset_used`: when user selects a preset template

### Step 5.5: CircuitSessionDetailPage
**Files:** `src/pages/CircuitSessionDetailPage.tsx` (new)

- Fetches circuit session from PB by ID
- Displays: circuit name, mode, date, duration, rounds completed/target
- Shows exercise list from saved config
- Shows timing config (work/rest for timed mode)
- Optional note

---

## Phase 6: Polish & Edge Cases

### Step 6.1: Calendar/history integration
- Calendar view: show circuit sessions alongside strength/cardio (different icon/color)
- History list: include circuit sessions in the feed

### Step 6.2: Edge cases
- Empty circuit (0 exercises): disable Start button
- Single exercise circuit: works fine, just repeats
- 0 rounds: minimum 1 round enforced in builder
- Browser close during circuit: localStorage persistence handles resume
- Network offline during completion: queue save like cardio sessions

### Step 6.3: Accessibility
- Large touch targets for Done button (min 48px)
- Color contrast for Work/Rest labels

---

## Dependency Graph

```
Phase 1 (Foundation) <- no deps
  |
Phase 2 (Context + Completion) <- depends on Phase 1 types + migration
  |
Phase 3 (Builder) <- depends on Phase 1 types (can parallel with Phase 2)
  |
Phase 4 (Execution) <- depends on Phase 2 context + Phase 1 types
  |
Phase 5 (Integration) <- depends on Phase 3 + Phase 4
  |
Phase 6 (Polish) <- depends on Phase 5
```

## New Files Summary

| File | Phase |
|------|-------|
| `src/types/index.ts` (modify) | 1.1 |
| `src/lib/style-tokens.ts` (modify) | 1.1 |
| `src/data/stretch-templates.ts` (modify) | 1.1 |
| `pb_migrations/XXXX_created_circuit_sessions.js` (new) | 1.2 |
| `src/i18n/locales/*.json` (modify) | 1.3 |
| `src/contexts/CircuitSessionContext.tsx` (new) | 2.1 |
| `pb_hooks/notification_service.pb.js` (modify) | 2.3 |
| `src/hooks/useLeaderboard.ts` (modify) | 2.4 |
| `src/data/circuit-presets.ts` (new) | 3.1 |
| `src/components/circuit/CircuitBuilder.tsx` (new) | 3.2 |
| `src/pages/CircuitPage.tsx` (new) | 3.3 |
| `src/components/circuit/CircuitView.tsx` (new) | 4.1-4.3 |
| `src/pages/CircuitActivePage.tsx` (new) | 4.4 |
| `src/App.tsx` (modify) | 5.1 |
| `src/pages/WorkoutPage.tsx` (modify) | 5.2 |
| `src/pages/FreeSessionPage.tsx` (modify) | 5.3 |
| `src/pages/CircuitSessionDetailPage.tsx` (new) | 5.5 |
