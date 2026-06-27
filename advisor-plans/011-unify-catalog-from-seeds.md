# Plan 011: Unify the exercise catalog — make `seeds/exercises/*.json` the single source of truth (descriptions 13%→100%, one id scheme)

> **Executor instructions**: This is the **large, decision-heavy** plan of the
> group. Do NOT treat it as mechanical. Read the whole plan, then the "Decision"
> section, before writing code. Run every verification command. If anything in
> "STOP conditions" occurs, stop and report. When done, update this plan's status
> row in `advisor-plans/README-exercise-data.md`.
>
> **Drift check (run first)**: from the repo root, run:
> `git diff --stat 943f558..HEAD -- scripts/build-exercise-catalog.mjs scripts/seed-exercises.mjs packages/core/data/exercise-catalog.json seeds/exercises`
> If any changed, re-confirm the "Current state" facts before proceeding.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH (regenerates the catalog every app surface reads; can change
  exercise identity and orphan `sets_log` history if done carelessly)
- **Depends on**: 010 (its validator is this plan's acceptance gate)
- **Blocks**: 012 (alias layer needs the unified catalog + slug↔id map), 013
  (tempo/media live on the unified canonical record)
- **Category**: data architecture
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

The app has **two disconnected exercise datasets** (see the group README):

- **Bundled catalog** the app actually reads — `packages/core/data/exercise-catalog.json`,
  171 exercises, snake_case `id`, **only 13% have a description**. Built from
  `workouts.ts` + `supplementary-exercises.ts` + wger.
- **Seed catalog** — `seeds/exercises/*.json`, **263 exercises, kebab-case
  `slug`, 100% bilingual descriptions + difficulty + equipment** — but it only
  flows into PocketBase, never into the bundled catalog.

So the rich, complete data the user wants ("each exercise should have equipment,
description, difficulty") **already exists** in the seeds; it just never reaches
the runtime catalog. This plan connects them: it makes the seeds the **content
source of truth** and regenerates the bundled catalog from them, raising
description coverage to ~100% and establishing one canonical record per exercise
that every surface (web, mobile, MCP, PB) shares.

## The hard part (read before the Decision)

The two datasets use **different id schemes**:

| | bundled catalog (`id`) | seeds (`slug`) |
|---|---|---|
| scheme | snake_case | kebab-case |
| example | `pushup_std`, `ab_wheel_rollout` | `knee-push-up`, `diamond-push-up` |
| used by | `workouts.ts`, programs, **existing `sets_log` history**, `PR_PATTERNS` | PB `exercises_catalog`, the LogWorkoutPage picker after Plan 008 |

The ids do **not** map 1:1 by a simple transform — `workouts.ts` uses app-specific
ids (`pushup_std`) while seeds use descriptive slugs (`knee-push-up`). And the
**critical constraint**: users' permanent score history in `sets_log` is keyed by
the *existing snake ids*. Changing the canonical scheme to kebab slugs would
orphan all of that history.

## Decision (CONFIRMED by maintainer 2026-06-21 — Option A below)

> ✅ **DECIDED**: keep snake_case `id` as canonical + enrich from seeds (Option A).
> The maintainer confirmed this on 2026-06-21. Do NOT adopt kebab slugs as
> canonical (that path is rejected — it would require migrating all historical
> `sets_log` rows). Proceed with the recommended path below; the "CONFIRM before
> Step 3" gate is satisfied.

**Keep snake_case `id` as the canonical runtime identity; make the seeds the
CONTENT source; match seed content onto existing ids by normalized name; add
unmatched seeds as new entries with a deterministic snake id.**

Rationale: this delivers the user's actual goal (every exercise gets a real
description + verified difficulty + equipment, and the catalog grows from 171 →
up to ~263) **without renaming existing ids**, so **zero existing `sets_log`
history is orphaned**. It is strictly additive/enriching, which is why it is the
recommended path despite the plan's HIGH risk rating.

Rejected alternatives (document if you deviate):
- *Adopt kebab slugs as canonical* — cleanest long-term, but requires migrating
  every historical `sets_log.exercise_id` (snake → slug) via a mapping table;
  high blast radius on real user data. Defer unless the maintainer wants it.
- *Two catalogs forever* — status quo; rejected (it is the bug).

> ✅ The canonical-scheme decision is already CONFIRMED (Option A, snake_case +
> enrich; see the Decision section above). No further sign-off needed to start.

## Current state

Files involved:

- `scripts/build-exercise-catalog.mjs` — current generator. Reads `workouts.ts` +
  `supplementary-exercises.ts` + wger API; dedupes **by normalized name (exact
  match only)**; writes `packages/core/data/exercise-catalog.json`. **You will
  add the seeds as a content source here.**
- `scripts/seed-exercises.mjs` — seeds → PB `exercises_catalog` (kebab slugs).
  Read-only reference; the slug↔id map you build should keep PB and the bundled
  catalog reconcilable.
- `seeds/exercises/*.json` (263) + `seeds/exercises/_schema.json` — the content
  source of truth. Seed record shape (VERBATIM, `seeds/exercises/push.json`):
  ```json
  {
    "name": { "es": "Push-up Rodillas", "en": "Knee Push-up" },
    "slug": "knee-push-up",
    "description": { "es": "Flexión con las rodillas...", "en": "Push-up performed with knees..." },
    "muscles": { "es": "Pecho, hombros, tríceps", "en": "Chest, shoulders, triceps" },
    "difficulty_level": "beginner",
    "equipment": [],
    "progression_order": 1,
    "default_sets": 3, "default_reps": "8-12", "default_rest_seconds": 90,
    "target_reps_to_advance": 15, "sessions_at_target": 3,
    "source": "catalog", "status": "official"
  }
  ```
- `packages/core/data/exercise-catalog.json` (+ `mcp-server/data/...` and
  `mcp-server/src/data/...` copies) — the three byte-identical generated outputs.
- `scripts/validate-exercise-catalog.mjs` — the validator from **Plan 010**; the
  regenerated catalog MUST pass it.
- `packages/core/types/index.ts` — `Exercise` type the bundled JSON must satisfy.

Key facts (verified):
- Seeds: 263 exercises, 100% description/difficulty/equipment coverage, kebab `slug`.
- Bundled: 171, snake `id`, 13% description, `generated_at: 2026-03-27`.
- No automated path connects seeds → bundled catalog today.
- The three bundled copies are synced **manually** (build writes one, the other
  two are hand-copied) — fragile; fix as part of this plan.

## Approach (phased, each phase independently verifiable)

### Phase A — Build the name→id reconciliation map (no output change yet)

Write a script/step that, for every seed exercise, attempts to match it to an
existing bundled-catalog entry by **normalized name** (lowercase, strip accents,
collapse spaces/punctuation — reuse the normalization already in
`build-exercise-catalog.mjs`'s dedup or `wger-mappings.ts`). Produce a report:
- seeds matched to an existing id (→ enrich that id's content),
- seeds with no match (→ new entry; assign id = `slug.replace(/-/g, '_')`),
- existing catalog ids with no seed (→ keep as-is; flag low description coverage),
- any id collisions the new-entry transform would cause (must be resolved).

Persist the resolved mapping as a committed artifact (e.g.
`seeds/exercises/_id-map.json`: `slug → canonical_id`). This same map powers
Plan 012's resolver and any future `sets_log` reconciliation. **Human-review the
match report** — name matching is fuzzy; wrong matches corrupt data.

**Verify**: the map covers all 263 seeds; no canonical-id collisions; the report
is committed for review.

### Phase B — Teach `build-exercise-catalog.mjs` to merge seed content by the map

Add the seeds as a **content source** in the generator:
- For matched ids: overlay seed `description`, `difficulty_level`→`difficulty`,
  `equipment`, `muscles` onto the existing entry (seed content wins for these
  fields; keep existing `id`, `category`, `sets/reps/rest`, media unless seed has
  better). Do not lose existing fields the seed lacks.
- For unmatched seeds: add a new entry with the mapped snake id and the seed's
  full content + `category` derived from the seed file (push/pull/...).
- Normalize `equipment` to ONE vocabulary (reconcile the 3 vocabularies:
  `seeds/_schema.json` 10 keys, `equipment.ts` 14 keys, the bundled Spanish
  strings like `ninguno`/`barra_dominadas`). Pick `equipment.ts` keys as
  canonical (they drive the library filter UI) and map the others to them.
- Make the generator **write all three** catalog copies (or write one and copy to
  the two mcp-server paths) so they cannot drift. Wire an npm script:
  `"build:catalog": "node scripts/build-exercise-catalog.mjs"`.

**Verify**:
1. `node scripts/build-exercise-catalog.mjs` regenerates all three files; `md5`
   of the three matches.
2. `node scripts/validate-exercise-catalog.mjs <each file>` → 0 hard errors.
3. Description coverage jumps to ~100% (validator's warning count ≈ 0 missing, or
   report the exact remaining count and why).
4. `total_count` reflects the merged set (≈ up to 263, fewer if seeds matched
   existing ids).

### Phase C — Align PocketBase + the picker

- Ensure `seed-exercises.mjs` and the bundled catalog agree: the PB record's
  `slug` and the bundled `id` must be reconcilable via `_id-map.json`. Either
  store the canonical snake `id` on the PB record (add a field) OR keep slug and
  rely on the resolver (Plan 012). Recommended: add the canonical id to PB so
  Plan 008's picker can log it directly instead of the slug.
- If you add a PB field, write a migration **preserving existing field ids**
  (`feedback_migration_safety`: never drop/recreate a field — that loses data).

**Verify**: a re-seed (dry-run) shows PB records carrying the canonical id; the
LogWorkoutPage picker (Plan 008) can resolve a picked exercise to the canonical
snake id.

### Phase D — Historical `sets_log` reconciliation (optional, gated)

For rows already logged under a random PB id (pre-Plan-008) or a dropped
duplicate id (Plan 010), write a **dry-run-first** maintenance script that maps
them to canonical ids using `_id-map.json` + the Plan-010 decisions. This MUTATES
user data — it must:
- default to `--dry-run`, printing every intended change;
- only run with explicit `--apply` and a confirmed backup;
- never touch rows it cannot confidently map (leave + report them).

**This phase is optional and high-risk; do it only if the maintainer asks.**
Document the orphan counts either way.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Build catalog | `node scripts/build-exercise-catalog.mjs` | writes 3 files, exit 0 |
| Validate (Plan 010) | `node scripts/validate-exercise-catalog.mjs <file>` | 0 hard errors |
| 3 copies identical | `md5 packages/core/data/exercise-catalog.json mcp-server/data/exercise-catalog.json mcp-server/src/data/exercise-catalog.json` | identical |
| Web build | `cd apps/web && npm run build` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 |
| Description coverage | validator summary line | ~0 missing |

## Scope

**In scope**: `scripts/build-exercise-catalog.mjs` (modify), `seeds/exercises/_id-map.json`
(create), the 3 `exercise-catalog.json` outputs (regenerate), an npm
`build:catalog` script, optionally a PB migration adding a canonical-id field +
`scripts/seed-exercises.mjs` update, optionally `scripts/reconcile-sets-log.mjs`
(create, dry-run-first), `advisor-plans/README-exercise-data.md`.

**Out of scope**: app/runtime hooks and components (the catalog is data; consumers
read it unchanged), `useProgress.ts` (Plan 009), the LogWorkoutPage mapping logic
beyond what Plan 008 already did, the alias resolver (Plan 012), tempo/media
schema (Plan 013).

## Git workflow

- Branch: `advisor/011-unify-catalog-from-seeds` (from `main`).
- Explicit paths in `git add`. NEVER `git add -A`.
- Commit per phase. Style: `feat(data): unify exercise catalog from seeds (descriptions 13%→100%)`
- The regenerated `exercise-catalog.json` is large — commit it as its own logical
  unit. No push/PR/merge/rebase without the operator's say-so.

## Test plan

- Plan 010's validator is the structural gate (run on all three outputs + seeds).
- Add a generator test (or assertions in the build) verifying: every seed slug is
  in `_id-map.json`; no duplicate canonical ids; description coverage ≥ a
  threshold (e.g. 95%).
- Manual: open the Exercise Library (web) and the mobile picker, confirm
  exercises now show descriptions and that difficulty/equipment filters still
  work; spot-check 5 exercises against their seed content.

## Done criteria

- [ ] `seeds/exercises/_id-map.json` exists, covers all 263 seeds, no id collisions, match report reviewed.
- [ ] `node scripts/build-exercise-catalog.mjs` regenerates all 3 catalog copies; `md5` identical.
- [ ] `node scripts/validate-exercise-catalog.mjs` passes (0 hard errors) on all 3 + seeds.
- [ ] Description coverage ≈100% (report exact remaining count).
- [ ] `equipment` uses ONE canonical vocabulary across the catalog.
- [ ] `cd apps/web && npm run build` and `cd apps/mobile && npm run typecheck` exit 0.
- [ ] No existing snake `id` was renamed (existing `sets_log` history intact) — confirm by diffing the id set: every id present in the old catalog is still present.
- [ ] `advisor-plans/README-exercise-data.md` plan 011 row updated; Phase D status (done/deferred) noted.

## STOP conditions

- (Resolved) The canonical-scheme decision is CONFIRMED (Option A). If anyone
  proposes switching to kebab slugs mid-execution, STOP — that is a different,
  higher-risk plan requiring `sets_log` migration sign-off.
- Name-matching (Phase A) produces ambiguous/incorrect matches you cannot resolve
  confidently — stop; bad matches corrupt content. Report for manual mapping.
- Regeneration would **drop or rename** an existing id that has `sets_log` history
  (verify the old id set ⊆ new id set). If an id must change, that is Phase D
  territory and needs explicit approval.
- The validator fails on the regenerated catalog and cannot be made to pass in two
  attempts.
- Any PB migration would require dropping/recreating a field (data loss) — use the
  field-id-preserving pattern instead (`feedback_migration_safety`).

## Maintenance notes

- After this lands, the **seeds are the content source of truth**. New exercises
  are added to `seeds/exercises/*.json`, then `npm run build:catalog` regenerates
  everything and `seed-exercises.mjs` updates PB. Document this in the repo
  (a short `seeds/exercises/README.md`).
- `_id-map.json` is load-bearing for Plan 012 and any `sets_log` reconciliation —
  keep it in sync when slugs/ids change.
- Tempo and media (Plan 013) attach to this same canonical record; design 013's
  schema additions to live in the seeds so they flow through this same pipeline.
- Consider flipping Plan 010's validator description check from warning → hard
  error once coverage is ~100%, to prevent regressions.
