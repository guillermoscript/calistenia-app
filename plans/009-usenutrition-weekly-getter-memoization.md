# Plan 009: Memoize daily totals index in useNutrition to eliminate repeated entries scans

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useNutrition.ts`
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

`useNutrition` exposes `getDailyTotals(date)`, which filters the full `entries` array on every call. `getWeeklyAverages` and `getWeeklyHistory` each call `getDailyTotals` in a 7-iteration loop, producing 7–14 full scans of `entries` per render of the nutrition week summary. As `entries` grows (the accumulator holds today's entries plus any date ranges loaded on demand), this compounds. Switching to a `useMemo` index — a `Map<dateStr, DailyTotals>` computed once when `entries` changes — reduces all three getters to O(1) map lookups per day, and eliminates the repeated `entries.filter(…)` calls entirely.

## Current state

### File to modify

- `packages/core/hooks/useNutrition.ts` — 569 lines; selectors at lines 452–513.

### Key facts about `entries`

- Declared at line 167: `const entries = entriesQuery.data ?? []` — type `NutritionEntry[]`.
- Each entry has `loggedAt: string` (UTC ISO string, mapped from PB `logged_at` at line 49).
- Date comparison uses `utcToLocalDateStr(e.loggedAt)` — this function is already imported.
- `daysAgoStr(i)` returns the local date string for `i` days ago (0 = today). Already imported.

### Verified excerpts (confirm these match before changing anything)

**Import line 2** — `useMemo` is NOT imported yet:
```ts
import { useCallback, useRef } from 'react'
```

**getDailyTotals (lines 452–464)**:
```ts
const getDailyTotals = useCallback((date?: string): DailyTotals => {
  const target = date || todayStr()
  const dayEntries = entries.filter(e => utcToLocalDateStr(e.loggedAt) === target)
  return dayEntries.reduce<DailyTotals>(
    (acc, e) => ({
      calories: acc.calories + e.totalCalories,
      protein: acc.protein + e.totalProtein,
      carbs: acc.carbs + e.totalCarbs,
      fat: acc.fat + e.totalFat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}, [entries])
```

**getWeeklyAverages (lines 466–487)**:
```ts
const getWeeklyAverages = useCallback((): DailyTotals => {
  const totals: DailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  let daysWithEntries = 0
  for (let i = 0; i < 7; i++) {
    const dateStr = daysAgoStr(i)
    const dayTotals = getDailyTotals(dateStr)
    if (dayTotals.calories > 0) {
      totals.calories += dayTotals.calories
      totals.protein += dayTotals.protein
      totals.carbs += dayTotals.carbs
      totals.fat += dayTotals.fat
      daysWithEntries++
    }
  }
  if (daysWithEntries === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
  return {
    calories: Math.round(totals.calories / daysWithEntries),
    protein: Math.round(totals.protein / daysWithEntries),
    carbs: Math.round(totals.carbs / daysWithEntries),
    fat: Math.round(totals.fat / daysWithEntries),
  }
}, [getDailyTotals])
```

**getEntriesForDate (lines 489–491)** — NOT changed by this plan but present between the two targets:
```ts
const getEntriesForDate = useCallback((date: string): NutritionEntry[] => {
  return entries.filter(e => utcToLocalDateStr(e.loggedAt) === date)
}, [entries])
```

**getWeeklyHistory (lines 493–513)**:
```ts
const getWeeklyHistory = useCallback((): Array<{
  date: string; dayLabel: string; calories: number; protein: number; carbs: number; fat: number
}> => {
  const dayKeys = ['day.shortSun', 'day.shortMon', 'day.shortTue', 'day.shortWed', 'day.shortThu', 'day.shortFri', 'day.shortSat']
  const days = dayKeys.map(k => i18n.t(k))
  const result = []
  for (let i = 6; i >= 0; i--) {
    const dateStr = daysAgoStr(i)
    const d = new Date(`${dateStr}T12:00:00`)
    const totals = getDailyTotals(dateStr)
    result.push({
      date: dateStr,
      dayLabel: days[d.getDay()],
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fat: Math.round(totals.fat),
    })
  }
  return result
}, [getDailyTotals])
```

**Return shape (must not change)**:
```ts
return {
  entries,
  goals,
  isReady,
  analyzeMeal,
  scoreMealQuality,
  saveEntry,
  deleteEntry,
  updateEntry,
  saveGoals,
  calculateMacros,
  getDailyTotals,
  getWeeklyAverages,
  getWeeklyHistory,
  getEntriesForDate,
  fetchEntriesForDate,
  fetchEntriesForDateRange,
  getRemainingMacros,
  getRecentEntries,
}
```

### NutritionEntry fields used in totals

From the type and the reduce in `getDailyTotals`:
- `e.totalCalories` (number)
- `e.totalProtein` (number)
- `e.totalCarbs` (number)
- `e.totalFat` (number)
- `e.loggedAt` (string — UTC ISO)

`DailyTotals` shape: `{ calories: number; protein: number; carbs: number; fat: number }`.

## Commands you will need

| Purpose             | Command                                              | Expected on success         |
|---------------------|------------------------------------------------------|-----------------------------|
| Checkout branch     | `git checkout feat/mobile-data-perf`                 | On branch feat/mobile-data-perf |
| Web typecheck       | `cd apps/web && pnpm exec tsc --noEmit`              | exit 0, no errors           |
| Mobile typecheck    | `cd apps/mobile && pnpm exec tsc --noEmit`           | exit 0, no errors           |
| Build               | `pnpm build`                                         | exit 0                      |

## Suggested executor toolkit

- Read `.agents/skills/vercel-react-best-practices/rules/js-index-maps.md` — the `Map` grouping used in step 2 follows that rule.
- Read `.agents/skills/vercel-react-best-practices/rules/js-combine-iterations.md` — the single-pass accumulation of all fields in the `useMemo` follows that rule.

## Scope

**In scope** (the only file you should modify):
- `packages/core/hooks/useNutrition.ts`

**Out of scope** (do NOT touch, even though they look related):
- `getEntriesForDate` — it returns raw `NutritionEntry[]` (not `DailyTotals`); its filter on `entries` is a different concern. Leave it unchanged.
- `getRecentEntries` — hits PocketBase directly; separate concern.
- `getRemainingMacros` — calls `getDailyTotals` once per call; the memoization in this plan makes that call O(1), which is sufficient without further changes.
- All write operations (`saveEntry`, `deleteEntry`, `updateEntry`), the query functions, and AI functions.
- The public return shape.

## Git workflow

- Branch: `advisor/009-usenutrition-weekly-getter-memoization` (branch off `feat/mobile-data-perf`)
- Commit style: `perf(core): memoizar índice de totales diarios en useNutrition`
- Do NOT push or open a PR.

## Steps

### Step 0: Verify branch and drift

```bash
git checkout feat/mobile-data-perf
git checkout -b advisor/009-usenutrition-weekly-getter-memoization
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useNutrition.ts
```

**Verify**: diff output is empty. If not, compare the excerpts in "Current state" to live code before continuing.

### Step 1: Add `useMemo` to the React import

In `packages/core/hooks/useNutrition.ts`, update line 2:

Before:
```ts
import { useCallback, useRef } from 'react'
```

After:
```ts
import { useCallback, useMemo, useRef } from 'react'
```

**Verify**: `grep -n "useMemo" packages/core/hooks/useNutrition.ts` → shows the import line only (no other usage yet).

### Step 2: Add the memoized daily-totals index

Immediately **before** the `// ─── Selectores derivados ─────────────────────────────────────────────────` comment (which precedes `getDailyTotals`), insert:

```ts
// ─── Índice de totales diarios (se recomputa solo cuando entries cambia) ───
const dailyTotalsMap = useMemo((): Map<string, DailyTotals> => {
  const map = new Map<string, DailyTotals>()
  for (const e of entries) {
    const dateStr = utcToLocalDateStr(e.loggedAt)
    const prev = map.get(dateStr) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
    map.set(dateStr, {
      calories: prev.calories + e.totalCalories,
      protein: prev.protein + e.totalProtein,
      carbs:   prev.carbs   + e.totalCarbs,
      fat:     prev.fat     + e.totalFat,
    })
  }
  return map
}, [entries])
```

**Verify**: `cd apps/web && pnpm exec tsc --noEmit` exits 0 (file is syntactically valid so far).

### Step 3: Rewrite `getDailyTotals` to use the map

Replace the existing `getDailyTotals` `useCallback` with:

```ts
const getDailyTotals = useCallback((date?: string): DailyTotals => {
  const target = date || todayStr()
  return dailyTotalsMap.get(target) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
}, [dailyTotalsMap])
```

The public signature `(date?: string): DailyTotals` is unchanged.

**Verify**: `grep -n "entries\.filter" packages/core/hooks/useNutrition.ts` → the `getDailyTotals` callback no longer appears in the output (only `getEntriesForDate` still has `entries.filter`, which is correct — leave that line alone).

### Step 4: Confirm `getWeeklyAverages` and `getWeeklyHistory` need no further changes

These two callbacks depend on `getDailyTotals` via their `useCallback` dependency arrays (`[getDailyTotals]`). After step 3, every `getDailyTotals(dateStr)` call inside them performs a `Map.get` — O(1) — instead of `entries.filter`. No code change is needed to the bodies of `getWeeklyAverages` or `getWeeklyHistory`.

**Verify**: `grep -n "getDailyTotals" packages/core/hooks/useNutrition.ts` → shows the function definition (step 3), and its two uses inside `getWeeklyAverages` and `getWeeklyHistory`. Confirm no additional `entries.filter` calls remain inside those two functions.

### Step 5: Typecheck and build

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

### Step 6: Commit

```bash
git add packages/core/hooks/useNutrition.ts
git commit -m "perf(core): memoizar índice de totales diarios en useNutrition"
```

## Test plan

No automated unit tests exist for these selectors. Manual verification:

1. Open the nutrition week summary screen — confirm that weekly averages and the 7-day history chart render the same values as before.
2. Log a new meal entry — confirm that `getDailyTotals(today)` and `getWeeklyAverages()` update immediately (TanStack Query invalidation triggers `entries` change → `useMemo` recomputes).
3. Navigate to a previous date — confirm `getDailyTotals(pastDate)` returns the correct totals (previously loaded via `fetchEntriesForDate`, which appends to the accumulator via `patchEntries`).
4. Confirm `getRemainingMacros()` returns the same values as before (it calls `getDailyTotals` once).

Formal test coverage is deferred.

## Done criteria

- [ ] `getDailyTotals` no longer calls `entries.filter(…)` — it calls `dailyTotalsMap.get(…)` instead
- [ ] `getWeeklyAverages` and `getWeeklyHistory` are unchanged in body (they inherit the speedup via `getDailyTotals`)
- [ ] `useMemo` is imported from `react`
- [ ] `dailyTotalsMap` is a `useMemo` block with `[entries]` dependency
- [ ] `cd apps/web && pnpm exec tsc --noEmit` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm build` exits 0
- [ ] No files outside `packages/core/hooks/useNutrition.ts` are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (drift).
- `DailyTotals` is not in scope where `dailyTotalsMap` is declared — check that the type is imported from `'../types'` (it appears at import line ~17); if not, add it to the import and note the deviation.
- TypeScript reports that `e.totalCalories` / `e.totalProtein` / `e.totalCarbs` / `e.totalFat` do not exist on `NutritionEntry` — inspect `packages/core/types.ts` for the actual field names and adapt the accumulation accordingly, then report the deviation.
- Build or typecheck fails after two fix attempts.
- Any touch to a file outside the in-scope list appears necessary.

## Maintenance notes

- **Accumulator growth**: `entries` is an accumulator — it starts with today's entries and grows as the user navigates to past dates (via `fetchEntriesForDate`). The `useMemo` recomputes on every growth, which is acceptable (O(n) once vs. O(7n) on each weekly render). If the accumulator is ever bounded or paginated, the `dailyTotalsMap` logic remains correct without changes.
- **`getEntriesForDate` not changed**: It returns raw `NutritionEntry[]` for CRUD display (the edit list), not aggregated totals. Changing it to use the map would return the wrong type. Leave it on `entries.filter`.
- **`getRemainingMacros` free**: It calls `getDailyTotals` once; after this plan its cost drops from O(n) to O(1). No further change needed.
- **Future: per-meal breakdown**: If a future feature needs per-meal-type breakdowns (breakfast/lunch/dinner totals), the `useMemo` in step 2 is the right place to extend — add a second map keyed on `${dateStr}_${e.mealType}`.
