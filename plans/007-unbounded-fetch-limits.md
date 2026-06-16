# Plan 007: Replace hardcoded getList caps with getFullList in per-user collections

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useProgress.ts packages/core/hooks/useCardioStats.ts packages/core/hooks/useSleep.ts packages/core/hooks/useWeight.ts packages/core/hooks/useRestPreferences.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

Five hooks fetch user collections with hardcoded `getList(1, N, …)` caps. For a daily user, `sets_log` at 1000 entries covers under a year; `sessions` and `cardio_sessions` at 500 truncate even sooner. The truncation is silent — no error is thrown, the query resolves, and downstream derived stats (streaks, PRs, totals) silently compute on incomplete data. This corrupts dashboard numbers for the most engaged users without any visible signal. Switching to `getFullList` removes the cap and fetches all matching records in paginated batches automatically.

## Current state

### Files to modify

- `packages/core/hooks/useProgress.ts` — queryFn that fetches sessions (line 113) and sets_log (line 114)
- `packages/core/hooks/useCardioStats.ts` — `fetchCardioSessions` standalone function (line 57)
- `packages/core/hooks/useSleep.ts` — queryFn that fetches sleep_entries (line 119)
- `packages/core/hooks/useWeight.ts` — queryFn that fetches weight_entries (line 55)
- `packages/core/hooks/useRestPreferences.ts` — queryFn that fetches rest_preferences (line 50)

### Verified excerpts (confirm these match before changing anything)

**useProgress.ts:113-114**
```ts
pb.collection('sessions').getList(1, 500, { filter: sessionFilter, sort: '-completed_at', $autoCancel: false }),
pb.collection('sets_log').getList(1, 1000, { filter: pb.filter('user = {:uid}', { uid }), sort: '-logged_at', $autoCancel: false }),
```

**useCardioStats.ts:57**
```ts
const res = await pb.collection('cardio_sessions').getList(1, 500, {
  filter: pb.filter('user = {:userId}', { userId }),
  sort: '-started_at',
  fields: 'id,activity_type,distance_km,duration_seconds,avg_pace,elevation_gain,started_at,finished_at,note,calories_burned,max_pace,avg_speed_kmh,max_speed_kmh,splits',
})
```
Note: no `$autoCancel` flag here; do not add one.
The function continues with `res.items.map(...)` — after migration it will be `res.map(...)` (getFullList returns the array directly).

**useSleep.ts:119**
```ts
const res = await pb.collection('sleep_entries').getList(1, 500, {
  filter: pb.filter('user = {:uid}', { uid: userId! }),
  sort: '-date',
})
```
Continues with `res.items.map(...)`.

**useWeight.ts:55**
```ts
const res = await pb.collection('weight_entries').getList(1, 500, {
  filter: pb.filter('user = {:uid}', { uid: userId! }),
  sort: '-date',
})
```
Continues with `res.items.map(...)`.

**useRestPreferences.ts:50**
```ts
const res = await pb.collection('rest_preferences').getList(1, 500, {
  filter: pb.filter('user = {:uid}', { uid: userId }),
})
```
Continues with `res.items.forEach(...)`.

### PocketBase SDK version

`"pocketbase": "^0.26.8"` (packages/core/package.json). `getFullList` has been stable since v0.8. Do **not** check further — it is available.

### Signature of getFullList

```ts
// getList (remove):
pb.collection('x').getList(1, N, options)   // → ListResult<T> with .items array
// getFullList (replacement):
pb.collection('x').getFullList(options)      // → T[]  (array directly, no .items)
```

The options object shape is identical (filter, sort, fields, $autoCancel, etc.) — just drop the `1, N,` positional args.

### Consuming code pattern

Every call site follows the same pattern:
```ts
const res = await pb.collection('x').getList(1, N, opts)
// then uses: res.items.map(...) or res.items.forEach(...)
```
After the change:
```ts
const res = await pb.collection('x').getFullList(opts)
// then uses: res.map(...) or res.forEach(...)
```
i.e. remove `.items` from every subsequent access of the result.

## Commands you will need

| Purpose             | Command                                              | Expected on success         |
|---------------------|------------------------------------------------------|-----------------------------|
| Checkout branch     | `git checkout feat/mobile-data-perf`                 | On branch feat/mobile-data-perf |
| Web typecheck       | `cd apps/web && pnpm exec tsc --noEmit`              | exit 0, no errors           |
| Mobile typecheck    | `cd apps/mobile && pnpm exec tsc --noEmit`           | exit 0, no errors           |
| Build               | `pnpm build`                                         | exit 0                      |
| Verify grep (after) | `grep -n "getList(1, 500\|getList(1, 1000" packages/core/hooks/useProgress.ts packages/core/hooks/useCardioStats.ts packages/core/hooks/useSleep.ts packages/core/hooks/useWeight.ts packages/core/hooks/useRestPreferences.ts` | no output |

## Suggested executor toolkit

- Reference `.agents/skills/vercel-react-best-practices/rules/js-index-maps.md` for index-map patterns if any downstream derived-stat logic is touched (it should not be — derived logic is out of scope).

## Scope

**In scope** (the only files you should modify):
- `packages/core/hooks/useProgress.ts`
- `packages/core/hooks/useCardioStats.ts`
- `packages/core/hooks/useSleep.ts`
- `packages/core/hooks/useWeight.ts`
- `packages/core/hooks/useRestPreferences.ts`

**Out of scope** (do NOT touch, even though they look related):
- Any derived-stat or selector logic in these files — behavior must be preserved exactly.
- The `getList(1, 1, …)` calls in useProgress.ts (lines ~161, ~342, ~414) — those fetch a single record intentionally (existence checks), not user collections. Leave them unchanged.
- Any other hook or component file.
- Test files — no tests exist for these queryFns; writing them is deferred.

## Git workflow

- Branch: `advisor/007-unbounded-fetch-limits` (branch off `feat/mobile-data-perf`)
- Commit style: conventional commits, e.g. `fix(core): replace getList caps with getFullList in 5 hooks`
- One commit for all five files is fine; or one per file if easier to review.
- Do NOT push or open a PR.

## Steps

### Step 0: Verify branch and drift

```bash
git checkout feat/mobile-data-perf
git checkout -b advisor/007-unbounded-fetch-limits
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useProgress.ts packages/core/hooks/useCardioStats.ts packages/core/hooks/useSleep.ts packages/core/hooks/useWeight.ts packages/core/hooks/useRestPreferences.ts
```

**Verify**: diff output is empty (no changes since plan was written). If not empty, compare excerpts in "Current state" to live code before proceeding.

### Step 1: Fix useProgress.ts (sessions + sets_log)

In `packages/core/hooks/useProgress.ts`, replace the two `getList` calls at lines 113-114 with `getFullList`.

Before:
```ts
pb.collection('sessions').getList(1, 500, { filter: sessionFilter, sort: '-completed_at', $autoCancel: false }),
pb.collection('sets_log').getList(1, 1000, { filter: pb.filter('user = {:uid}', { uid }), sort: '-logged_at', $autoCancel: false }),
```

After:
```ts
pb.collection('sessions').getFullList({ filter: sessionFilter, sort: '-completed_at', $autoCancel: false }),
pb.collection('sets_log').getFullList({ filter: pb.filter('user = {:uid}', { uid }), sort: '-logged_at', $autoCancel: false }),
```

Then find every use of the results within the same function scope. The destructuring is:
```ts
const [sessionsRes, setsRes] = await Promise.all([…])
```
All accesses are `sessionsRes.items` and `setsRes.items` — change each to `sessionsRes` and `setsRes` (drop `.items`). Search for `sessionsRes.items` and `setsRes.items` within the file to find them all.

**Verify**: `grep -n "sessionsRes\.items\|setsRes\.items" packages/core/hooks/useProgress.ts` → no output.

### Step 2: Fix useCardioStats.ts

In `packages/core/hooks/useCardioStats.ts`, at the `fetchCardioSessions` function (around line 57):

Before:
```ts
const res = await pb.collection('cardio_sessions').getList(1, 500, {
  filter: pb.filter('user = {:userId}', { userId }),
  sort: '-started_at',
  fields: 'id,activity_type,…,splits',
})
return res.items.map((r: any) => ({
```

After:
```ts
const res = await pb.collection('cardio_sessions').getFullList({
  filter: pb.filter('user = {:userId}', { userId }),
  sort: '-started_at',
  fields: 'id,activity_type,…,splits',
})
return res.map((r: any) => ({
```

(Preserve the exact `fields` string — do not shorten or reorder it.)

**Verify**: `grep -n "getList(1, 500" packages/core/hooks/useCardioStats.ts` → no output.

### Step 3: Fix useSleep.ts

In `packages/core/hooks/useSleep.ts`, at line ~119:

Before:
```ts
const res = await pb.collection('sleep_entries').getList(1, 500, {
  filter: pb.filter('user = {:uid}', { uid: userId! }),
  sort: '-date',
})
const items: SleepEntry[] = res.items.map((r: any) => ({
```

After:
```ts
const res = await pb.collection('sleep_entries').getFullList({
  filter: pb.filter('user = {:uid}', { uid: userId! }),
  sort: '-date',
})
const items: SleepEntry[] = res.map((r: any) => ({
```

**Verify**: `grep -n "getList(1, 500" packages/core/hooks/useSleep.ts` → no output.

### Step 4: Fix useWeight.ts

In `packages/core/hooks/useWeight.ts`, at line ~55:

Before:
```ts
const res = await pb.collection('weight_entries').getList(1, 500, {
  filter: pb.filter('user = {:uid}', { uid: userId! }),
  sort: '-date',
})
const entries: WeightEntry[] = res.items.map((r: any) => ({
```

After:
```ts
const res = await pb.collection('weight_entries').getFullList({
  filter: pb.filter('user = {:uid}', { uid: userId! }),
  sort: '-date',
})
const entries: WeightEntry[] = res.map((r: any) => ({
```

**Verify**: `grep -n "getList(1, 500" packages/core/hooks/useWeight.ts` → no output.

### Step 5: Fix useRestPreferences.ts

In `packages/core/hooks/useRestPreferences.ts`, at line ~50:

Before:
```ts
const res = await pb.collection('rest_preferences').getList(1, 500, {
  filter: pb.filter('user = {:uid}', { uid: userId }),
})
const prefs: Record<string, number> = {}
const pbIds: Record<string, string> = {}
res.items.forEach((r: any) => {
```

After:
```ts
const res = await pb.collection('rest_preferences').getFullList({
  filter: pb.filter('user = {:uid}', { uid: userId }),
})
const prefs: Record<string, number> = {}
const pbIds: Record<string, string> = {}
res.forEach((r: any) => {
```

**Verify**: `grep -n "getList(1, 500" packages/core/hooks/useRestPreferences.ts` → no output.

### Step 6: Final grep + typecheck + build

```bash
grep -n "getList(1, 500\|getList(1, 1000" \
  packages/core/hooks/useProgress.ts \
  packages/core/hooks/useCardioStats.ts \
  packages/core/hooks/useSleep.ts \
  packages/core/hooks/useWeight.ts \
  packages/core/hooks/useRestPreferences.ts
```
**Verify**: no output.

```bash
cd apps/web && pnpm exec tsc --noEmit
```
**Verify**: exits 0, no errors.

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```
**Verify**: exits 0, no errors.

```bash
pnpm build
```
**Verify**: exits 0.

### Step 7: Commit

```bash
git add packages/core/hooks/useProgress.ts \
        packages/core/hooks/useCardioStats.ts \
        packages/core/hooks/useSleep.ts \
        packages/core/hooks/useWeight.ts \
        packages/core/hooks/useRestPreferences.ts
git commit -m "fix(core): replace getList caps with getFullList en 5 hooks de usuario"
```

## Test plan

No automated tests exist for these queryFns. Manual verification path:

1. Log in as a user with > 500 sessions or > 1000 sets_log entries (or seed the DB).
2. Open the dashboard and verify that streak/total-sessions counts match the actual DB record count.
3. Confirm no console errors or network waterfall showing extra pages fetched beyond what the filter needs.

Formal test coverage for these queryFns is deferred — see Maintenance notes.

## Done criteria

- [ ] `grep -n "getList(1, 500\|getList(1, 1000" packages/core/hooks/useProgress.ts packages/core/hooks/useCardioStats.ts packages/core/hooks/useSleep.ts packages/core/hooks/useWeight.ts packages/core/hooks/useRestPreferences.ts` returns no matches
- [ ] `cd apps/web && pnpm exec tsc --noEmit` exits 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm build` exits 0
- [ ] No files outside the in-scope list are modified (`git diff --name-only HEAD`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- Any `sessionsRes.items` or `setsRes.items` reference remains after step 1 and cannot be trivially traced to the `getList` call being replaced — the destructuring may have changed.
- `getFullList` causes a TypeScript error (unexpected — SDK 0.26.8 is well past the version that added it — but report rather than cast).
- A step's typecheck or build fails after two fix attempts.
- You discover `$autoCancel: false` is accepted by `getFullList` but causes a lint/type error — remove it and note the deviation.

## Maintenance notes

- **Payload growth**: `getFullList` fetches all records. For `sets_log`, a 5-year daily user may accumulate 5000+ entries. If response times become noticeable, the follow-up is a date-window filter (e.g. `logged_at >= <18 months ago>`) — intentionally deferred here because correctness takes priority over payload size, and most users are under 2000 entries today.
- **Pagination**: `getFullList` handles PocketBase's internal 500-record page limit automatically — no manual pagination needed.
- **Cache invalidation**: TanStack Query keys for these hooks are unchanged; no cache logic needs updating.
- **Next audit**: If a `sessions` or `sets_log` collection surpasses 10k records per user in production telemetry, revisit with a date-windowed `getList` + background aggregation approach.
