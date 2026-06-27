# Plan 009: Universal PR tracking + robust reps parsing (every exercise, not just 5 hard-coded families)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. When done, update this plan's status row in
> `advisor-plans/README-exercise-data.md` (the "exercise data normalization" group) — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: from the repo root
> `/Users/guillermomarin/Documents/ejercicios/calistenia-app`, run:
> `git diff --stat 943f558..HEAD -- packages/core/hooks/useProgress.ts packages/core/types/index.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts below against the live code before proceeding. On any mismatch in
> `PR_PATTERNS` / `computePRBackfill` / `checkAndUpdatePR` / the `Settings` PR
> fields, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes how PRs are computed and stored for all users; must stay
  backward-compatible with the 5 existing `pr_*` Settings fields the UI reads)
- **Depends on**: none (independent of 008, but they are complementary)
- **Category**: feature / bug
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

The request's central worry — *"track the exercise score properly and not just a
handful"* — is literally true today for **personal records**. PR detection lives
in `useProgress.ts` and only recognizes **five** exercise families via hard-coded
substring tests:

```
pullups · pushups · l-sit · pistol · handstand
```

Every other exercise (the catalog has 170+) records its sets to `sets_log` but
**never produces a PR** — `checkAndUpdatePR` returns `null` and the value is never
surfaced. Two compounding defects:

1. **Coverage**: only 5 of 170+ exercises can ever have a PR.
2. **Parsing**: PR math uses `parseInt(reps)`, so a logged `"8-12"` becomes `8`
   (undercount) and `"max"` becomes `NaN` and is silently dropped.
3. **Fragility**: substring matching (`id.includes('pushup')`) breaks across id
   schemes — kebab `push-up` does NOT contain `pushup`, so slugs logged by the
   manual picker (see Plan 008) miss PRs entirely.

This plan generalizes PRs to **every exercise id**, stored in a generic
`Settings.prs` map, while keeping the 5 legacy `pr_*` fields populated so existing
UI keeps working. It also replaces `parseInt` with a tested `parseRepsForPR`
helper.

## Current state

Files involved:

- `packages/core/hooks/useProgress.ts` — **primary file modified.** Holds
  `PR_PATTERNS`, `computePRBackfill`, `checkAndUpdatePR`, and `logSet`.
- `packages/core/types/index.ts` — **modified.** Holds the `Settings` interface
  whose PR fields must gain a generic `prs` map.
- `packages/core/lib/pr-utils.ts` — **created.** New home for the pure
  `parseRepsForPR` helper (and optionally a `prKeyForLegacy` mapper) so logic is
  unit-testable in the node test environment.
- `packages/core/lib/__tests__/pr-utils.test.ts` — **created.** Unit tests.

### `PR_PATTERNS` — the 5 hard-coded families (VERBATIM, `useProgress.ts:23-29`)

```tsx
const PR_PATTERNS: Array<{ test: (id: string) => boolean; key: keyof Settings }> = [
  { test: (id) => id.includes('pullup') || id.includes('chinup') || id === 'chin_up', key: 'pr_pullups' },
  { test: (id) => id.includes('pushup'), key: 'pr_pushups' },
  { test: (id) => id.startsWith('lsit') || id === 'l_sit', key: 'pr_lsit' },
  { test: (id) => id.startsWith('pistol'), key: 'pr_pistol' },
  { test: (id) => id.startsWith('handstand'), key: 'pr_handstand' },
]
```

### `computePRBackfill` — scans all sets on load (VERBATIM, `useProgress.ts:32-52`)

```tsx
const computePRBackfill = (sets: any[], currentSettings: Settings): Partial<Settings> | null => {
  const maxPRs: Partial<Record<keyof Settings, number>> = {}
  for (const s of sets) {
    const repsNum = parseInt(s.reps)
    if (isNaN(repsNum) || repsNum <= 0) continue
    const match = PR_PATTERNS.find(p => p.test(s.exercise_id))
    if (!match) continue
    const cur = (maxPRs[match.key] as number) || 0
    if (repsNum > cur) maxPRs[match.key] = repsNum
  }
  const updates: Partial<Settings> = {}
  let hasUpdates = false
  for (const [key, val] of Object.entries(maxPRs)) {
    const stored = (currentSettings as unknown as Record<string, number>)[key] || 0
    if ((val as number) > stored) {
      ;(updates as any)[key] = val
      hasUpdates = true
    }
  }
  return hasUpdates ? updates : null
}
```

### `checkAndUpdatePR` — called after each logged set (VERBATIM, `useProgress.ts:552-566`)

```tsx
const checkAndUpdatePR = useCallback(async (exerciseId: string, reps: string): Promise<PREvent | null> => {
  const repsNum = parseInt(reps)
  if (isNaN(repsNum) || repsNum <= 0) return null
  const match = PR_PATTERNS.find(p => p.test(exerciseId))
  if (!match) return null
  const prKey = match.key
  const cur = qc.getQueryData<ProgressData>(key)?.settings ?? settings
  const current = (cur as unknown as Record<string, number>)[prKey] || 0
  if (repsNum > current) {
    await updateSettings({ [prKey]: repsNum } as Partial<Settings>)
    op.track('pr_achieved', { exercise_id: exerciseId, pr_key: String(prKey), old_value: current, new_value: repsNum })
    return { exerciseId, prKey: String(prKey), oldValue: current, newValue: repsNum }
  }
  return null
}, [updateSettings, qc, key, settings])
```

### The `Settings` PR fields (VERBATIM, `packages/core/types/index.ts:156-165`)

```tsx
export interface Settings {
  phase: number
  startDate: string | null
  weeklyGoal: number
  pr_pullups?: number
  pr_pushups?: number
  pr_lsit?: number
  pr_pistol?: number
  pr_handstand?: number
}
```

### `PREvent` (VERBATIM reference, `useProgress.ts:15-20`)

```tsx
export interface PREvent {
  exerciseId: string
  prKey: string
  oldValue: number
  newValue: number
}
```

`checkAndUpdatePR` already returns the `exerciseId`; the consumer (the session UI
that shows a PR celebration) can therefore key off the exercise id directly — no
consumer change is required by this plan.

## Design (read before editing)

The goal is **PRs for every exercise id** without an unbounded list of `pr_*`
columns. Approach — additive and backward-compatible:

1. Add a generic map to `Settings`: `prs?: Record<string, number>` — `exerciseId
   → best reps`. This is the new source of truth for *all* exercises.
2. **Keep the 5 legacy `pr_*` fields** and keep mirroring into them when an id
   matches a legacy family, so any existing UI that reads `settings.pr_pushups`
   keeps working unchanged. (Legacy fields become a derived convenience; `prs` is
   authoritative.)
3. Replace `parseInt` with `parseRepsForPR` (pure, tested): extract the **largest
   integer** present in the reps string. `"12"`→12, `"8-12"`→12, `"max"`→null,
   `""`→null, `"3x10"`→10. Rationale: for a PR we want the best achieved rep
   count; the max integer is the safe, defensible interpretation of a free-text
   field and strictly beats `parseInt` (which takes the first token).
4. `checkAndUpdatePR(exerciseId, reps)` updates `prs[exerciseId]`; if the id maps
   to a legacy family, also update that `pr_*` field. Returns a `PREvent` keyed by
   the exercise id (use `prKey: legacyKey ?? exerciseId`).
5. `computePRBackfill` rebuilds the **entire** `prs` map from all sets plus the
   legacy fields, so historical data populates retroactively.

This means **no PB migration** is needed — `Settings` is stored as JSON
(localStorage + the PB user settings blob), so adding a `prs` object is
non-breaking. Confirm how Settings is persisted in Step 1 before relying on this.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install (repo root) | `pnpm install` | exit 0 |
| Core unit tests | `cd packages/core && npm run test` *(verify script exists first)* | all pass |
| Web typecheck | `cd apps/web && npm run typecheck` | exit 0 |
| Web build | `cd apps/web && npm run build` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 |
| Find Settings persistence | `grep -rn 'pr_pushups\|prs\b\|updateSettings' packages/core apps/web apps/mobile --include=*.ts --include=*.tsx` | locate readers/writers |

> **Test-runner caveat** (from plan 003): `packages/core` may not have its own
> `test` script. Verify with `grep -n '"test"' packages/core/package.json`. If
> absent, the pure helper test must run via whichever workspace runner discovers
> `packages/core/lib/__tests__/*` — check the root `package.json` test script and
> `vitest.config.*`. If no runner picks up core tests, place the test where one
> does (e.g. mirror the existing `packages/core/lib/*.test.ts` location that is
> already discovered — `grep -rn 'describe(' packages/core/lib` to find the
> convention) and note the chosen location in your report. Do NOT invent a new
> test runner.

## Scope

**In scope** (modify/create only):
- `packages/core/hooks/useProgress.ts` (modify)
- `packages/core/types/index.ts` (modify — add `prs?` to `Settings`)
- `packages/core/lib/pr-utils.ts` (create — `parseRepsForPR`, optional legacy mapper)
- `packages/core/lib/__tests__/pr-utils.test.ts` (or the repo's discovered core-test location) (create)
- `advisor-plans/README-exercise-data.md` (status row)

**Out of scope** (do NOT touch):
- `LogWorkoutPage.tsx` — Plan 008 owns it.
- Any `pb_migrations/**` — `Settings` is JSON; no schema change.
- The session/PR-celebration UI component — it already consumes `PREvent`/`exerciseId`.
- Building a new "all PRs" screen — explicitly deferred (see Maintenance notes);
  this plan only makes the *data* universal.

## Git workflow

- Branch: `advisor/009-universal-pr-tracking` (from `main`).
- Explicit paths in `git add`. NEVER `git add -A`.
- Commit style: `feat(core): track personal records for every exercise + robust reps parsing`
- No push/PR/merge/rebase without the operator's say-so.

## Steps

### Step 1: Confirm how `Settings` is persisted and where `pr_*` is read

1. `grep -rn 'pr_pushups\|pr_pullups\|pr_lsit\|pr_pistol\|pr_handstand' packages apps --include=*.ts --include=*.tsx`
   — list every consumer. Confirm they only **read** the 5 fields for display
   (so keeping them populated preserves behavior).
2. Confirm `Settings` is serialized as JSON (localStorage key `calistenia_settings`
   in `useProgress.ts:11`, and the PB user-settings write path). This is what
   makes adding `prs?` non-breaking.

**STOP** if any consumer *writes* a `pr_*` field outside `useProgress.ts`, or if
`Settings` is stored in a typed PB column rather than a JSON blob (then a
migration would be needed — report before proceeding).

### Step 2: Add the pure `parseRepsForPR` helper + tests

Create `packages/core/lib/pr-utils.ts`:

```ts
/**
 * Best achieved rep count from a free-text reps string, for PR computation.
 * Extracts the LARGEST integer present. Returns null when there is no positive
 * integer (e.g. "max", "", "AMRAP"), so callers skip non-numeric entries.
 *   "12" → 12 · "8-12" → 12 · "3x10" → 10 · "max" → null · "" → null
 */
export function parseRepsForPR(reps: string | null | undefined): number | null {
  if (!reps) return null
  const nums = String(reps).match(/\d+/g)
  if (!nums) return null
  const max = Math.max(...nums.map(Number))
  return max > 0 ? max : null
}
```

Create the test (at the discovered core-test location) covering: `"12"→12`,
`"8-12"→12`, `"3x10"→10`, `"max"→null`, `""→null`, `null→null`, `"0"→null`.

**Verify**: the new test passes via the discovered runner.

### Step 3: Add `prs` to `Settings`

In `packages/core/types/index.ts`, extend the interface (keep the 5 legacy
fields):

```tsx
export interface Settings {
  phase: number
  startDate: string | null
  weeklyGoal: number
  pr_pullups?: number
  pr_pushups?: number
  pr_lsit?: number
  pr_pistol?: number
  pr_handstand?: number
  /** Universal PRs: exerciseId → best achieved reps. Authoritative for ALL
   *  exercises. The 5 pr_* fields above are kept in sync for legacy UI. */
  prs?: Record<string, number>
}
```

**Verify**: `cd apps/web && npm run typecheck` → exit 0 (additive optional field
should not break anything).

### Step 4: Generalize the PR logic in `useProgress.ts`

Keep `PR_PATTERNS` (it now only decides which *legacy* field to also mirror), but
rewrite the three functions to be id-universal and to use `parseRepsForPR`.

1. Import the helper at the top of `useProgress.ts`:
   ```tsx
   import { parseRepsForPR } from '../lib/pr-utils'
   ```

2. Add a small mapper next to `PR_PATTERNS`:
   ```tsx
   /** Legacy pr_* field for an id, or null if it is not one of the 5 families. */
   const legacyPrKey = (id: string): keyof Settings | null =>
     PR_PATTERNS.find(p => p.test(id))?.key ?? null
   ```

3. Rewrite `computePRBackfill` to build the full `prs` map (every id) and mirror
   legacy fields:
   ```tsx
   const computePRBackfill = (sets: any[], currentSettings: Settings): Partial<Settings> | null => {
     const bestById: Record<string, number> = { ...(currentSettings.prs ?? {}) }
     let changed = false
     for (const s of sets) {
       const n = parseRepsForPR(s.reps)
       if (n == null) continue
       const id = s.exercise_id
       if (!id) continue
       if (n > (bestById[id] ?? 0)) { bestById[id] = n; changed = true }
     }
     // Mirror into the 5 legacy fields from the best matching id(s).
     const legacy: Partial<Record<keyof Settings, number>> = {}
     for (const [id, n] of Object.entries(bestById)) {
       const lk = legacyPrKey(id)
       if (lk && n > (legacy[lk] ?? 0)) legacy[lk] = n
     }
     const updates: Partial<Settings> = {}
     let hasUpdates = false
     if (changed) { (updates as any).prs = bestById; hasUpdates = true }
     for (const [k, v] of Object.entries(legacy)) {
       const stored = (currentSettings as unknown as Record<string, number>)[k] || 0
       if ((v as number) > stored) { (updates as any)[k] = v; hasUpdates = true }
     }
     return hasUpdates ? updates : null
   }
   ```

4. Rewrite `checkAndUpdatePR` to update `prs[exerciseId]` for any id, mirror the
   legacy field when applicable, and return a `PREvent`:
   ```tsx
   const checkAndUpdatePR = useCallback(async (exerciseId: string, reps: string): Promise<PREvent | null> => {
     const n = parseRepsForPR(reps)
     if (n == null || !exerciseId) return null
     const cur = qc.getQueryData<ProgressData>(key)?.settings ?? settings
     const prevBest = (cur.prs?.[exerciseId]) ?? 0
     if (n <= prevBest) return null
     const lk = legacyPrKey(exerciseId)
     const patch: Partial<Settings> = { prs: { ...(cur.prs ?? {}), [exerciseId]: n } }
     if (lk && n > ((cur as unknown as Record<string, number>)[lk] || 0)) {
       (patch as any)[lk] = n
     }
     await updateSettings(patch)
     op.track('pr_achieved', { exercise_id: exerciseId, pr_key: String(lk ?? exerciseId), old_value: prevBest, new_value: n })
     return { exerciseId, prKey: String(lk ?? exerciseId), oldValue: prevBest, newValue: n }
   }, [updateSettings, qc, key, settings])
   ```

Notes the executor must preserve:
- Keep `updateSettings` semantics: it must **merge** the patch into existing
  settings (confirm `updateSettings` does a shallow merge; `prs` is replaced
  whole each time, which is correct because we spread the prior map).
- Keep the `op.track('pr_achieved', ...)` call — analytics expects it
  (`project_analytics`). The `pr_key` now falls back to the exercise id for
  non-legacy exercises; that is intended.
- Do NOT remove the legacy `pr_*` fields or `PR_PATTERNS`.

**Verify**:
1. `grep -n 'parseInt(' packages/core/hooks/useProgress.ts` → **no PR-related
   `parseInt` remains** in `computePRBackfill`/`checkAndUpdatePR` (other unrelated
   `parseInt` elsewhere in the file may legitimately stay — inspect each).
2. `grep -n 'parseRepsForPR' packages/core/hooks/useProgress.ts` → ≥2 lines.
3. `cd apps/web && npm run typecheck` → exit 0.
4. `cd apps/mobile && npm run typecheck` → exit 0 (core is shared).

### Step 5: Build + test gate

**Verify**:
1. Core test (discovered runner) → all pass, including new `pr-utils` tests.
2. `cd apps/web && npm run build` → exit 0.
3. `git diff --stat 943f558..HEAD -- pb_migrations apps/web/src/pages/LogWorkoutPage.tsx` → no output (untouched).

### Step 6: Manual smoke test (you set up, maintainer drives)

Local stack (`project_local_test_user`):
- [ ] Log a non-legacy exercise (e.g. dips) with a clear rep count, then again
  with more reps → second log produces a PR (observe the PR celebration / the
  `pr_achieved` analytics event, or inspect `settings.prs` in the PB user
  record / localStorage).
- [ ] Log a legacy exercise (push-ups) → both `settings.prs[id]` and
  `settings.pr_pushups` update (legacy mirror works).
- [ ] Log reps as `"8-12"` → PR uses `12`, not `8`. Log `"max"` → no crash, no PR.
- [ ] Reload the app → `computePRBackfill` repopulates `prs` from history without
  lowering any existing legacy PR.

### Step 7: Update the index

Set plan 009 status row to `DONE (...)`.

## Test plan

Automated coverage centers on the **pure `parseRepsForPR` helper** (Step 2) —
that is the regression-critical, environment-independent logic. The hook itself
is I/O-bound (PB writes, React Query cache) and has no render-test harness, so it
is covered by the manual smoke test in Step 6. Optionally, if `computePRBackfill`
is exported (or you export it), add a pure test feeding it synthetic `sets` and
asserting the returned `prs` map + legacy mirroring — this is high-value and
recommended if extraction is cheap. Do NOT attempt to render the hook.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `packages/core/lib/pr-utils.ts` exists and exports `parseRepsForPR`.
- [ ] New `pr-utils` test passes via the discovered core-test runner.
- [ ] `grep -n 'prs?:' packages/core/types/index.ts` → the `Settings.prs` field exists.
- [ ] `grep -n 'parseRepsForPR' packages/core/hooks/useProgress.ts` → ≥2 lines.
- [ ] `cd apps/web && npm run typecheck` exits 0; `cd apps/mobile && npm run typecheck` exits 0.
- [ ] `cd apps/web && npm run build` exits 0.
- [ ] `git diff --stat 943f558..HEAD -- pb_migrations` returns no output.
- [ ] `git status --porcelain` shows changes only under `packages/core/` and `advisor-plans/README-exercise-data.md`.
- [ ] Manual smoke test (Step 6) confirms PRs for a non-legacy exercise and correct `"8-12"`→12 parsing.
- [ ] `advisor-plans/README-exercise-data.md` plan 009 row updated.

## STOP conditions

Stop and report if:
- The drift check shows `useProgress.ts`/`types/index.ts` changed and the PR
  region no longer matches the excerpts.
- A `pr_*` field is written by code outside `useProgress.ts`, or `Settings` is a
  typed PB column (would need a migration — out of this plan's scope).
- `updateSettings` does NOT merge patches (it replaces the whole settings object)
  — then `prs` could clobber other fields; report so the merge is handled.
- A verification command fails twice after a reasonable fix.

## Maintenance notes

- **`prs` is now the source of truth for PRs.** A future "Personal Records"
  screen should read `settings.prs` (exerciseId → reps) and resolve display names
  via the catalog + `localize()`. The 5 legacy `pr_*` fields are kept only for
  the existing UI; consider deprecating them once all readers move to `prs`.
- **Id scheme still matters.** `prs` is keyed by whatever id `logSet` received, so
  kebab vs snake fragmentation (Plans 008/011) still splits a movement's PR
  across two keys until the catalog is unified. After Plan 011, a one-time
  `computePRBackfill` re-run over the reconciled `sets_log` will consolidate them.
- **Weighted PRs not modeled.** `prs` tracks best reps only; `weight_kg` exists in
  `sets_log` but is not part of PR math here. A weight-aware PR (e.g. 1RM-style or
  reps-at-weight) is a deliberate follow-up, out of scope.
