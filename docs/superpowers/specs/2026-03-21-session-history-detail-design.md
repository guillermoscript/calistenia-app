# Session History Detail — Design Spec

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Read-only drill-down view for reviewing past workout sessions

## Problem

Users can see *which* workouts they completed on the Calendar and Progress pages, but cannot review the exercise-by-exercise breakdown — individual sets, reps, weight, RPE, and notes. The data exists in `sets_log` but has no UI to surface it.

## Solution

A new **SessionDetailPage** at `/session/:date/:workoutKey` that renders the full read-only breakdown of a completed workout. Two entry points link to it: the Calendar page (tap a completed day) and a new "Sesiones recientes" section on the Progress page.

## Routing

**Route:** `/session/:date/:workoutKey` (e.g., `/session/2026-03-21/p1_lun`)

We use date + workout key instead of PocketBase record ID because:
- The current `SessionDone` type has no PB `id` field
- The `ProgressMap` keys sessions as `done_{date}_{workoutKey}`
- This works for both PocketBase and localStorage-only users
- Naturally handles the case where we need to query sets_log (which also has no FK to sessions)

## Entry Points

### 1. Calendar Page (`/calendar`)

**Current behavior:** Tapping a completed day shows workout title and notes only.

**New behavior:** Each completed workout on the expanded day becomes a tappable card that navigates to `/session/:date/:workoutKey`. The card shows:
- Workout name
- Set count badge
- Right chevron to indicate it's tappable

### 2. Progress Page (`/progress`)

**New section:** "Sesiones recientes" added at the top, before existing content. Shows the last 10 sessions (across all programs) as a compact vertical list. Each row contains:
- Date (relative: "Hoy", "Ayer", "Hace 3 dias", then formatted date)
- Workout name (colored by day type)
- Set count
- Tappable → navigates to `/session/:date/:workoutKey`

## Session Detail Page

### Header
- Back button (navigates to previous page)
- Workout name (e.g., "Fase 1 — Lunes: Empuje")
- Date formatted as "viernes, 21 de marzo de 2026"
- Summary row: total sets · total exercises

Note: Duration is **not shown** — sessions do not track start time, only `completed_at`. Duration can be added later if we start recording `started_at`.

### Exercise List
Each exercise rendered as a section (not a card — flat layout):

- **Exercise name** with muscle group subtitle
- **Sets table:**

| Serie | Reps | Peso | RPE | Nota |
|-------|------|------|-----|------|
| 1     | 12   | —    | —   | —    |
| 2     | 10   | 5kg  | 8   | "felt heavy" |
| 3     | 8    | 5kg  | 9   | —    |

- Columns for weight, RPE, and notes only render if at least one set in the exercise has data for that column (avoid empty columns)
- Best set highlighted with accent color — determined by parsing numeric reps only. Non-numeric reps (e.g., "max", "intentos") are excluded from best-set calculation. If all reps are non-numeric, no best set is highlighted.

### Empty State
If a session was marked done but has zero logged sets, show:
- Header with workout name and date (as normal)
- Message: "Sesion completada sin series registradas"

### Footer
- Session notes (if any), displayed in a muted text block
- **Compartir** button — generates a share card using the existing `shareImage()` utility. Uses a simplified version of `WorkoutShareCard` that accepts session data props instead of live workout state.

## Data Flow

### PocketBase path
```
1. Fetch session from `sessions` where:
   - user = currentUser
   - workout_key = :workoutKey
   - completed_at starts with :date (date prefix match)
   → Returns: workout_key, completed_at, note, program

2. Fetch sets from `sets_log` where:
   - user = currentUser
   - workout_key = :workoutKey
   - logged_at >= :date 00:00:00 AND logged_at < :date+1 00:00:00
   → Returns: exercise_id, reps, weight_kg, rpe, note, logged_at

3. Group sets by exercise_id, ordered by logged_at ascending

4. Resolve exercise names from exercises catalog
```

### LocalStorage fallback path
```
1. Read ProgressMap, find entry at key `done_{date}_{workoutKey}`
   → Returns: date, workoutKey, note

2. Read sets from localStorage sets array, filter by workout_key + date
   → Same grouping logic as PocketBase path
```

### New hook: `useSessionDetail(date: string, workoutKey: string)`
Returns:
```typescript
{
  session: { workoutKey: string; date: string; note?: string } | null
  exercises: SessionExercise[]
  loading: boolean
  error: string | null
}

interface SessionExercise {
  exerciseId: string
  name: string
  muscles: string
  sets: SessionSet[]
  bestSet: SessionSet | null     // null if no numeric reps
  hasWeight: boolean             // any set has weight > 0
  hasRpe: boolean                // any set has RPE
  hasNotes: boolean              // any set has a note
}

interface SessionSet {
  setNumber: number
  reps: string                   // string because it can be "max", "intentos", etc.
  weight?: number
  rpe?: number
  note?: string
  loggedAt: string
}
```

## Known Limitations

**Same workout twice in one day:** If a user completes the same workout_key twice on the same date, the `ProgressMap` key `done_{date}_{workoutKey}` only stores the last session, and the sets_log query returns merged sets from both sessions. This is a pre-existing data model limitation. For MVP, we accept this — it's a rare edge case and the merged view still shows all sets performed.

## Schema Changes

**None.** All data already exists in `sessions` and `sets_log` collections. This is purely a frontend feature.

## New Files

| File | Purpose |
|------|---------|
| `src/pages/SessionDetailPage.tsx` | Main page component |
| `src/hooks/useSessionDetail.ts` | Data fetching and grouping hook |

## Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add route `/session/:date/:workoutKey` with lazy-loaded page |
| `src/pages/CalendarPage.tsx` | Make completed workout cards tappable, link to session detail |
| `src/pages/ProgressPage.tsx` | Add "Sesiones recientes" section at top |

## Design Decisions

- **Date+key routing (not PB ID):** Works for both PB and localStorage users. Avoids needing to propagate PB record IDs through the existing ProgressMap.
- **Page, not modal:** A dedicated route makes sessions linkable — essential for the upcoming activity feed and social sharing.
- **Read-only:** No editing of past sessions. Prevents sync complexity and accidental data loss.
- **Flat layout:** Exercise sections use spacing and typography hierarchy, not nested cards.
- **Conditional columns:** Weight/RPE/Notes columns only appear when data exists, keeping the view clean for bodyweight-only workouts.
- **No duration:** Sessions don't track start time. Can be added later with a `started_at` field.
- **All programs:** "Sesiones recientes" shows sessions across all programs, not filtered by active program.

## Out of Scope

- Editing or deleting past sessions
- Side-by-side comparison with previous sessions
- Session duration tracking (requires schema change)
- Adding a `session` FK to `sets_log` (clean 1:1 relationship — good future improvement)
