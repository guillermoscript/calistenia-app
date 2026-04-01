# Yoga as a Discipline — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Approach:** Yoga as DayType (Enfoque 1 — minimal code, reuse existing session flow)

## Context

A user who practices Ashtanga yoga wants to use the app for structured yoga training with progression. The current architecture already supports multiple training modalities (strength + cardio), making yoga a natural extension.

Ashtanga is sequence-based: fixed series with specific pose order, mix of static holds and dynamic flows (Surya Namaskar). The user controls pace on flows; static poses use a timer.

## Goals

- Add yoga as a first-class program type alongside calisthenics
- Reuse the existing session flow (ActiveSessionContext + SessionView) with minimal changes
- Track yoga sessions using the existing `sessions` collection with optional new fields
- Seed an Ashtanga Principiante program with progression across 4 phases

## Non-Goals

- Yoga-specific metrics (flexibility tracking, breath counting)
- Mixing yoga and strength days within the same program
- Custom flow builder or pose sequencer
- Video/audio guided sessions

---

## 1. Data Model

### 1.1 DayType

Add `'yoga'` to the existing union type in `src/types/index.ts:5`:

```typescript
export type DayType = 'push' | 'pull' | 'lumbar' | 'legs' | 'full' | 'rest' | 'cardio' | 'yoga'
```

### 1.2 Exercise Model — No Changes to Interface

Yoga poses use the existing `Exercise` interface as-is:

| Pose type | `isTimer` | `timerSeconds` | `sets` | `reps` | `rest` |
|---|---|---|---|---|---|
| Static hold (Trikonasana) | `true` | `30` | `1` | `1` | `0-5` |
| Flow (Surya Namaskar A) | `false` | — | `5` | `1` | `0` |
| Breathing (Ujjayi) | `true` | `60` | `1` | `1` | `0` |
| Final relaxation (Savasana) | `true` | `300` | `1` | `1` | `0` |

- `section`: `'warmup'` | `'main'` | `'cooldown'` — used as-is
- `muscles`: can store target areas (hips, hamstrings, shoulders)
- `note`: alignment cues or modifications

Note: `stretchType` exists on the TypeScript `Exercise` interface but is not a PocketBase field. It can be used in local/fallback data but is not required for the yoga implementation. Yoga poses are identified by their `category: 'yoga'` in the catalog.

### 1.3 Exercise Catalog Category

Add `'yoga'` to `CATEGORIES` array in `ExerciseCatalogPicker.tsx`. The inference function recognizes yoga poses by category field from `exercises_catalog`.

### 1.4 Tracking: Extend Existing `sessions` Collection

Instead of a separate `yoga_sessions` collection, add optional fields to the existing `sessions` collection via migration:

| New Field | Type | Notes |
|---|---|---|
| `duration_seconds` | number | optional, total session time (yoga + future use) |
| `poses_completed` | number | optional, how many exercises/poses were done |
| `total_poses` | number | optional, how many were in the session |

These fields are optional so existing strength session records are unaffected. The existing `sessions` fields (`user`, `workout_key`, `phase`, `day`, `completed_at`, `note`, `program`) already cover everything else needed.

This means yoga completions flow through the same `markWorkoutDone` path in `useProgress.ts` with minimal extension: pass `duration_seconds`, `poses_completed`, and `total_poses` as additional fields when the day type is yoga.

---

## 2. Session Flow

**Minimal changes to the session engine.** The existing `ActiveSessionContext` and `SessionView` handle yoga sessions natively. The only change is passing yoga-specific metadata on completion:

### 2.1 Step Progression

Each yoga pose becomes a `Step`. The existing logic handles:

- **Timer poses** (`isTimer: true`): countdown timer shown, auto-advance on completion
- **Flow poses** (`isTimer: false`): "Siguiente" button, user controls pace
- **Rest between poses**: determined by `exercise.rest` value
  - `rest: 0` → immediate transition (chained flows)
  - `rest: 5` → brief transition/setup time

### 2.2 Sections

- **Warmup**: breathing + Surya Namaskar (uses existing `WarmupCooldownPrompt`)
- **Main**: standing series → seated series → finishing sequence
- **Cooldown**: Padmasana, Savasana (uses existing cooldown prompt)

### 2.3 Session Completion

On completion:
1. Show existing celebration screen
2. Call `markWorkoutDone` (existing function in `useProgress.ts`) which writes to `sessions` collection
3. For yoga days: `markWorkoutDone` receives additional optional params `{ duration_seconds, poses_completed, total_poses }` — computed from the session context (elapsed time since session start, count of completed steps vs total steps)
4. Mark day as completed in program progression (existing logic, no change)

---

## 3. Program Structure

### 3.1 Program Selection

`ProgramSelectorModal` shows a visual badge/tag to distinguish program types. Detection logic: scan the program's `weekDays` array and check if all non-rest days (`type !== 'rest'`) have `type === 'yoga'`. This check runs client-side when rendering the selector.

- All non-rest days are yoga → "Yoga" badge
- Otherwise → "Calistenia" badge (default)

### 3.2 Dashboard

When the current day is `dayType: 'yoga'`:
- Add a `todayIsYoga` check (alongside existing `todayIsRest` and `todayIsCardio` in `DashboardPage.tsx`)
- Day header shows yoga color (purple/indigo) and a yoga-themed label (e.g., "Yoga")
- Exercise list shows poses (same component, different data)
- "Empezar" launches the same `ActiveSessionPage`

### 3.3 History & Progress

- Yoga sessions appear in session history
- Progress tracking: sessions completed, duration averages, phase progression
- Same streak/consistency logic applies

---

## 4. Seed Data

### 4.1 Pose Catalog

~40-50 Ashtanga poses seeded into `exercises_catalog`:

**Warmup:**
- Ujjayi Pranayama (breathing)
- Surya Namaskar A, Surya Namaskar B

**Standing series:**
- Padangusthasana, Padahastasana
- Utthita Trikonasana, Parivrtta Trikonasana
- Utthita Parsvakonasana, Parivrtta Parsvakonasana
- Prasarita Padottanasana A/B/C/D
- Parsvottanasana
- Utthita Hasta Padangusthasana
- Ardha Baddha Padmottanasana
- Utkatasana, Virabhadrasana A/B

**Seated series:**
- Dandasana, Paschimottanasana A/B/C
- Purvottanasana
- Ardha Baddha Padma Paschimottanasana
- Triang Mukhaikapada Paschimottanasana
- Janu Sirsasana A/B/C
- Marichyasana A/B/C/D
- Navasana
- Bhujapidasana, Kurmasana, Supta Kurmasana
- Garbha Pindasana, Kukkutasana
- Baddha Konasana, Upavishta Konasana
- Supta Konasana, Supta Padangusthasana
- Ubhaya Padangusthasana, Urdhva Mukha Paschimottanasana
- Setu Bandhasana

**Finishing:**
- Urdhva Dhanurasana
- Salamba Sarvangasana, Halasana, Karnapidasana
- Urdhva Padmasana, Pindasana
- Matsyasana, Uttana Padasana
- Sirsasana

**Cooldown:**
- Baddha Padmasana, Yoga Mudra
- Padmasana, Utplutih
- Savasana

### 4.2 Seed Program: "Ashtanga Yoga — Principiante"

| Phase | Weeks | Focus | Days/week | Content |
|---|---|---|---|---|
| 1 | 4 | Foundations | 3 (L/M/V) | Surya Namaskar A/B + standing poses only |
| 2 | 4 | Building | 3-4 (L/M/V or L/M/J/S) | + seated poses through Navasana |
| 3 | 4 | Half Primary | 4 (L/M/J/S) | + seated through Setu Bandhasana |
| 4 | 12 | Full Primary | 5-6 (L-V or L-S) | Complete primary series + finishing |

Rest days: `dayType: 'rest'`. Traditional Ashtanga rests on Saturdays and moon days, but for simplicity Phase 1-3 just use fixed rest days.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/types/index.ts` | Add `'yoga'` to `DayType` |
| `src/components/ExerciseCatalogPicker.tsx` | Add `'yoga'` to `CATEGORIES` |
| `src/components/ProgramSelectorModal.tsx` | Badge visual yoga/calistenia |
| `src/pages/DashboardPage.tsx` | Color/icon for yoga days |
| `pb_migrations/XXXX_extend_sessions.js` | Add optional `duration_seconds`, `poses_completed`, `total_poses` fields to `sessions` |
| `pb_migrations/XXXX_seed_yoga_catalog.js` | Seed poses + program |
| `src/hooks/usePrograms.ts` | Verified: program loading is type-agnostic (loads exercises by `workout_key`), no changes needed |
| `src/hooks/useProgress.ts` | Extend `markWorkoutDone` to accept optional yoga metadata fields |
| `src/data/` | Yoga program fallback data if needed |

## 6. What Does NOT Change

- `ActiveSessionContext` — session engine untouched (yoga uses the same step/phase/rest logic)
- `SessionView` — step-by-step flow untouched (timer vs manual already works)
- `WarmupCooldownPrompt` — works as-is
- `Exercise` interface — no type changes
- `CardioSessionContext/Page` — unaffected
- Program structure (phases/days/workouts) — works as-is
- Social features (comments, reactions) — agnostic to session type
