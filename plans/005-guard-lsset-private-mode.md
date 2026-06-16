# Plan 005: Wrap lsSet in try/catch in useWeight, useWorkoutReminders, and useSleep

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useWeight.ts packages/core/hooks/useWorkoutReminders.ts packages/core/hooks/useSleep.ts`
> If any file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

On Safari in private browsing mode (and on any browser when storage quota is
exceeded), `localStorage.setItem` throws a synchronous exception. Both
`useWeight.ts`, `useWorkoutReminders.ts`, and `useSleep.ts` define an `lsSet`
helper that calls `storage.setItem` without a try/catch. `lsSet` is invoked inside
`onMutate` callbacks; if it throws, the `onMutate` function never reaches its
`return { prev }` statement, so React Query receives `ctx = undefined` in the
subsequent `onError` handler. The `onError` rollback guard (`if (ctx?.prev)`)
then skips the rollback, leaving the optimistic cache update permanently in
place with no way to undo it. The result is that on Safari private mode a
failed network mutation leaves the UI in an incorrect state indefinitely. The
fix is to wrap `lsSet` in a silent try/catch (matching the pattern already
used in `useMealReminders.ts`).

## Current state

**File 1**: `packages/core/hooks/useWeight.ts`

`lsSet` is defined at lines 22–24, without try/catch:

```ts
// useWeight.ts:22-24
const lsSet = (d: WeightEntry[]): void => {
  storage.setItem(LS_KEY, JSON.stringify(d))
}
```

**File 2**: `packages/core/hooks/useWorkoutReminders.ts`

`lsSet` is defined at line 36, without try/catch (single-line arrow):

```ts
// useWorkoutReminders.ts:36
const lsSet = (d: WorkoutReminder[]) => storage.setItem(LS_KEY, JSON.stringify(d))
```

**File 3**: `packages/core/hooks/useSleep.ts`

`lsSet` is defined at line 15, without try/catch (single-line arrow):

```ts
// useSleep.ts:15
const lsSet = (d: SleepEntry[]) => storage.setItem(LS_KEY, JSON.stringify(d))
```

**Reference pattern** — `useMealReminders.ts` lines 15–16 (the correct idiom):

```ts
// useMealReminders.ts:15-16
const lsSet = (d: MealReminder[]) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}
```

Match this exact pattern: a single `try { setItem } catch { /* storage lleno */ }`,
no logging, no rethrow. The Spanish comment `/* storage lleno */` matches
surrounding code conventions for this repo.

## Commands you will need

| Purpose              | Command                                                                                        | Expected on success |
|----------------------|------------------------------------------------------------------------------------------------|---------------------|
| Web typecheck        | `cd apps/web && pnpm exec tsc --noEmit`                                                       | exit 0, no errors   |
| Mobile typecheck     | `cd apps/mobile && pnpm exec tsc --noEmit`                                                    | exit 0, no errors   |
| Root build           | `pnpm build` (from repo root)                                                                  | exit 0              |
| Verify fix (grep)    | `grep -n "storage.setItem" packages/core/hooks/useWeight.ts packages/core/hooks/useWorkoutReminders.ts packages/core/hooks/useSleep.ts` | all inside try blocks |

## Scope

**In scope** (the only three files you should modify):
- `packages/core/hooks/useWeight.ts` — only the `lsSet` definition (lines 22–24)
- `packages/core/hooks/useWorkoutReminders.ts` — only the `lsSet` definition (line 36)
- `packages/core/hooks/useSleep.ts` — only the `lsSet` definition (line 15)

**Out of scope** (do NOT touch):
- `lsGet` in any file — `storage.getItem` already has try/catch in all three.
- Any `onMutate`, `onError`, or `onSuccess` handler — the rollback logic is correct once `lsSet` no longer throws.
- `useMealReminders.ts` — already correct, do not change.
- Any other file.

## Git workflow

- Branch: `feat/mobile-data-perf` — **checkout this branch first** (`git checkout feat/mobile-data-perf`). Do NOT push, merge, rebase, or open a PR.
- Conventional commits style (e.g. `fix(core): ...`).
- Use explicit file paths in `git add` — never `git add -A` or `git add .`.

## Steps

### Step 1: Checkout the target branch

```bash
git checkout feat/mobile-data-perf
```

**Verify**: `git branch --show-current` → `feat/mobile-data-perf`

### Step 2: Confirm current state matches plan

Run the drift check:

```bash
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useWeight.ts packages/core/hooks/useWorkoutReminders.ts
```

If there is any output, compare the `lsSet` definitions against the excerpts
in "Current state". If they differ, STOP and report.

Confirm both `lsSet` definitions lack try/catch:

```bash
grep -n -A2 "^const lsSet" packages/core/hooks/useWeight.ts packages/core/hooks/useWorkoutReminders.ts
```

Expected: `useWeight.ts` shows a multi-line definition without `try`; `useWorkoutReminders.ts` shows a single-line definition without `try`. If either already has try/catch, STOP and report (drift).

### Step 3: Fix lsSet in useWeight.ts

Open `packages/core/hooks/useWeight.ts` and replace the `lsSet` definition at lines 22–24.

**Before**:

```ts
const lsSet = (d: WeightEntry[]): void => {
  storage.setItem(LS_KEY, JSON.stringify(d))
}
```

**After** (match the `useMealReminders` idiom; keep the explicit `: void` return type):

```ts
const lsSet = (d: WeightEntry[]): void => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}
```

**Verify**: `grep -n "try" packages/core/hooks/useWeight.ts` → at least 1 match inside `lsSet`

### Step 4: Fix lsSet in useWorkoutReminders.ts

Open `packages/core/hooks/useWorkoutReminders.ts` and replace the single-line
`lsSet` definition at line 36.

**Before**:

```ts
const lsSet = (d: WorkoutReminder[]) => storage.setItem(LS_KEY, JSON.stringify(d))
```

**After** (expand to block body to accommodate try/catch):

```ts
const lsSet = (d: WorkoutReminder[]) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}
```

**Verify**: `grep -n "try" packages/core/hooks/useWorkoutReminders.ts` → at least 1 match inside `lsSet`

### Step 4b: Fix lsSet in useSleep.ts

Open `packages/core/hooks/useSleep.ts` and replace the single-line `lsSet`
definition at line 15.

**Before**:

```ts
const lsSet = (d: SleepEntry[]) => storage.setItem(LS_KEY, JSON.stringify(d))
```

**After** (expand to block body):

```ts
const lsSet = (d: SleepEntry[]) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}
```

**Verify**: `grep -n "try" packages/core/hooks/useSleep.ts` → at least 1 match inside `lsSet`

### Step 5: Run typechecks

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

### Step 6: Commit

```bash
git add packages/core/hooks/useWeight.ts packages/core/hooks/useWorkoutReminders.ts packages/core/hooks/useSleep.ts
git commit -m "$(cat <<'EOF'
fix(core): envuelve lsSet en try/catch en useWeight, useWorkoutReminders y useSleep

En Safari modo privado (y con cuota de storage agotada) storage.setItem
lanza de forma síncrona dentro de onMutate antes de retornar ctx. Esto deja
ctx=undefined en onError e impide el rollback optimista. Ahora lsSet ignora
silenciosamente el error, consistente con el patrón en useMealReminders.
EOF
)"
```

## Test plan

No automated tests exist for hooks in this repo. Manual verification scenario:

1. In Safari private mode (which blocks localStorage writes), open the app.
2. Log in and attempt to log a weight entry — the entry should appear
   optimistically and then revert cleanly when PB also fails (or succeeds
   and onSuccess patches the id).
3. Attempt to toggle or delete a workout reminder — same: should revert on
   failure rather than leaving the UI in an inconsistent state.

If vitest is set up under `packages/core`, unit tests can be added to
`packages/core/hooks/__tests__/useWeight.test.ts` and
`packages/core/hooks/__tests__/useWorkoutReminders.test.ts` mocking
`storage.setItem` to throw and asserting that `onMutate` still returns the
rollback context and that `onError` successfully reverts the cache.

## Done criteria

- [ ] `grep -n "storage.setItem" packages/core/hooks/useWeight.ts` shows the call inside a `try` block
- [ ] `grep -n "storage.setItem" packages/core/hooks/useWorkoutReminders.ts` shows the call inside a `try` block
- [ ] `grep -n "storage.setItem" packages/core/hooks/useSleep.ts` shows the call inside a `try` block
- [ ] `cd apps/web && pnpm exec tsc --noEmit` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `git diff --name-only HEAD~1 HEAD` shows only `useWeight.ts`, `useWorkoutReminders.ts`, and `useSleep.ts`
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Either `lsSet` definition already contains try/catch (drift — don't double-wrap).
- The drift check shows that `lsSet` was moved, renamed, or inlined in either file.
- Any typecheck step fails after applying the change.
- You discover that `lsGet` also lacks try/catch in one of the files (it
  shouldn't — check before proceeding, and STOP if so; don't fix it here).
- The fix appears to require changing any handler other than the `lsSet`
  helper definitions.

## Maintenance notes

- When adding a new hook with LS persistence, always use the `useMealReminders` try/catch pattern for `lsSet` from the start.
- No other follow-ups deferred from this plan.
