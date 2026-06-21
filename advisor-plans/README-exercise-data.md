# Advisor Plans — exercise data normalization, score tracking, tempo & media (plans 008–014)

Generated 2026-06-21 from a `plan`-style request: *"are exercises properly
normalized (es/en), can we track every exercise's score (not just a handful), does
each exercise have equipment / description / difficulty — and can we systematically
model execution tempo and reuse images/videos for explanation?"*

> Kept as a **separate index** from `advisor-plans/README.md` (which is scoped to
> the "mobile UI parity" effort and was intentionally left untouched). Each plan in
> this group tracks its own status in the table below.

**Target branch:** `main` @ commit `943f558` (current HEAD). Do NOT push, merge,
rebase, or open a PR without the maintainer's say-so. Use explicit file paths in
`git add`.

## The core finding (read before executing any plan in this group)

The app has **two disconnected exercise datasets with two different id schemes**,
two score-tracking bugs, and two data-model gaps (tempo, media):

1. **Bundled catalog (what the app reads at runtime):**
   `packages/core/data/exercise-catalog.json` — 171 exercises, **snake_case `id`**
   (`pushup_std`), only **22/171 (13%) have a description**. Built by
   `scripts/build-exercise-catalog.mjs` from `workouts.ts` + `supplementary-exercises.ts`
   + wger, last generated `2026-03-27`. Consumed by web, mobile, and the MCP
   free-session generator. Three byte-identical copies kept in sync manually.
2. **Seed catalog (what only PocketBase gets):** `seeds/exercises/*.json` — **263
   exercises, kebab-case `slug`, 100% bilingual `description` + `difficulty_level`
   + `equipment`**. Seeded into PB by `scripts/seed-exercises.mjs`. **Nothing feeds
   this rich data into the bundled catalog the app actually reads.**
3. **Identity is by id string, not name** — es/en labels of the *same id* merge
   (good); but there is **no canonicalization**, so two ids for one movement
   split, and `LogWorkoutPage.mapPBCatalog` logs the PB record's random id
   (`rec.id`), not `rec.slug`.
4. **PRs only exist for 5 hard-coded families** (`useProgress.ts` `PR_PATTERNS`);
   every other exercise records sets but never a PR. Reps `parseInt`'d so
   `"8-12"`→8, `"max"`→dropped.
5. **Execution tempo is unstructured** — "baja 5s", "pausa 2s arriba", slow
   eccentrics live only in free-text `note` (sometimes inside `reps`). No
   structured tempo/eccentric/pause fields; the player just prints the note.
6. **Media is fragmented and barely reused** — two disconnected PB media stores
   (`exercises_catalog.default_*` vs `program_exercises.demo_*`) with no fallback;
   the web viewer only resolves *program* media; mobile shows none; the seed media
   fields are ignored on import; only 8/171 exercises have an image; `youtube` is
   a search query, not a curated video.

Full evidence is embedded verbatim in each plan's "Current state" section.

## Execution order & status

| Plan | Title | Priority | Effort | Risk | Depends on | Status |
|------|-------|----------|--------|------|------------|--------|
| 008 | Fix exercise ID drift in `LogWorkoutPage` (log `rec.slug`, not random `rec.id`) | P1 | S | MED | — | DONE — branch `advisor/008-logworkout-id-drift` @ `cb4e725`, adversarial verify=PASS (tsc✓); awaiting maintainer apply + manual smoke (Step 4) |
| 009 | Universal PR tracking + robust reps parsing (every exercise, not 5 families) | P1 | M | MED | — | DONE — branch `advisor/009-universal-pr-tracking` @ `e49def3`, verify=PASS (web+mobile tsc✓, core 67 tests✓); awaiting apply + smoke (Step 6) |
| 010 | Catalog data-integrity pass (dup `cat_cow`, split `thoracic_rot*`, mislabeled `sit_ups`) + validation test | P2 | M | LOW | — | DONE — branch `advisor/010-catalog-data-integrity` @ `a27e0725`, verify=PASS (validator + 20 tests✓); awaiting apply |
| 011 | Unify the catalog: make `seeds/exercises/*.json` the single source of truth (descriptions 13%→100%, one id scheme) | P2 | L | HIGH | 010 | DONE — branch `advisor/011-unify-catalog-from-seeds` @ `abc00c5`; final count=306, coverage=92% (23 missing), invariant held (170→306 old⊆new), md5 identical (3 copies), validator 0 hard errors (3 catalog copies + 8 seed files), equipment vocab clean. Phase C (PB seed enrichment) and Phase D (sets_log migration) DEFERRED to later round. |
| 012 | Exercise alias / canonicalization layer (`resolveExerciseId`, populate `variant_of`) | P3 | M | MED | 011 | TODO |
| 013 | Structured exercise execution model (tempo / eccentric / pauses / holds) + player display | P2 | M–L | MED | 011 | TODO |
| 014 | Canonical, reusable exercise media (one image/video set, reused across library · program · free session · mobile) | P2 | L | MED | 011 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (reason) | REJECTED (reason)

## Decisions

- **2026-06-21 — canonical id scheme for Plan 011: keep snake_case `id` + enrich
  from seeds (Option A).** Rejected: adopting kebab slugs as canonical (would
  require migrating all historical `sets_log`). This keeps existing user score
  history intact while raising description coverage to ~100%.

## Recommended sequencing

- **Ship first (independent P1s):** 008 and 009 — they stop active score
  fragmentation and make PRs universal without touching the catalog data.
- **Then the data foundation:** 010 (safe, isolated; adds the validator that
  gates 011) → 011 (the large, decision-heavy unification that brings descriptions
  to ~100% and establishes the single canonical record).
- **Then build on the unified record:** 012 (runtime alias resolution), 013
  (structured tempo), 014 (reusable media) — all depend on 011's canonical record
  and seeds→catalog pipeline. 012/013/014 are mutually independent and can run in
  parallel after 011.
- Each plan updates its own status row above when complete.
