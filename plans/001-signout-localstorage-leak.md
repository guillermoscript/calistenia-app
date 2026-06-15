# Plan 001: Limpiar localStorage de usuario en signOut para eliminar fuga de datos entre cuentas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useAuth.ts packages/core/hooks/useNutrition.ts packages/core/hooks/useProgress.ts packages/core/hooks/useWater.ts packages/core/hooks/useWeight.ts packages/core/hooks/useSleep.ts packages/core/hooks/useBodyMeasurements.ts packages/core/hooks/useRestPreferences.ts packages/core/hooks/useMealReminders.ts packages/core/hooks/useWorkoutReminders.ts packages/core/hooks/useWeeklyMealPlan.ts packages/core/hooks/useFavorites.ts packages/core/lib/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

Every offline-first hook seeds its `initialData` from a global (non-user-scoped) localStorage key. When `signOut` is called, only the in-memory React Query cache is cleared (`qc.clear()`), but the per-hook localStorage keys are left untouched. If a second user logs in on the same device, all their hooks reseed from the previous user's stale localStorage data before the background refetch completes — the new user sees another person's progress, water intake, weight, nutrition history, etc. `useNutrition` is the worst case: its `queryFn` explicitly merges historical entries from localStorage for "other day" records filtered only by date, so the previous user's full nutrition history persists in the accumulator even after a successful refetch of today's data.

## Current state

### Files and their roles

- `packages/core/hooks/useAuth.ts` — auth hook; `signOut` at lines 206–213; needs to call `clearUserStorage()`.
- `packages/core/lib/storage-keys.ts` — **does not exist yet**; will export `USER_SCOPED_STORAGE_KEYS` array and `clearUserStorage()` helper.
- `packages/core/lib/offlineQueue.ts` — exemplar for how `storage.removeItem(LS_KEY)` is used in this codebase.
- `packages/core/platform.ts` — exports the `storage` adapter (`getItem`, `setItem`, `removeItem`) that abstracts localStorage (web) and MMKV/AsyncStorage (mobile). Import from `'../platform'`.

### Verified localStorage key constants at 4659cd6

| Hook file | Key constant name | Key string |
|---|---|---|
| `useProgress.ts:10` | `LS_KEY` | `'calistenia_progress'` |
| `useProgress.ts:11` | `LS_SETTINGS` | `'calistenia_settings'` |
| `useWater.ts:9` | `LS_KEY` | `'calistenia_water'` |
| `useWater.ts` inline | *(inline string)* | `'calistenia_water_goal'` |
| `useWeight.ts:8` | `LS_KEY` | `'calistenia_weight_entries'` |
| `useSleep.ts:9` | `LS_KEY` | `'calistenia_sleep_entries'` |
| `useBodyMeasurements.ts:7` | `LS_KEY` | `'calistenia_body_measurements'` |
| `useRestPreferences.ts:7` | `LS_KEY` | `'calistenia_rest_prefs'` |
| `useMealReminders.ts:10` | `LS_KEY` | `'calistenia_meal_reminders'` |
| `useWorkoutReminders.ts:7` | `LS_KEY` | `'calistenia_workout_reminders'` |
| `useWeeklyMealPlan.ts:9` | `LS_KEY` | `'calistenia_weekly_plan'` |
| `useNutrition.ts:57` | `LS_ENTRIES` | `'calistenia_nutrition_entries'` |
| `useNutrition.ts:58` | `LS_GOALS` | `'calistenia_nutrition_goals'` |
| `useFavorites.ts` | `STORAGE_KEY` | `'calistenia_exercise_favorites'` |

Also clear the React Query persister cache key `'calistenia_rq_cache'` (used by the offline persister) as it may hold serialized query state scoped to the prior user.

**Deliberately EXCLUDED**: `'calistenia_referral_code'` (`REFERRAL_CODE_KEY`) — this is pre-signup referral attribution, already removed selectively elsewhere in `useAuth.ts:21`. Do NOT add it to the user-scoped clear list.

### Current signOut (packages/core/hooks/useAuth.ts:206-213) — confirmed at 4659cd6

```ts
const signOut = useCallback(() => {
  op.clear()
  logout()
  // Limpia toda la caché de queries: evita que datos del usuario anterior
  // (nutrición, progreso, social…) persistan tras logout / cambio de cuenta.
  qc.clear()
  // onChange listener limpia `user` automáticamente
}, [qc])
```

`storage.removeItem` is NOT called here — this is the bug.

### useNutrition accumulator leak (packages/core/hooks/useNutrition.ts:117-136)

```ts
queryFn: async (): Promise<NutritionEntry[]> => {
  // ... fetches today's entries from PocketBase ...
  const mapped = entriesRes.items.map(mapPBToEntry)
  // Merge con entradas cacheadas de OTROS días (no reemplazar el acumulador).
  const cachedEntries = lsGetEntries()
  const todayIds = new Set(mapped.map(e => e.id))
  const todayDateStr = todayStr()
  const otherDayEntries = cachedEntries.filter(
    e => !todayIds.has(e.id) && utcToLocalDateStr(e.loggedAt) !== todayDateStr,
  )
  const merged = [...mapped, ...otherDayEntries].sort(sortByLoggedDesc)
  lsSetEntries(merged)
  // ...
  return merged
},
```

`otherDayEntries` keeps ALL historical entries from localStorage that are not today — so after an account switch, the previous user's historical nutrition persists in the accumulator even after a successful PocketBase refetch of today's data for the new user.

### Conventions to match

- All comments in this codebase are in Spanish (see `useAuth.ts` comment block above).
- `storage` is imported from `'../platform'` in all hooks (confirmed in `useAuth.ts:1` and `offlineQueue.ts:1`).
- `storage.removeItem(LS_KEY)` pattern is established in `packages/core/lib/offlineQueue.ts:70`.
- TypeScript, no `any`. Files use named exports.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `cd apps/web && pnpm exec tsc --noEmit` | exit 0, no errors |
| Mobile typecheck | `cd apps/mobile && pnpm exec tsc --noEmit` | exit 0, no errors |
| Web build | `pnpm build` (from repo root) | green / exit 0 |
| Core tests | `cd apps/mobile && pnpm test` | all pass |
| Core unit test (new) | `cd apps/mobile && pnpm test storage-keys` | new tests pass |

## Scope

**In scope** (the only files you should create or modify):

- `packages/core/lib/storage-keys.ts` — new file; exports key list + helper
- `packages/core/hooks/useAuth.ts` — call `clearUserStorage()` inside `signOut`
- `packages/core/lib/storage-keys.test.ts` — new unit test file

**Out of scope** (do NOT touch):

- Individual hook files (`useNutrition.ts`, `useProgress.ts`, etc.) — the key strings are not changed here; they are only referenced from the new central file. Do not refactor the hooks to import from `storage-keys.ts` in this plan; that is a follow-up.
- User-scoping the LS keys (prefixing with userId) — explicitly deferred; see Maintenance notes.
- Any change to PocketBase queries or the RQ persister configuration.
- `plans/README.md` — update the status row when done, but do not create the file if it doesn't exist; report that back instead.

## Git workflow

- Branch: `feat/mobile-data-perf` (the code lives here — checkout this branch first; see STOP conditions).
- Commit style observed in `git log`: conventional commits, e.g. `fix(core): clear React Query cache on signOut`. Match this pattern.
- Example commit message for this plan: `fix(core): limpiar localStorage de usuario en signOut`
- Do NOT push, merge, rebase, or open a PR.

## Steps

### Step 1: Verificar rama y estado inicial

Run:

```bash
git checkout feat/mobile-data-perf
git status
```

Expected: on branch `feat/mobile-data-perf`, working tree clean (or only untracked files — no unexpected modifications to in-scope files).

Then confirm the drift check:

```bash
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useAuth.ts packages/core/hooks/useNutrition.ts packages/core/hooks/useProgress.ts packages/core/hooks/useWater.ts packages/core/hooks/useWeight.ts packages/core/hooks/useSleep.ts packages/core/hooks/useBodyMeasurements.ts packages/core/hooks/useRestPreferences.ts packages/core/hooks/useMealReminders.ts packages/core/hooks/useWorkoutReminders.ts packages/core/hooks/useWeeklyMealPlan.ts packages/core/lib/
```

Expected: either no output (no drift) or a diff that does NOT contradict the key constants or `signOut` excerpt in "Current state". If it does contradict them, STOP.

**Verify**: `git branch --show-current` → `feat/mobile-data-perf`

### Step 2: Crear packages/core/lib/storage-keys.ts

Create the file `packages/core/lib/storage-keys.ts` with the following content (match Spanish comment style):

```ts
/**
 * Claves de localStorage vinculadas al usuario activo.
 * Se limpian en signOut para evitar que datos del usuario anterior
 * persistan en el nuevo usuario tras un cambio de cuenta.
 *
 * IMPORTANTE: si añades una nueva clave global en un hook offline-first,
 * agrégala aquí también.
 */
import { storage } from '../platform'

export const USER_SCOPED_STORAGE_KEYS: readonly string[] = [
  // useProgress
  'calistenia_progress',
  'calistenia_settings',
  // useWater
  'calistenia_water',
  'calistenia_water_goal',
  // useWeight
  'calistenia_weight_entries',
  // useSleep
  'calistenia_sleep_entries',
  // useBodyMeasurements
  'calistenia_body_measurements',
  // useRestPreferences
  'calistenia_rest_prefs',
  // useMealReminders
  'calistenia_meal_reminders',
  // useWorkoutReminders
  'calistenia_workout_reminders',
  // useWeeklyMealPlan
  'calistenia_weekly_plan',
  // useNutrition
  'calistenia_nutrition_entries',
  'calistenia_nutrition_goals',
  // useFavorites
  'calistenia_exercise_favorites',
  // React Query persister (caché serializado offline)
  'calistenia_rq_cache',
]

/** Elimina todas las entradas de localStorage vinculadas al usuario activo. */
export function clearUserStorage(): void {
  USER_SCOPED_STORAGE_KEYS.forEach((key) => storage.removeItem(key))
}
```

**Verify**: `cd apps/web && pnpm exec tsc --noEmit` → exit 0, no errors in `packages/core/lib/storage-keys.ts`

### Step 3: Llamar clearUserStorage() en signOut

Edit `packages/core/hooks/useAuth.ts`:

1. Add the import at the top of the file (after the existing `import { storage } from '../platform'` line, or alongside the other `../lib/` imports):

```ts
import { clearUserStorage } from '../lib/storage-keys'
```

2. Inside `signOut`, add `clearUserStorage()` call immediately after `qc.clear()`:

```ts
const signOut = useCallback(() => {
  op.clear()
  logout()
  // Limpia toda la caché de queries: evita que datos del usuario anterior
  // (nutrición, progreso, social…) persistan tras logout / cambio de cuenta.
  qc.clear()
  // Elimina las entradas de localStorage del usuario (offline-first hooks).
  clearUserStorage()
  // onChange listener limpia `user` automáticamente
}, [qc])
```

**Verify**: `cd apps/web && pnpm exec tsc --noEmit` → exit 0

### Step 4: Escribir test unitario para clearUserStorage

Create `packages/core/lib/storage-keys.test.ts`. Model the structure after `packages/core/lib/matchPrograms.test.ts` (vitest, no React, pure unit).

The test must:
1. Mock `storage.removeItem` (import `storage` from `'../platform'` and spy/mock `removeItem`).
2. Assert that calling `clearUserStorage()` calls `storage.removeItem` once for each key in `USER_SCOPED_STORAGE_KEYS`.
3. Assert that the key list contains exactly the 15 expected strings (guards against accidental deletion of a key from the list).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { storage } from '../platform'
import { USER_SCOPED_STORAGE_KEYS, clearUserStorage } from './storage-keys'

vi.mock('../platform', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

const EXPECTED_KEYS = [
  'calistenia_progress',
  'calistenia_settings',
  'calistenia_water',
  'calistenia_water_goal',
  'calistenia_weight_entries',
  'calistenia_sleep_entries',
  'calistenia_body_measurements',
  'calistenia_rest_prefs',
  'calistenia_meal_reminders',
  'calistenia_workout_reminders',
  'calistenia_weekly_plan',
  'calistenia_nutrition_entries',
  'calistenia_nutrition_goals',
  'calistenia_exercise_favorites',
  'calistenia_rq_cache',
]

describe('USER_SCOPED_STORAGE_KEYS', () => {
  it('contiene exactamente las 15 claves de localStorage por usuario', () => {
    expect(USER_SCOPED_STORAGE_KEYS).toHaveLength(15)
    expect([...USER_SCOPED_STORAGE_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort())
  })
})

describe('clearUserStorage', () => {
  beforeEach(() => {
    vi.mocked(storage.removeItem).mockClear()
  })

  it('llama a storage.removeItem una vez por cada clave', () => {
    clearUserStorage()
    expect(storage.removeItem).toHaveBeenCalledTimes(EXPECTED_KEYS.length)
  })

  it('elimina cada clave esperada', () => {
    clearUserStorage()
    for (const key of EXPECTED_KEYS) {
      expect(storage.removeItem).toHaveBeenCalledWith(key)
    }
  })
})
```

**Verify**: `cd apps/mobile && pnpm test storage-keys` → all pass (3 tests)

### Step 5: Typecheck completo y build

Run both typechecks and the web build:

```bash
cd apps/web && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
pnpm build
```

All must exit 0. If any fail, fix before committing.

**Verify**: all three commands exit 0 with no errors.

### Step 6: Commit

```bash
git add packages/core/lib/storage-keys.ts packages/core/lib/storage-keys.test.ts packages/core/hooks/useAuth.ts
git commit -m "fix(core): limpiar localStorage de usuario en signOut

Introduce USER_SCOPED_STORAGE_KEYS y clearUserStorage() en
packages/core/lib/storage-keys.ts con las 14 claves offline-first.
signOut ahora llama clearUserStorage() tras qc.clear() para evitar que
datos del usuario anterior (especialmente entradas de nutrición históricas)
persistan en el acumulador del nuevo usuario tras un cambio de cuenta."
```

**Verify**: `git log --oneline -1` → shows the new commit on `feat/mobile-data-perf`

## Test plan

**New file**: `packages/core/lib/storage-keys.test.ts`

Cases to cover (specified in Step 4 above):

1. `USER_SCOPED_STORAGE_KEYS` contains exactly 15 keys — regression guard that catches an accidental key deletion.
2. `clearUserStorage()` calls `storage.removeItem` exactly N times — confirms nothing is skipped.
3. `clearUserStorage()` calls `storage.removeItem` for each specific key — confirms no key was accidentally omitted.

Structural pattern: `packages/core/lib/matchPrograms.test.ts` (vitest, describe/it, no React, no network).

**Verification command**: `cd apps/mobile && pnpm test storage-keys` → 3 tests pass

## Done criteria

- [ ] `packages/core/lib/storage-keys.ts` exists and exports `USER_SCOPED_STORAGE_KEYS` (15 keys) and `clearUserStorage()`
- [ ] `packages/core/hooks/useAuth.ts` imports `clearUserStorage` and calls it inside `signOut` after `qc.clear()`
- [ ] `cd apps/web && pnpm exec tsc --noEmit` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm build` (repo root) exits 0
- [ ] `cd apps/mobile && pnpm test storage-keys` exits 0 with 3 passing tests
- [ ] `git diff --name-only HEAD~1` shows exactly 3 files: `packages/core/lib/storage-keys.ts`, `packages/core/lib/storage-keys.test.ts`, `packages/core/hooks/useAuth.ts`
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `git branch --show-current` is not `feat/mobile-data-perf` after checkout — the branch does not exist or the checkout failed.
- The `signOut` function in `useAuth.ts` already calls `clearUserStorage()` or `storage.removeItem` — the fix may already be applied; report rather than re-apply.
- Any of the 13 hook files listed in "Current state" has a different key string than documented — the keys may have been renamed and the `USER_SCOPED_STORAGE_KEYS` list would be wrong.
- The drift check in Step 1 shows that any in-scope file changed after `4659cd6` in a way that contradicts the "Current state" excerpts.
- Either typecheck or `pnpm build` fails after a reasonable fix attempt for a new error unrelated to this plan's changes.
- The test runner cannot find or run `packages/core/lib/storage-keys.test.ts` (vitest not configured for `packages/core/`); report this instead of moving the test elsewhere.

## Maintenance notes

**For the reviewer**: scrutinize that `clearUserStorage()` is called unconditionally (not inside a try/catch that could swallow errors), and that the key list in the test's `EXPECTED_KEYS` matches `USER_SCOPED_STORAGE_KEYS` exactly.

**Future interaction**: if a new offline-first hook is added that writes to a global (non-user-scoped) localStorage key, that key must be added to `USER_SCOPED_STORAGE_KEYS`. The test's length assertion (`toHaveLength(15)`) will catch this omission.

**Explicitly deferred follow-up** — do NOT do in this plan:
- User-scoping localStorage keys (prefixing each key with the userId) would be a deeper fix that eliminates the risk entirely, even if `clearUserStorage()` is somehow not called. This was deferred because it requires changing all 12 hook files and migrating existing stored data. Track as a separate plan.
- Refactoring each hook to import its key constant from `storage-keys.ts` instead of defining it locally — deferred to keep this plan's diff minimal and blast radius low.
