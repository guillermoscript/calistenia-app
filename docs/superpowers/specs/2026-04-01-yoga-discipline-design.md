# Yoga as a Discipline — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Approach:** Yoga as DayType (Enfoque 1 — minimal code, reuse existing session flow)

## Context

A user who practices Ashtanga yoga wants to use the app for structured yoga training with progression. The current architecture already supports multiple training modalities (strength + cardio), making yoga a natural extension.

Ashtanga is sequence-based: fixed series with specific pose order, mix of static holds and dynamic flows (Surya Namaskar). The user controls pace on flows; static poses use a timer.

## Goals

- Add yoga as a first-class program type alongside calisthenics
- Reuse the existing session flow (ActiveSessionContext + SessionView) with zero changes to the session engine
- Track yoga sessions: duration + poses completed
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

### 1.2 Exercise Model — No Changes

Yoga poses use the existing `Exercise` interface as-is:

| Pose type | `isTimer` | `timerSeconds` | `sets` | `reps` | `rest` | `stretchType` |
|---|---|---|---|---|---|---|
| Static hold (Trikonasana) | `true` | `30` | `1` | `1` | `0-5` | `'static'` |
| Flow (Surya Namaskar A) | `false` | — | `5` | `1` | `0` | `'dynamic'` |
| Breathing (Ujjayi) | `true` | `60` | `1` | `1` | `0` | `'static'` |
| Final relaxation (Savasana) | `true` | `300` | `1` | `1` | `0` | `'static'` |

- `section`: `'warmup'` | `'main'` | `'cooldown'` — used as-is
- `muscles`: can store target areas (hips, hamstrings, shoulders)
- `note`: alignment cues or modifications

### 1.3 Exercise Catalog Category

Add `'yoga'` to `CATEGORIES` array in `ExerciseCatalogPicker.tsx`. The inference function recognizes yoga poses by category field from `exercises_catalog`.

### 1.4 New Collection: `yoga_sessions`

PocketBase migration creating:

| Field | Type | Notes |
|---|---|---|
| `user` | relation → users | required |
| `program` | relation → programs | optional (for free sessions) |
| `workout_key` | text | "p1_lun" format |
| `phase` | number | |
| `day` | number | |
| `duration_seconds` | number | total session time |
| `poses_completed` | number | how many poses were done |
| `total_poses` | number | how many were in the session |
| `completed_at` | datetime | |
| `notes` | text | optional user notes |

API rules: users can only read/write their own records.

---

## 2. Session Flow

**No changes to the session engine.** The existing `ActiveSessionContext` and `SessionView` handle yoga sessions natively:

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
2. Record `yoga_session` with duration and poses completed
3. Mark day as completed in program progression

---

## 3. Program Structure

### 3.1 Program Selection

`ProgramSelectorModal` shows a visual badge/tag to distinguish program types:
- Programs where all active days are `dayType: 'yoga'` display a "Yoga" badge
- Programs with strength day types display "Calistenia" badge

### 3.2 Dashboard

When the current day is `dayType: 'yoga'`:
- Day header shows yoga-specific color/icon
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
| 4 | Ongoing | Full Primary | 5-6 (L-V or L-S) | Complete primary series + finishing |

Rest days: `dayType: 'rest'`. Traditional Ashtanga rests on Saturdays and moon days, but for simplicity Phase 1-3 just use fixed rest days.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/types/index.ts` | Add `'yoga'` to `DayType` |
| `src/components/ExerciseCatalogPicker.tsx` | Add `'yoga'` to `CATEGORIES` |
| `src/components/ProgramSelectorModal.tsx` | Badge visual yoga/calistenia |
| `src/pages/DashboardPage.tsx` | Color/icon for yoga days |
| `pb_migrations/XXXX_created_yoga_sessions.js` | New `yoga_sessions` collection |
| `pb_migrations/XXXX_seed_yoga_catalog.js` | Seed poses + program |
| `src/hooks/usePrograms.ts` | Validate yoga program loading (likely works as-is) |
| `src/data/` | Yoga program fallback data if needed |

## 6. What Does NOT Change

- `ActiveSessionContext` — session engine untouched
- `SessionView` — step-by-step flow untouched
- `WarmupCooldownPrompt` — works as-is
- `Exercise` interface — no type changes
- `CardioSessionContext/Page` — unaffected
- Program structure (phases/days/workouts) — works as-is
- Social features (comments, reactions) — agnostic to session type
