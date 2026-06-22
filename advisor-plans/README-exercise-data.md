# Advisor Plans — exercise data normalization, score tracking, tempo & media (plans 008–015)

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
| 011 | Unify the catalog: make `seeds/exercises/*.json` the single source of truth (descriptions 13%→100%, one id scheme) | P2 | L | HIGH | 010 | DONE (Phase A+B) — branch `advisor/011-unify-catalog-from-seeds` @ `4abea7d` (A `abc00c5` + B `2355e61` + post-verify fixes `4abea7d`). Final count=307, coverage=92% (24 missing = pre-existing app-specific ids with no seed, e.g. `pushup_std`), 126 enriched + 137 new, invariant held (170 old ids ⊆ 307, 0 dropped/renamed), md5 identical (3 copies), `test:catalog` 20/20 ✓, validator 0 hard errors (3 copies + 8 seed files), equipment vocab 100% canonical, **pipeline idempotent** (frozen base). Adversarial verify (2 opus lenses) PASS after 3 fixes (see "Post-verify fixes" below). Web build / mobile typecheck unaffected by construction (catalog imported `as any` / `as unknown`; `base.json` unreferenced). Phase C (PB) + Phase D (`sets_log`) DEFERRED. |
| 012 | Exercise alias / canonicalization layer (`resolveExerciseId`, populate `variant_of`) | P3 | M | MED | 011 | DONE — branch `advisor/012-exercise-alias-canonicalization`, verify=PASS-high. Re-run `build:catalog` after merging 011. |
| 013 | Structured exercise execution model (tempo / eccentric / pauses / holds) + player display | P2 | M–L | MED | 011 | DONE (pipeline) — branch `advisor/013-structured-exercise-tempo`, verify=PASS-high. Tempo **data** awaits maintainer approval (6 high-confidence cues applied to seeds; `scripts/tempo-proposal.json` is proposal-only). |
| 014 | Canonical, reusable exercise media (one image/video set, reused across library · program · free session · mobile) | P2 | L | MED | 011 | DONE — branch `advisor/014-canonical-reusable-media`, verify=PASS-high. Pure resolver `packages/core/lib/exerciseMedia.ts` (program → catalog-static → catalog-PB → curated → youtube); no binaries. |
| 015 | Structured media schema (`media {sequence, muscles, thumbnail, video}`) + static-bundled delivery so all exercises render demo + muscle map | P2 | M | MED | 011, 014 | DONE — branch `advisor/015-structured-media` @ `7a4dab5`, verified end-to-end on web (strict-pull-up: 3-phase movement strip in hero box + muscle-activation map in MÚSCULOS tab). Mobile resolves via catalog id (tsc✓). See "Plan 015" section below. |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (reason) | REJECTED (reason)

## Decisions

- **2026-06-21 — canonical id scheme for Plan 011: keep snake_case `id` + enrich
  from seeds (Option A).** Rejected: adopting kebab slugs as canonical (would
  require migrating all historical `sets_log`). This keeps existing user score
  history intact while raising description coverage to ~100%.

## Plan 011 — Post-verify fixes (2026-06-21)

Phase A+B were implemented and adversarially verified by two opus lenses. Lens A
(invariant safety) passed first time; Lens B (data correctness) found three real
defects, all since fixed in commit `4abea7d`:

- **F1 — `test:catalog` regression.** The Plan-010 test globs
  `seeds/exercises/*.json` minus `_schema.json`, so the newly-committed
  `_id-map.json` (not seed-shaped) failed the gate (20/22). Fix: the test now
  skips **all** `_`-prefixed files. → 20/20.
- **F2 — non-idempotent pipeline.** Both `build-id-map.mjs` and
  `build-exercise-catalog.mjs` (offline) read `packages/core/data/exercise-catalog.json`
  — the same file the merge overwrites — so re-running drifted 306→316 and the
  artifact was not reproducible from a clean checkout. Fix: a **frozen base
  snapshot** `packages/core/data/exercise-catalog.base.json` (the pre-011
  170-entry catalog) is the merge's immutable input; the 3 live copies are the
  output. `npm run build:id-map && npm run build:catalog` is now idempotent.
  `--refresh-wger` rewrites the snapshot from the wger fetch.
- **F3 — semantic mis-enrichment on id collision.** The basic `step-up` seed's
  derived id `step_up` collided with the *existing* `step_up` entry — which is
  actually **"Step-up Explosivo"** — and overwrote it with generic content, while
  the real `explosive-step-up` seed became a duplicate `explosive_step_up`. Fix:
  derived-id collisions where the **names don't match** are now added as NEW
  entries (`step_up_2`, `box_jump_2`) and never enrich the mismatched entry; the
  explosive seed now correctly enriches `step_up` and the duplicate is gone.

**Known acceptable residue (for Plan 012's alias layer):** a few near-duplicate
pairs remain by design rather than risk a wrong merge — `box_jump` (local "silla
sólida", no seed) vs `box_jump_2` (seed "Box Jump"); `muscle_up` (ambiguous
fuzzy-hit, routed to a new entry) vs `muscleup_real`. These are the validator's
remaining duplicate-**name** warnings (11 total, all non-blocking). Plan 012
(`resolveExerciseId` + `variant_of`) is the place to canonicalize them.

**Coverage note:** 24/307 still lack a description — every one is a pre-existing
app-specific id with no seed (e.g. `pushup_std` from `workouts.ts`). Reaching
~100% is content work (author seeds for those), not a pipeline gap. The merge
already brings all 263 seeds' descriptions through.

## Plan 015 — Structured media (2026-06-21)

Builds on 014's resolver to give every exercise a well-managed media schema and a
working static-bundled delivery path, so images like the pasted pull-up composite
(3-phase movement strip + muscle-activation map) render across all surfaces.

**Schema.** The canonical seed/catalog record carries a structured
`media { sequence, muscles, thumbnail, video }` object (filenames, stored under
`seeds/exercises/media/<slug>/`). `seeds/exercises/_schema.json` replaces the old
flat `image_files`/`video_file` with this object. A PB migration
(`pb_migrations/1776920000_add_structured_media_to_exercises_catalog.js`) adds
`media_sequence` / `media_muscles` / `media_thumbnail` file fields (additive,
field ids preserved per the migration-safety rule).

**Delivery (static-bundled).** `scripts/sync-exercise-media.mjs` (`npm run build:media`)
copies `seeds/exercises/media/<slug>/*` → `apps/web/public/exercise-media/<slug>/`;
`build-exercise-catalog.mjs` carries each `media` value into the bundled catalog as
an **origin-relative** path (`/exercise-media/<slug>/<file>`). Web resolves these
same-origin; mobile prefixes `EXPO_PUBLIC_PB_URL` (or `gym.guille.tech`).

**Resolution.** The pure resolver `packages/core/lib/exerciseMedia.ts` returns
`{ sequence, muscles, thumbnail, video, images, … }`. A bundled-catalog helper
`packages/core/lib/catalogMedia.ts` (`getCatalogStaticMedia`) supplies the
`catalogRecord.staticMedia` from just an id/slug, indexing the catalog by **`id`,
`seed_slug` AND `slug`**. Wired into `MediaViewer` (library/session/free-session),
mobile `SessionView`, and `ExerciseDetailPage`.

**Adversarial verify caught two real defects, both fixed:**

- **D1 — media never populated.** The resolver reads `catalogRecord.staticMedia`,
  but no call site set it → structured media silently never rendered. Fixed by the
  `catalogMedia.ts` helper + wiring all three surfaces (commit `47e870a`).
- **D2 — detail-page lookup miss (`7a4dab5`).** `ExerciseDetailPage` loads from PB
  when available, where `mapPBRecord` sets `exercise.id` to the **PB record id**
  (random 15-char), not the catalog id/slug → `getCatalogStaticMedia(exercise.id)`
  missed and fell back to the placeholder. Fixed by indexing media by id + seed_slug
  + slug, and looking up by `exercise.slug` first, then `exercise.id`.

First populated exercise: **strict-pull-up** (`pullup_strict`) — composite split
into `sequence.webp` / `muscles.webp` / `thumbnail.webp` (~96 KB total).
Verified visually on web (Playwright): hero box shows the movement strip, MÚSCULOS
tab shows the activation map. Web + mobile `tsc` clean.

**To populate a new exercise:** drop `sequence/muscles/thumbnail.webp` into
`seeds/exercises/media/<slug>/`, add the `media {…}` object to that exercise's seed
entry, then `npm run build:media && npm run build:catalog`.

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
