# Plan 010: Catalog data-integrity pass + a validation test that guards every future catalog build

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's status row in `advisor-plans/README-exercise-data.md`.
>
> **Drift check (run first)**: from the repo root, run:
> `git diff --stat 943f558..HEAD -- packages/core/data/exercise-catalog.json scripts/build-exercise-catalog.mjs`
> If the catalog JSON changed since this plan was written, re-run the discovery
> greps in Step 1 and treat any divergence from the expected defects as new
> information (the specific ids may differ; the *method* still applies).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (data fixes + a new test; no app logic changes)
- **Depends on**: none
- **Blocks**: 011 (the validator added here is the gate 011's regenerated catalog must pass)
- **Category**: data-quality / test
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

The bundled catalog the app reads (`packages/core/data/exercise-catalog.json`,
171 entries) ships with concrete defects that silently corrupt score identity and
display:

- **Duplicate id `cat_cow`** (appears twice) — two different physical exercises
  collapse onto one `exercise_id` bucket (an unintended **merge** of scores).
- **One movement under two ids**: the display name `Thoracic Rotation` maps to
  both `thoracic_rot` and `thoracic_rotation` — an unintended **split** shipping
  in static data.
- **Mislabeled record**: id `sit_ups` has name `Biceps Curl With Cable`
  (`source: "wger"`) — a wger import error; the exercise the user thinks they are
  logging is not what the catalog describes.

These are symptoms of having **no validation** on the generated catalog. The
durable fix is a **validation test** that fails the build on structural defects,
plus a one-time cleanup of the current data. The test is the real deliverable: it
also becomes the acceptance gate for Plan 011's regenerated catalog.

> **Interaction with Plan 011**: 011 rebuilds the catalog content from the seeds,
> which will naturally eliminate these generated-data defects. The manual JSON
> edits in this plan are therefore a **stopgap** that delivers value before 011
> lands (and 011 may be deferred). The **validator is permanent** and must pass
> both before and after 011. If 011 is being executed immediately after 010, you
> may skip the manual JSON edits (Step 3) and rely on 011 to produce clean data —
> but still land the validator (Step 2). State which path you took.

## Current state

Files involved:

- `packages/core/data/exercise-catalog.json` — **the bundled catalog** (read by
  web, mobile, MCP). Header: `"generated_at": "2026-03-27..."`, `"total_count": 171`.
  Shape: `{ generated_at, total_count, ..., categories: { <cat>: { exercises: [ {id, name:{es,en}, muscles:{es,en}, difficulty, equipment:[], category, source, ...} ] } } }`.
- `mcp-server/data/exercise-catalog.json` and `mcp-server/src/data/exercise-catalog.json`
  — **byte-identical copies** of the above (same size, same `generated_at`),
  manually synced. Any data fix must be applied to **all three** (or regenerated
  + recopied).
- `scripts/build-exercise-catalog.mjs` — the generator (reads `workouts.ts` +
  `supplementary-exercises.ts` + wger; dedupes by normalized name "exact match
  only"). The duplicate/mislabel defects originate here; **read-only reference in
  this plan** (Plan 011 reworks it).
- `seeds/exercises/*.json` + `seeds/exercises/_schema.json` — the clean 263-entry
  seed set with a JSON Schema. The validator should also lint these.
- `packages/core/types/index.ts` — `Exercise`/`DifficultyLevel` types and the
  valid difficulty enum (`beginner | intermediate | advanced`).

The exact id strings above were found by the audit but **must be re-confirmed by
grep at execution time** (Step 1) — do not trust line numbers; trust the greps.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` (repo root) | exit 0 |
| Find duplicate `cat_cow` | `grep -n '"id": "cat_cow"' packages/core/data/exercise-catalog.json` | expected **2** lines (the defect) |
| Find thoracic split | `grep -n '"id": "thoracic_rot"' -e '"id": "thoracic_rotation"' packages/core/data/exercise-catalog.json` | two distinct ids |
| Find mislabel | `grep -n '"id": "sit_ups"' packages/core/data/exercise-catalog.json` then inspect its `name` | name is wrongly `Biceps Curl With Cable` |
| Confirm 3 copies identical | `md5 packages/core/data/exercise-catalog.json mcp-server/data/exercise-catalog.json mcp-server/src/data/exercise-catalog.json` | three identical hashes |
| Run the new validator | `node scripts/validate-exercise-catalog.mjs` (created in Step 2) | exits non-zero before fixes, 0 after |
| Core tests | discovered runner (see plan 009 caveat) | pass |

## Scope

**In scope** (create/modify only):
- `scripts/validate-exercise-catalog.mjs` (create — the validator)
- A test that invokes the validator (create — location per the repo's discovered
  test runner; or wire the validator into the existing test command)
- `packages/core/data/exercise-catalog.json` (modify — Step 3 stopgap fixes, if
  taken)
- `mcp-server/data/exercise-catalog.json`, `mcp-server/src/data/exercise-catalog.json`
  (modify — keep the 3 copies in sync if Step 3 taken)
- `advisor-plans/README-exercise-data.md` (status row)

**Out of scope**:
- `scripts/build-exercise-catalog.mjs` logic — Plan 011 owns the generator rework.
- Any app/runtime code, hooks, or `pb_migrations/**`.
- Renaming ids that would change existing `sets_log` identity beyond the three
  named defects (broader reconciliation is Plan 011).

## Git workflow

- Branch: `advisor/010-catalog-data-integrity` (from `main`).
- Explicit paths in `git add`. NEVER `git add -A`.
- Commit style: `fix(data): dedupe + correct exercise catalog defects, add catalog validator`
- No push/PR/merge/rebase without the operator's say-so.

## Steps

### Step 1: Reproduce and confirm the defects

Run the discovery greps in the Commands table. Confirm:
1. `cat_cow` appears as an `"id"` **twice** (two exercise objects). Capture both
   full objects (names/categories) so you can decide which to keep/rename.
2. `thoracic_rot` and `thoracic_rotation` both exist with the same/equivalent
   display name.
3. `sit_ups` exists with a name unrelated to sit-ups (`Biceps Curl With Cable`).

**STOP** if none of these reproduce (the catalog may already be regenerated/fixed)
— report the live state; the validator (Step 2) is still worth landing.

### Step 2: Write the catalog validator (the durable deliverable)

Create `scripts/validate-exercise-catalog.mjs` that loads the catalog (flatten
`categories[*].exercises`) and **exits non-zero** with a clear report on any of:

- **Duplicate id** (hard error) — the same `id` on two exercises.
- **Missing/empty name** for `es` or `en` (hard error).
- **Invalid `difficulty`** — not one of `beginner|intermediate|advanced` (hard
  error). *(Tolerate the field being named `difficulty` in the bundled JSON vs
  `difficulty_level` in seeds — accept both keys.)*
- **Missing `equipment`** array (hard error; empty `[]` is valid = bodyweight).
- **Duplicate display name** within a locale (warning + count) — surfaces the
  thoracic-style split for human review without hard-failing (legit edge cases
  may exist).
- **Missing `description`** (warning + coverage count, e.g. "149/171 missing") —
  not a hard error yet (Plan 011 raises coverage); the count makes regressions
  visible.

Have it accept a path argument so it can lint **both** the bundled catalog and
each `seeds/exercises/*.json` (the seed shape uses `slug`/`difficulty_level`;
handle both shapes or run in two modes). Print a summary like
`OK: 171 exercises, 0 errors, 2 warnings` and use a non-zero exit only on hard
errors.

Wire it into the test suite (either a `*.test.ts` that imports/asserts the
validator returns no hard errors, or a `package.json` script the CI/test step
runs). Follow the repo's discovered test convention (plan 009 caveat).

**Verify**:
1. `node scripts/validate-exercise-catalog.mjs packages/core/data/exercise-catalog.json`
   → **exits non-zero**, reporting the duplicate `cat_cow` (this proves the
   validator catches the real defect before you fix it).
2. Running it against `seeds/exercises/*.json` → reports 0 hard errors (the seeds
   are clean), confirming the validator handles both shapes.

### Step 3: Apply the stopgap data fixes (skip only if 011 runs immediately after)

For each confirmed defect, in **all three** catalog copies (keep them identical):

1. **`cat_cow` duplicate** — keep the correct "Cat-Cow" mobility entry; for the
   second one, either remove it (if a true duplicate) or, if it is a *different*
   exercise mis-assigned the `cat_cow` id, give it a correct unique id derived
   from its real name. Decide from the two objects captured in Step 1; document
   your choice in the commit.
2. **`thoracic_rot` / `thoracic_rotation`** — if both are the same movement,
   merge to ONE id. **Prefer keeping whichever id already appears in users'
   `sets_log`** (so you do not orphan history). If you cannot check live data,
   keep `thoracic_rotation` (the more descriptive id) and note that a `sets_log`
   reconciliation for the dropped id is deferred to Plan 011.
3. **`sit_ups` mislabel** — correct the `name` (es/en) and `muscles` to match an
   actual sit-up, or, if this row is a wger-imported "Biceps Curl" that does not
   belong, change its `id` to match its real content. Document the decision.

Re-sync the three copies (`md5` must match) after editing.

**Verify**:
1. `node scripts/validate-exercise-catalog.mjs packages/core/data/exercise-catalog.json`
   → **exits 0** (hard errors resolved; duplicate-name warnings may remain and
   are acceptable if reviewed).
2. `md5 packages/core/data/exercise-catalog.json mcp-server/data/exercise-catalog.json mcp-server/src/data/exercise-catalog.json`
   → three identical hashes.
3. `grep -c '"id": "cat_cow"' packages/core/data/exercise-catalog.json` → `1`.

### Step 4: Build/typecheck gate

**Verify**:
1. `cd apps/web && npm run build` → exit 0 (the JSON is imported; malformed JSON
   would fail the build).
2. Core tests (discovered runner) → pass, including the validator test.
3. `git diff --stat 943f558..HEAD -- apps pb_migrations packages/core/hooks` →
   no output (no app/hook/migration changes).

### Step 5: Update the index

Set plan 010 status row to `DONE (...)`, noting whether Step 3 stopgap fixes were
applied or deferred to 011.

## Test plan

The validator IS the test. Add at least: (a) it returns 0 hard errors on the
fixed bundled catalog, (b) it returns 0 hard errors on each seed file, and
(c) a unit case proving it *detects* a duplicate id (feed it a tiny synthetic
catalog with a dup → expect a hard error). (c) prevents the validator silently
rotting into a no-op.

## Done criteria

- [ ] `scripts/validate-exercise-catalog.mjs` exists and detects duplicate ids, missing names, invalid difficulty, missing equipment.
- [ ] Validator is wired into the test/CI command and passes on the bundled catalog + all seed files.
- [ ] `grep -c '"id": "cat_cow"' packages/core/data/exercise-catalog.json` → `1` (or Step 3 explicitly deferred to 011 and noted).
- [ ] If Step 3 taken: the three catalog copies are byte-identical (`md5` matches).
- [ ] `cd apps/web && npm run build` exits 0.
- [ ] `git diff --stat 943f558..HEAD -- apps pb_migrations packages/core/hooks` returns no output.
- [ ] `advisor-plans/README-exercise-data.md` plan 010 row updated.

## STOP conditions

- The named defects do not reproduce and the catalog appears already regenerated.
- A "duplicate" id turns out to be two genuinely different exercises that both
  have real `sets_log` history under that id — renaming would orphan one; report
  for a manual reconciliation decision (this is a Plan 011 concern).
- Editing the catalog breaks `apps/web` build (malformed JSON) and cannot be fixed
  in two attempts.

## Maintenance notes

- After Plan 011 regenerates the catalog from seeds, this validator runs against
  the new output unchanged — it is the permanent gate. Consider extending it over
  time (e.g. require non-empty `description` once 011 reaches 100% coverage —
  flip the description check from warning to error).
- The three-copy duplication of `exercise-catalog.json` is itself fragile; Plan
  011 should make the copy step part of the build (one source → copied to the
  mcp-server locations) so they cannot drift.
