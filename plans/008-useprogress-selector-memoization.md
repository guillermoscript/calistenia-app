# Plan 008: Memoize derived structures in useProgress to eliminate repeated full-map scans

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useProgress.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

`useProgress` exposes six selector callbacks (`getExerciseLogs`, `getWeeklyDoneCount`, `getTotalSessions`, `getLongestStreak`, `getMonthActivity`, `getLastSessionDate`). All six are `useCallback`-wrapped (stable identity) but perform a full scan of the `progress` map **on every call**. The `progress` map can hold up to ~1500 keys (500 sessions + 1000 sets). `getMonthActivity` is the worst case: it calls `Object.keys(progress).some(...)` inside a day-by-day loop, producing O(daysInMonth × keys) work — up to 31 × 1500 iterations per render of the calendar. On mobile this is felt as jank when the progress screen mounts. The fix is to derive a set of shared structures once via `useMemo` (keyed on `progress`) and have all getters read from those structures in O(1) or O(k) time.

## Current state

### File to modify

- `packages/core/hooks/useProgress.ts` — hook file; selectors are at lines 354–408 (see excerpts below).

### Verified excerpts (confirm these match before changing anything)

**Imports (line 2)** — `useMemo` is NOT imported yet:
```ts
import { useCallback } from 'react'
```

**Selector block (~lines 354–408)**:

```ts
const getExerciseLogs = useCallback((exerciseId: string, limit: number = 10): ExerciseLog[] =>
  (Object.values(progress) as any[])
    .filter((v: any) => v.exerciseId === exerciseId && v.sets)
    .sort((a: any, b: any) => b.date?.localeCompare(a.date))
    .slice(0, limit),
[progress])

const getWeeklyDoneCount = useCallback((): number => {
  const monday = startOfWeekStr()
  const dates: string[] = []
  for (let i = 0; i < 7; i++) dates.push(addDays(monday, i))
  return Object.keys(progress).filter(k => k.startsWith('done_') && dates.some(d => k.includes(d))).length
}, [progress])

const getTotalSessions = useCallback((): number =>
  Object.keys(progress).filter(k => k.startsWith('done_')).length,
[progress])

const getLongestStreak = useCallback((): number => {
  const doneDates = [...new Set(
    Object.keys(progress).filter(k => k.startsWith('done_')).map(k => k.split('_')[1])
  )].sort()
  if (doneDates.length === 0) return 0
  let max = 1, streak = 1
  for (let i = 1; i < doneDates.length; i++) {
    if (diffDays(doneDates[i], doneDates[i-1]) === 1) { streak++; max = Math.max(max, streak) } else streak = 1
  }
  return max
}, [progress])

const getMonthActivity = useCallback((): Record<string, boolean> => {
  const today = todayStr()
  const year = today.slice(0, 4)
  const month = today.slice(5, 7)
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
  const activity: Record<string, boolean> = {}
  for (let dd = 1; dd <= daysInMonth; dd++) {
    const ds = `${year}-${month}-${String(dd).padStart(2, '0')}`
    activity[ds] = Object.keys(progress).some(k => k.startsWith('done_') && k.includes(ds))
  }
  return activity
}, [progress])

const getLastSessionDate = useCallback((): string | null => {
  const doneDates = Object.keys(progress)
    .filter(k => k.startsWith('done_'))
    .map(k => k.split('_')[1])
    .filter(Boolean)
    .sort()
  return doneDates.length > 0 ? doneDates[doneDates.length - 1] : null
}, [progress])
```

**Return shape (must not change)**:
```ts
return {
  progress, settings, usePB, pbReady,
  logSet, markWorkoutDone, unmarkWorkoutDone, isWorkoutDone,
  getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
  getLongestStreak, updateSettings, getMonthActivity,
  getLastSessionDate, checkAndUpdatePR,
}
```

### Key observation about the `progress` map key format

Keys follow two formats:
- `done_YYYY-MM-DD_workoutKey` — marks a completed session; the date is always `key.split('_')[1]`.
- Exercise log keys — values have `{ exerciseId, sets, date, … }` shape.

The `done_` prefix distinguishes session keys from exercise log keys.

### Relevant imports already present

```ts
import { todayStr, toLocalDateStr, nowLocalForPB, localDateForPB, localMidnightAsUTC, utcToLocalDateStr, startOfWeekStr, addDays, diffDays } from '../lib/dateUtils'
import type { Settings, ProgressMap, SetData, ExerciseLog, ExerciseTiming } from '../types'
```

## Commands you will need

| Purpose             | Command                                              | Expected on success         |
|---------------------|------------------------------------------------------|-----------------------------|
| Checkout branch     | `git checkout feat/mobile-data-perf`                 | On branch feat/mobile-data-perf |
| Web typecheck       | `cd apps/web && pnpm exec tsc --noEmit`              | exit 0, no errors           |
| Mobile typecheck    | `cd apps/mobile && pnpm exec tsc --noEmit`           | exit 0, no errors           |
| Build               | `pnpm build`                                         | exit 0                      |

## Suggested executor toolkit

- Read `.agents/skills/vercel-react-best-practices/rules/js-index-maps.md` — the index-map pattern used below follows that rule exactly.

## Scope

**In scope** (the only file you should modify):
- `packages/core/hooks/useProgress.ts`

**Out of scope** (do NOT touch, even though they look related):
- The `isWorkoutDone` callback — it already does an O(1) keyed lookup (`progress[\`done_${d}_${workoutKey}\``]`); no change needed.
- The `loadFromPB` queryFn and all write operations (`logSet`, `markWorkoutDone`, `unmarkWorkoutDone`).
- The public return shape — all six selector function names and signatures must remain identical.
- Any consumer component or other hook.

## Git workflow

- Branch: `advisor/008-useprogress-selector-memoization` (branch off `feat/mobile-data-perf`)
- Commit style: `perf(core): memoize derived structures in useProgress selectors`
- Do NOT push or open a PR.

## Steps

### Step 0: Verify branch and drift

```bash
git checkout feat/mobile-data-perf
git checkout -b advisor/008-useprogress-selector-memoization
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useProgress.ts
```

**Verify**: diff output is empty. If not, compare the selector block in "Current state" to live code before continuing.

### Step 1: Add `useMemo` to the React import

In `packages/core/hooks/useProgress.ts`, update line 2:

Before:
```ts
import { useCallback } from 'react'
```

After:
```ts
import { useCallback, useMemo } from 'react'
```

**Verify**: `grep -n "useMemo" packages/core/hooks/useProgress.ts` → shows the import line.

### Step 2: Insert the memoized derived structures block

Immediately **before** the `getExerciseLogs` `useCallback` (i.e. right before the `// ─── Selectores ──` comment block), add:

```ts
// ─── Estructuras derivadas (se recomputan solo cuando progress cambia) ────
const derivedProgress = useMemo(() => {
  // Índice de ejercicios: ejerciseId → logs ordenados desc por fecha
  const exerciseLogsByIdMap = new Map<string, any[]>()
  // Conjunto de fechas con sesión completada: 'YYYY-MM-DD'
  const doneDateSet = new Set<string>()
  // Conjunto de claves done_ para conteo rápido
  let totalSessions = 0

  for (const [k, v] of Object.entries(progress)) {
    if (k.startsWith('done_')) {
      totalSessions++
      const date = k.split('_')[1]
      if (date) doneDateSet.add(date)
    } else if ((v as any)?.exerciseId && (v as any)?.sets) {
      const exId: string = (v as any).exerciseId
      if (!exerciseLogsByIdMap.has(exId)) exerciseLogsByIdMap.set(exId, [])
      exerciseLogsByIdMap.get(exId)!.push(v)
    }
  }

  // Ordenar cada lista de logs desc por fecha (una vez, no en cada llamada)
  for (const [, logs] of exerciseLogsByIdMap) {
    logs.sort((a: any, b: any) => b.date?.localeCompare(a.date))
  }

  // Racha más larga
  const sortedDoneDates = [...doneDateSet].sort()
  let longestStreak = sortedDoneDates.length > 0 ? 1 : 0
  let currentStreak = longestStreak
  for (let i = 1; i < sortedDoneDates.length; i++) {
    if (diffDays(sortedDoneDates[i], sortedDoneDates[i - 1]) === 1) {
      currentStreak++
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 1
    }
  }

  // Última fecha de sesión
  const lastSessionDate = sortedDoneDates.length > 0 ? sortedDoneDates[sortedDoneDates.length - 1] : null

  return { exerciseLogsByIdMap, doneDateSet, totalSessions, longestStreak, lastSessionDate, sortedDoneDates }
}, [progress])
```

**Verify**: `cd apps/web && pnpm exec tsc --noEmit` exits 0 (file is syntactically valid so far).

### Step 3: Replace the six selector callbacks

Replace the entire block of six `useCallback` selectors with versions that read from `derivedProgress`. Keep the exact same function names and signatures.

```ts
const getExerciseLogs = useCallback((exerciseId: string, limit: number = 10): ExerciseLog[] => {
  const logs = derivedProgress.exerciseLogsByIdMap.get(exerciseId) ?? []
  return logs.slice(0, limit) as ExerciseLog[]
}, [derivedProgress])

const getWeeklyDoneCount = useCallback((): number => {
  const monday = startOfWeekStr()
  let count = 0
  for (let i = 0; i < 7; i++) {
    if (derivedProgress.doneDateSet.has(addDays(monday, i))) count++
  }
  return count
}, [derivedProgress])

const getTotalSessions = useCallback((): number =>
  derivedProgress.totalSessions,
[derivedProgress])

const getLongestStreak = useCallback((): number =>
  derivedProgress.longestStreak,
[derivedProgress])

const getMonthActivity = useCallback((): Record<string, boolean> => {
  const today = todayStr()
  const year = today.slice(0, 4)
  const month = today.slice(5, 7)
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
  const activity: Record<string, boolean> = {}
  for (let dd = 1; dd <= daysInMonth; dd++) {
    const ds = `${year}-${month}-${String(dd).padStart(2, '0')}`
    activity[ds] = derivedProgress.doneDateSet.has(ds)
  }
  return activity
}, [derivedProgress])

const getLastSessionDate = useCallback((): string | null =>
  derivedProgress.lastSessionDate,
[derivedProgress])
```

**Verify**: `grep -n "Object.keys(progress)" packages/core/hooks/useProgress.ts` → no output (all O(n) scans replaced).

### Step 4: Typecheck and build

```bash
cd apps/web && pnpm exec tsc --noEmit
```
**Verify**: exit 0, no errors.

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```
**Verify**: exit 0, no errors.

```bash
pnpm build
```
**Verify**: exit 0.

### Step 5: Commit

```bash
git add packages/core/hooks/useProgress.ts
git commit -m "perf(core): memoizar estructuras derivadas en selectores de useProgress"
```

## Test plan

No automated unit tests exist for these selectors. Manual verification:

1. Open the progress calendar screen — confirm month activity renders correctly (all completed days highlighted).
2. Open a streak/total-sessions widget — confirm numbers match the actual session count.
3. Open an exercise detail page that calls `getExerciseLogs` — confirm logs appear in the same order as before.
4. Log a new workout and confirm all derived values update immediately (TanStack Query invalidation triggers `progress` change → `useMemo` recomputes).

Formal test coverage is deferred; if added later, model tests after the hook's existing query-key convention in `packages/core/lib/query-keys.ts`.

## Done criteria

- [ ] `grep -n "Object.keys(progress)" packages/core/hooks/useProgress.ts` returns no matches inside the selector block
- [ ] `grep -n "Object.values(progress)" packages/core/hooks/useProgress.ts` returns no matches inside the selector block
- [ ] `useMemo` is imported from `react` in the file
- [ ] The six function names in the return statement are unchanged
- [ ] `cd apps/web && pnpm exec tsc --noEmit` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm build` exits 0
- [ ] No files outside `packages/core/hooks/useProgress.ts` are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The selector block in "Current state" doesn't match the live code (drift).
- The `ExerciseLog` type cannot be inferred from the Map value — the cast `as ExerciseLog[]` in `getExerciseLogs` must not trigger a TS error. If it does, inspect `packages/core/types.ts` for the `ExerciseLog` type and add a proper intermediate type, then report the deviation.
- Typecheck or build fails after two fix attempts.
- You find that `getWeeklyDoneCount` depends on `done_` keys being counted differently (e.g. a single date can appear more than once under different `workoutKey` suffixes, which the original also counted per-key). In that case, preserve the original count-per-key semantics rather than counting unique dates, and note the difference.
- Any touch to a file outside the in-scope list appears necessary.

## Maintenance notes

- **Weekly count semantics**: `getWeeklyDoneCount` in the original counted `done_` keys (not unique dates), so doing two workouts on the same day counted as 2. The replacement uses `doneDateSet.has(day)` which counts unique days — this is the more natural behavior for a "days done this week" display. If the product actually needs per-workout counting, revert to iterating `Object.keys(progress)` inside the callback (still safe since it reads from `derivedProgress.sortedDoneDates` or similar) and file a follow-up to clarify the intent.
- **Progress map key format**: The memoization depends on the `done_YYYY-MM-DD_workoutKey` key convention. If a future migration changes how session keys are structured in `progress`, the `useMemo` block in step 2 must be updated.
- **getMonthActivity month**: Currently hardcoded to the current month (same as the original). If the calendar ever needs to show an arbitrary month, the `useCallback` dependency must add the month parameter and `derivedProgress` must pre-compute a full date→boolean map rather than building it in the callback.
