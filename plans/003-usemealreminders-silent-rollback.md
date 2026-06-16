# Plan 003: Fix useMealReminders silent-catch preventing onError rollback

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useMealReminders.ts`
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

`toggleMutation` and `deleteMutation` in `useMealReminders.ts` each wrap the
PocketBase network call in an inner `try { … } catch { /* fallo silencioso */ }`.
Because the catch swallows the error without rethrowing, the `mutationFn`
resolves successfully even when PocketBase fails. React Query only fires
`onError` when `mutationFn` rejects — so the existing `onError` rollback
handlers (which restore cache and localStorage to the pre-mutation snapshot)
never run. The result is a silent permanent divergence: the local state shows
the toggle/delete as successful, but the server never applied it. On the next
sync from PocketBase, the locally-deleted reminder reappears, confusing the
user. The sibling `updateMutation` in the same file handles this correctly by
letting errors propagate. This plan makes `toggleMutation` and
`deleteMutation` consistent with that pattern.

## Current state

**File**: `packages/core/hooks/useMealReminders.ts`

`lsSet` (lines 15–16) already has its own try/catch and is safe. Do not change it:

```ts
// useMealReminders.ts:15-16
const lsSet = (d: MealReminder[]) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}
```

`toggleMutation.mutationFn` (approximately lines 194–202, absolute line
numbers may shift ±2 due to earlier edits):

```ts
// useMealReminders.ts — toggleMutation.mutationFn
mutationFn: async (payload: { id: string; enabled: boolean }) => {
  // Guard `mr_`: solo sincronizar con PB si el id es real
  if (usePB && !payload.id.startsWith('mr_')) {
    try {
      await pb.collection('meal_reminders').update(payload.id, { enabled: payload.enabled })
    } catch { /* fallo silencioso — el estado local ya se actualizó */ }
  }
},
```

`deleteMutation.mutationFn` (approximately lines 222–230):

```ts
// useMealReminders.ts — deleteMutation.mutationFn
mutationFn: async (id: string) => {
  // Guard `mr_`: solo borrar en PB si el id es real
  if (usePB && !id.startsWith('mr_')) {
    try {
      await pb.collection('meal_reminders').delete(id)
    } catch { /* fallo silencioso — LS ya lo eliminó */ }
  }
},
```

The `mr_` guard (`if (usePB && !payload.id.startsWith('mr_'))`) in both
mutations MUST be kept — it prevents attempting PB operations on locally-
generated temporary IDs. Only the inner try/catch is removed.

`onMutate` and `onError` handlers for both mutations already exist and work
correctly — do not modify them. The `updateMutation` (lines ~162–190) is the
correct reference: its `mutationFn` does not wrap the PB call in try/catch,
which is why errors propagate to `onError` there.

## Commands you will need

| Purpose              | Command                                                                           | Expected on success |
|----------------------|-----------------------------------------------------------------------------------|---------------------|
| Web typecheck        | `cd apps/web && pnpm exec tsc --noEmit`                                          | exit 0, no errors   |
| Mobile typecheck     | `cd apps/mobile && pnpm exec tsc --noEmit`                                       | exit 0, no errors   |
| Root build           | `pnpm build` (from repo root)                                                     | exit 0              |
| Verify fix (grep)    | `grep -n "fallo silencioso" packages/core/hooks/useMealReminders.ts`             | 0 matches           |

## Scope

**In scope** (the only file you should modify):
- `packages/core/hooks/useMealReminders.ts`

**Out of scope** (do NOT touch):
- `saveMutation` — its `mutationFn` intentionally catches + logs (`console.warn`) because an offline save is expected to fail and the local `mr_` entry is kept on purpose; that is not a bug.
- `updateMutation` — already correct, do not change.
- `lsSet` helper (lines 15–16) — already has a safe try/catch, do not change.
- The `mr_` guard in either mutation — must stay.
- Any `onMutate` or `onError` handler — already correct, do not change.
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
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useMealReminders.ts
```

If there is any output, compare the `fallo silencioso` lines against the
excerpts in "Current state". If they differ, STOP and report.

Confirm the two offending sites exist:

```bash
grep -n "fallo silencioso" packages/core/hooks/useMealReminders.ts
```

Expected: exactly 2 matches. If the count differs, STOP and report.

### Step 3: Remove inner try/catch from toggleMutation.mutationFn

In `packages/core/hooks/useMealReminders.ts`, locate `toggleMutation.mutationFn`.

**Before**:

```ts
mutationFn: async (payload: { id: string; enabled: boolean }) => {
  // Guard `mr_`: solo sincronizar con PB si el id es real
  if (usePB && !payload.id.startsWith('mr_')) {
    try {
      await pb.collection('meal_reminders').update(payload.id, { enabled: payload.enabled })
    } catch { /* fallo silencioso — el estado local ya se actualizó */ }
  }
},
```

**After** (remove the try/catch wrapper, keep the `mr_` guard):

```ts
mutationFn: async (payload: { id: string; enabled: boolean }) => {
  // Guard `mr_`: solo sincronizar con PB si el id es real
  if (usePB && !payload.id.startsWith('mr_')) {
    await pb.collection('meal_reminders').update(payload.id, { enabled: payload.enabled })
  }
},
```

**Verify**: `grep -n "fallo silencioso" packages/core/hooks/useMealReminders.ts` → 1 match (only the delete one remains at this point)

### Step 4: Remove inner try/catch from deleteMutation.mutationFn

In the same file, locate `deleteMutation.mutationFn`.

**Before**:

```ts
mutationFn: async (id: string) => {
  // Guard `mr_`: solo borrar en PB si el id es real
  if (usePB && !id.startsWith('mr_')) {
    try {
      await pb.collection('meal_reminders').delete(id)
    } catch { /* fallo silencioso — LS ya lo eliminó */ }
  }
},
```

**After** (remove the try/catch wrapper, keep the `mr_` guard):

```ts
mutationFn: async (id: string) => {
  // Guard `mr_`: solo borrar en PB si el id es real
  if (usePB && !id.startsWith('mr_')) {
    await pb.collection('meal_reminders').delete(id)
  }
},
```

**Verify**: `grep -n "fallo silencioso" packages/core/hooks/useMealReminders.ts` → 0 matches

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
git add packages/core/hooks/useMealReminders.ts
git commit -m "$(cat <<'EOF'
fix(core): elimina try/catch silencioso en toggleMutation/deleteMutation

El catch interno hacía que mutationFn resolviera con éxito aunque PB fallara,
impidiendo que onError ejecutara el rollback optimista. Ahora los errores de
PB propagan a React Query para activar el rollback existente en onError.
EOF
)"
```

## Test plan

No automated tests exist for hooks in this repo. Manual verification scenario:

1. Log in and create a meal reminder.
2. Simulate a PocketBase failure (e.g. stop the PB server or block the
   endpoint, or temporarily rename the collection in PB admin) so that
   toggle/delete calls fail.
3. Toggle the reminder's enabled state — after the failure the UI should
   revert to the previous state (the `onError` rollback fires).
4. Attempt to delete the reminder — after the failure the reminder should
   reappear in the list (rollback fires).
5. Re-enable PB and verify toggle/delete work normally again.

If vitest is set up under `packages/core`, a unit test can be added to
`packages/core/hooks/__tests__/useMealReminders.test.ts` mocking PB to
reject, and asserting that the cache/LS state is restored to the pre-mutation
snapshot after the failed toggle or delete. Use any existing test in that
directory as the structural pattern.

## Done criteria

- [ ] `grep -n "fallo silencioso" packages/core/hooks/useMealReminders.ts` returns 0 matches
- [ ] `cd apps/web && pnpm exec tsc --noEmit` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `git diff --name-only HEAD~1 HEAD` shows only `packages/core/hooks/useMealReminders.ts`
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The `fallo silencioso` grep in Step 2 returns a count other than 2.
- The code at the `toggleMutation`/`deleteMutation` locations does not match
  the excerpts in "Current state" (codebase drifted).
- Removing the try/catch requires touching the `mr_` guard or any `onMutate`
  / `onError` handler.
- Any typecheck step fails after applying the change.
- You find that `saveMutation` also has a `fallo silencioso` comment and
  are unsure whether to remove it — STOP, do not touch it (see Out of scope).

## Maintenance notes

- The `saveMutation` intentionally swallows errors from PB because when the
  user is offline the local `mr_` ID is kept as the durable state; future
  contributors should preserve that asymmetry.
- If a new mutation is added to this hook, follow the `updateMutation` pattern:
  do not wrap the PB call in an inner try/catch. Let errors propagate to the
  React Query `onError` handler.
- No follow-ups deferred from this plan.
