# Plan 002: Fix useWater localStorage writes targeting activeDate instead of today

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useWater.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

`useWater` supports viewing historical dates via `selectedDate`. The query
cache is correctly keyed on `activeDate` (= `selectedDate ?? today`), but
every optimistic localStorage write/read and onError rollback uses the
literal `today` variable instead. When a user edits water for a past date,
the optimistic write and rollback land in today's LS slot, silently
corrupting today's offline data while leaving the historical date's LS slot
stale. On the next app load the historical edit appears to have been lost
(LS has old data) and today's LS slot shows phantom entries from the edit.

## Current state

**File**: `packages/core/hooks/useWater.ts`

`today` and `activeDate` are defined at lines 68–69:

```ts
// useWater.ts:68-69
const today = todayStr()
const activeDate = selectedDate || today
```

`activeDate` is correctly used for the query key (line 71) and for the
`queryFn` write-through (line 101). However, every optimistic LS operation
in `addMutation` and `removeMutation` uses `today` instead of `activeDate`:

```ts
// useWater.ts:144 — addMutation onMutate
const prev = qc.getQueryData<DayWater>(dayKey) ?? lsGetDay(today)
// useWater.ts:152
lsSetDay(today, next)
// useWater.ts:159 — addMutation onError
lsSetDay(today, ctx.prev)
// useWater.ts:171 — addMutation onSuccess (inside setQueryData updater)
lsSetDay(today, updated)
// useWater.ts:186 — removeMutation onMutate
const prev = qc.getQueryData<DayWater>(dayKey) ?? lsGetDay(today)
// useWater.ts:192
lsSetDay(today, next)
// useWater.ts:199 — removeMutation onError  (approx; may be +1 line)
lsSetDay(today, ctx.prev)
```

`lsSetDay` signature (line 53): `const lsSetDay = (date: string, day: DayWater)`
— it accepts any date string, so the fix is purely a variable substitution.

The `goalMutation` is intentionally excluded: the water goal is not
date-scoped and uses a separate query key (`qk.water.goal`). Do not change
anything inside `goalMutation`.

## Commands you will need

| Purpose              | Command                                                        | Expected on success    |
|----------------------|----------------------------------------------------------------|------------------------|
| Web typecheck        | `cd apps/web && pnpm exec tsc --noEmit`                       | exit 0, no errors      |
| Mobile typecheck     | `cd apps/mobile && pnpm exec tsc --noEmit`                    | exit 0, no errors      |
| Root build           | `pnpm build` (from repo root)                                  | exit 0                 |
| Verify fix (grep)    | `grep -n "lsGetDay(today)\|lsSetDay(today" packages/core/hooks/useWater.ts` | 0 matches |

## Scope

**In scope** (the only file you should modify):
- `packages/core/hooks/useWater.ts`

**Out of scope** (do NOT touch):
- `goalMutation` block within the same file — goal is not date-scoped.
- `today`/`activeDate` variable definitions (lines 68–69) — do not change them.
- `lsSetDay`/`lsGetDay` helper definitions — signature is already correct.
- Any other hook file.

## Git workflow

- Branch: `feat/mobile-data-perf` — **checkout this branch first** (`git checkout feat/mobile-data-perf`). Do NOT push, merge, rebase, or open a PR.
- Conventional commits style (match repo log, e.g. `fix(core): ...`).
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
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useWater.ts
```

If there is any output, read the diff and compare the `lsGetDay(today)` /
`lsSetDay(today` lines against the excerpts in "Current state". If they
differ, STOP and report.

Also confirm the seven offending calls exist:

```bash
grep -n "lsGetDay(today)\|lsSetDay(today" packages/core/hooks/useWater.ts
```

Expected: 7 matches (lines ~144, ~152, ~159, ~171, ~186, ~192, ~199). If
the count differs, STOP and report.

### Step 3: Replace `today` with `activeDate` in addMutation and removeMutation

Open `packages/core/hooks/useWater.ts`. Inside `addMutation` (onMutate,
onError, onSuccess) and `removeMutation` (onMutate, onError), replace every
occurrence of:

- `lsGetDay(today)` → `lsGetDay(activeDate)`
- `lsSetDay(today,` → `lsSetDay(activeDate,`

There are 7 occurrences total. Do not change any call inside `goalMutation`.
Do not change the definitions of `today` or `activeDate`.

The corrected pattern for `addMutation.onMutate` (line ~144):

```ts
const prev = qc.getQueryData<DayWater>(dayKey) ?? lsGetDay(activeDate)
// ...
lsSetDay(activeDate, next)
```

The corrected pattern for `addMutation.onError` (line ~159):

```ts
lsSetDay(activeDate, ctx.prev)
```

The corrected pattern inside `addMutation.onSuccess` → `setQueryData` updater (line ~171):

```ts
lsSetDay(activeDate, updated)
```

The corrected pattern for `removeMutation.onMutate` (line ~186):

```ts
const prev = qc.getQueryData<DayWater>(dayKey) ?? lsGetDay(activeDate)
// ...
lsSetDay(activeDate, next)
```

The corrected pattern for `removeMutation.onError` (line ~199):

```ts
lsSetDay(activeDate, ctx.prev)
```

**Verify**: `grep -n "lsGetDay(today)\|lsSetDay(today" packages/core/hooks/useWater.ts` → 0 matches

Also confirm `activeDate` usages increased:

```bash
grep -n "lsGetDay(activeDate)\|lsSetDay(activeDate" packages/core/hooks/useWater.ts
```

Expected: 7 matches.

### Step 4: Run typechecks

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

### Step 5: Commit

```bash
git add packages/core/hooks/useWater.ts
git commit -m "$(cat <<'EOF'
fix(core): useWater usa activeDate en writes de localStorage (no today)

Las mutaciones optimistas (addMutation/removeMutation) escribían en el slot
de hoy incluso cuando se operaba sobre una fecha histórica (selectedDate).
Reemplaza today por activeDate en lsGetDay/lsSetDay dentro de onMutate,
onError y onSuccess de ambas mutaciones.
EOF
)"
```

## Test plan

No automated tests exist for hooks in this repo. Manual verification scenario:

1. Log in and navigate to a historical water date (e.g. yesterday).
2. Add a water entry for that date.
3. Reload the app while offline (or clear network) and navigate back to
   yesterday — the entry should still appear.
4. Navigate to today — no phantom entry should appear.
5. Remove the entry from yesterday and verify the same: yesterday shows no
   entry, today is unaffected.

If vitest is set up under `packages/core`, a unit test can be added to
`packages/core/hooks/__tests__/useWater.test.ts` mocking `storage` and
asserting that `storage.setItem` is called with the historical date key when
`selectedDate` is set. Use any existing test in that directory as the
structural pattern.

## Done criteria

- [ ] `grep -n "lsGetDay(today)\|lsSetDay(today" packages/core/hooks/useWater.ts` returns 0 matches
- [ ] `grep -n "lsGetDay(activeDate)\|lsSetDay(activeDate" packages/core/hooks/useWater.ts` returns 7 matches
- [ ] `cd apps/web && pnpm exec tsc --noEmit` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `git diff --name-only HEAD~1 HEAD` shows only `packages/core/hooks/useWater.ts`
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The `lsGetDay(today)` / `lsSetDay(today` lines in the file do not match
  the excerpts in "Current state" (codebase drifted).
- The grep in Step 2 returns a count other than 7.
- Any typecheck step fails after applying the change.
- The fix appears to require touching `goalMutation` or any other file.
- You discover that `activeDate` is not in scope at one of the call sites.

## Maintenance notes

- If a new mutation is added to `useWater` in the future that does LS
  writes, the same `activeDate` rule applies — never use `today` for day-
  scoped LS writes.
- `goalMutation` correctly omits a date key because the goal is global
  per user; keep it that way.
- No follow-ups deferred from this plan.
