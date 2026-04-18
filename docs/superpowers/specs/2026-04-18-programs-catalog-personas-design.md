# Programs Catalog for User Personas — Design Spec

**Date:** 2026-04-18
**Status:** Draft (pre-implementation)
**Related:** `docs/specs/welmi-analysis-onboarding-flow-optimization.md` (onboarding signals feeding this)

## Problem

Prod has only two programs (`Intermedio – Balance Total`, `Ashtanga Yoga Principiante`). Onboarding now collects rich signals (level, weight/goal_weight, focus_areas, training_days, intensity, injuries, medical_conditions, activity_level, pace) but the FOR YOU match only checks `difficulty`. Users across the persona matrix — beginners, overweight users wanting fat loss, skinny users wanting muscle gain, advanced users chasing skills — mostly see zero personalized match.

Goal: a catalog of 13 programs covering the main level × goal combinations plus the four skill tracks users can pick in `focus_areas`, and a matching algorithm that maps onboarding output to a primary program plus an optional skill-track secondary recommendation.

## Non-Goals

- Writing full program content (phases × days × exercises) for all 13 programs in one go. Content ships program-by-program in later sessions (Phase 2 below).
- Equipment- or home-only variants. Out of scope; add later if demand emerges.
- Age- or sex-specific programs (e.g. senior, prenatal). Out of scope.
- AI-personalized programs generated per user. Catalog is static and shared.

## Catalog

### Level × Goal (9 programs)

| # | Program | level | goal_type | skill | intensity | days/w |
|---|---|---|---|---|---|---|
| 1 | Principiante · Quema Grasa | beginner | fat_loss | — | light | 4 |
| 2 | Principiante · Ganar Músculo | beginner | muscle_gain | — | moderate | 4 |
| 3 | Principiante · Fundamentos | beginner | maintain | — | light | 3 |
| 4 | Intermedio · Definición | intermediate | fat_loss | — | intense | 5 |
| 5 | Intermedio · Hipertrofia | intermediate | muscle_gain | — | moderate | 5 |
| 6 | **Intermedio · Balance Total** (existing) | intermediate | maintain | — | moderate | 6 |
| 7 | Avanzado · Cutting Élite | advanced | fat_loss | — | intense | 5 |
| 8 | Avanzado · Volumen Máximo | advanced | muscle_gain | — | intense | 6 |
| 9 | Avanzado · Fuerza Total | advanced | maintain | — | intense | 6 |

### Skill Tracks (4 programs)

| # | Program | level | goal_type | skill | intensity | days/w |
|---|---|---|---|---|---|---|
| 10 | Pull-up Roadmap | beginner | skill | pull_up | light | 3 |
| 11 | Handstand Roadmap | beginner | skill | handstand | moderate | 3 |
| 12 | Muscle-up Roadmap | intermediate | skill | muscle_up | intense | 4 |
| 13 | Planche Roadmap | advanced | skill | planche | intense | 4 |

### Existing program reclassification

`Intermedio – Balance Total` (`d69gjr3mjsurm9s` in prod) tagged as #6 above:
- `goal_type=maintain`, `skill=null`, `intensity=moderate`, `days_per_week=6`
- `equipment_required=["pull_bar","parallel_bars","bands"]`
- `contraindications=["abdominal_hernia","lower_back"]` (its own notes call out "Core sin crunches por hernia abdominal")

## Schema Changes

New migration `pb_migrations/<ts>_add_program_catalog_fields.js` adds six fields to the `programs` collection. All optional/nullable so existing records don't break. Stable field IDs (per `feedback_migration_safety` memory):

| Field | Type | Values / constraints | Field ID |
|---|---|---|---|
| `goal_type` | select (single) | `fat_loss`, `muscle_gain`, `maintain`, `skill` | `select_program_goal_type` |
| `skill` | select (single) | `pull_up`, `handstand`, `muscle_up`, `planche` | `select_program_skill` |
| `intensity` | select (single) | `light`, `moderate`, `intense` | `select_program_intensity` |
| `days_per_week` | number | int, 1–7 | `number_program_days_per_week` |
| `equipment_required` | json | string[], maxSize 1000 | `json_program_equipment_required` |
| `contraindications` | json | string[] using `INJURY_IDS` ∪ `CONDITION_IDS` tokens, maxSize 1000 | `json_program_contraindications` |

Migration `up` step also backfills the existing `Intermedio – Balance Total` record with the values in the reclassification table above. Down step removes by field ID.

`ProgramMeta` TS type in `src/types/index.ts` extended with the six optional fields.

## Matching Algorithm

Lives in `src/hooks/usePrograms.ts`. Replaces the current `p.difficulty === targetDifficulty` check. Exposed as a pure function `matchUserToPrograms(user, programs): { primary: ProgramMeta | null, secondary: ProgramMeta | null, penalties: Map<programId, Penalty[]> }` so it can be unit-tested.

### Pipeline

```
1. Derive user.goal_type from weight vs goal_weight (matches existing
   inferNutritionGoalType in NutritionPage):
     delta = goal_weight - weight
     delta > 2  → muscle_gain
     delta < -2 → fat_loss
     else       → maintain
   Fallback: maintain if either weight or goal_weight missing.

2. Map onboarding level token to program.difficulty:
     principiante → beginner
     intermedio   → intermediate
     avanzado     → advanced

3. PRIMARY candidate (Level × Goal):
     p.difficulty === userLevel && p.goal_type === userGoalType
     Expect ≤ 1 match in the catalog.

4. SECONDARY candidate (Skill):
     if user.focus_areas contains any of [pull_up, handstand, muscle_up, planche]:
       pick the first focus (in FOCUS_AREA_IDS order) with a matching
       skill-track program (p.goal_type === 'skill' && p.skill === focus)
     Only surface if secondary.id !== primary.id.

5. Soft penalties per candidate (don't exclude, just flag):
     - p.days_per_week > user.training_days.length  → "high_frequency"
     - p.equipment_required \ user.equipment (future field) is non-empty → "equipment_missing"
     - p.contraindications intersects user.injuries ∪ user.medical_conditions → "health_flag"
```

### UI

- **FOR YOU card** (primary match): existing lime-edged card in `StepProgram.tsx`.
- **"También para ti" card** (secondary skill track): rendered directly below the primary card with a muted accent border, only when `secondary` is non-null. Label key `onboarding.alsoForYou`.
- **Soft-penalty chips**: small amber pills on each card, one per penalty. i18n keys: `programs.penalty.highFrequency`, `programs.penalty.equipmentMissing`, `programs.penalty.healthFlag`.

### Fallback behavior

- No primary match (e.g. level missing) → existing sort order (featured > official > rest), no FOR YOU badge.
- Primary matches but no secondary → only FOR YOU card, no "también para ti".

### Edge cases

- Multiple skill focuses picked → pick first in `FOCUS_AREA_IDS` order (deterministic).
- Onboarding skipped entirely → `user.level` undefined → no primary, no secondary, fallback sort.
- Non-skill program and skill track same level but user picked skill → secondary still surfaces (different id than primary).
- User weight = goal_weight exactly → goal_type = maintain (covered by the `else` branch).

## Implementation Phases

### Phase 1 — skeleton catalog + wiring (this spec's session)

1. Write migration for the six new `programs` fields.
2. Extend `ProgramMeta` TS type.
3. Create `scripts/seed-program-catalog.mjs`:
   - Auth as PB superuser.
   - For each of the 12 **new** programs (skip existing Balance Total): create-if-not-exists with name + description + difficulty + goal_type + skill + intensity + days_per_week + equipment_required + contraindications + `is_active=true` + `is_official=true` + `is_featured=false` + a single stub phase + single stub day with one placeholder exercise `"Contenido próximamente"`.
   - Retag existing `Intermedio – Balance Total` record with the six new fields.
   - Idempotent: re-runs skip already-seeded programs by i18n-name match.
4. Extract `matchUserToPrograms` pure function from `usePrograms.ts` and wire per pipeline above.
5. Update `StepProgram.tsx`:
   - Render primary in existing FOR YOU slot.
   - Render secondary (when non-null) below.
   - Render amber penalty chips on each.
6. Add i18n keys (ES + EN): `onboarding.alsoForYou`, `programs.penalty.highFrequency`, `programs.penalty.equipmentMissing`, `programs.penalty.healthFlag`, `programs.contentComingSoon` (banner copy in `ProgramDetailPage`).
7. Add banner to `ProgramDetailPage` when program has stub content (detect by total exercises ≤ 1 or a `content_status=stub` tag — TBD in plan).
8. Apply migration locally + run seed against local PB. Apply migration to prod + run seed against prod.
9. Unit tests (vitest) for `matchUserToPrograms` covering the personas listed in Testing below.
10. E2E test (Playwright MCP) covering the three personas listed in Testing below.

### Phase 2 — per-program content drops (separate sessions, one program each)

For each program slug, a separate session:
1. Generate program JSON (same shape as `intermedio_balance_total.json`) using calisthenics progression rules + `src/data/exercises.json` catalog. Prompt-driven draft, user review/edit.
2. Script `scripts/update-program-content.mjs <slug>` wipes that program's phases/exercises and replaces with the new JSON content. Keeps the program record itself, so any enrolled users carry over.
3. Drop the "content coming soon" banner for that program.

Priority order for content (most-common personas first):
1. Principiante · Fundamentos
2. Principiante · Ganar Músculo
3. Principiante · Quema Grasa
4. Pull-up Roadmap
5. Intermedio · Hipertrofia
6. Intermedio · Definición
7. Muscle-up Roadmap
8. Handstand Roadmap
9. Avanzado · Volumen Máximo
10. Avanzado · Cutting Élite
11. Avanzado · Fuerza Total
12. Planche Roadmap

## Testing

### Unit (vitest)

Test `matchUserToPrograms` with the full 13-program catalog as fixture:

| Persona | Expect primary | Expect secondary |
|---|---|---|
| Beginner + fat_loss, 4 days, no focus skills | Principiante · Quema Grasa | null |
| Beginner + muscle_gain + focus `pull_up` | Principiante · Ganar Músculo | Pull-up Roadmap |
| Intermediate + maintain, 6 days | Intermedio · Balance Total | null |
| Advanced + maintain + focus `planche` | Avanzado · Fuerza Total | Planche Roadmap |
| Beginner + 3 days selected, program = 4 d/w | primary still matched, penalty `high_frequency` flagged | — |
| Intermediate + injury `lower_back` + Balance Total | matched, penalty `health_flag` flagged | — |
| Level missing | null | null |
| goal_weight missing | goal_type defaults `maintain` | — |
| Multiple skill focuses picked | first in `FOCUS_AREA_IDS` order wins | — |

### E2E (Playwright MCP)

Against prod after Phase 1 deploy:
1. Fresh account → onboarding with persona (weight 90, goal 75, beginner, 4 days, no skill focus) → verify FOR YOU = "Principiante · Quema Grasa".
2. Fresh account → onboarding with persona (weight 60, goal 70, advanced, 6 days, focus=`planche`) → verify primary = "Avanzado · Volumen Máximo" + secondary = "Planche Roadmap".
3. Existing user (Guillermo) → profile already intermedio/maintain → verify FOR YOU = "Intermedio · Balance Total".

### Migration

- Apply on local PB → confirm existing two programs still load, Balance Total has the six new fields backfilled.
- Re-run seed script → 0 duplicates created.

### Manual smoke

- Visual check of secondary "también para ti" card placement/spacing.
- Visual check of amber penalty chips.
- Program detail "próximamente" banner renders on the 12 new skeletons but not on Balance Total or yoga program.

## Risks & Open Questions

- **Skeleton UX**: 12 programs with stub content visible in the program picker could feel like vaporware. Mitigation: "contenido próximamente" banner inside the program detail, not on cards. If onboarding users enroll en masse before content drops, consider gating enroll with a "Notificarme" button instead of immediate enrollment. Decide during Phase 1 implementation.
- **Matching when user lacks goal_weight**: defaulting to `maintain` biases Intermedio · Balance Total (and the other maintain programs) for everyone who skips the goals step. Acceptable for MVP; revisit if analytics show skewed enrollment.
- **Skill tracks below intermediate**: Pull-up and Handstand Roadmaps are tagged `beginner` but users who picked `avanzado + pull_up` focus won't see the Pull-up Roadmap as secondary (primary wins, secondary won't be lower-level). Accepted as correct behavior (advanced user with pull_up focus gets Avanzado primary; Pull-up Roadmap is for users still progressing to their first pull-up).
- **Content authoring pace**: Phase 2 scope is 12 programs × ~300 exercise rows each = ~3600 rows to author across many sessions. If this proves too slow, fall back to a lighter template (6 weeks, 1 phase, 3–4 days) for the lowest-priority programs.

## File changes (implementation plan preview)

- `pb_migrations/1776600000_add_program_catalog_fields.js` (new)
- `scripts/seed-program-catalog.mjs` (new)
- `src/types/index.ts` (extend `ProgramMeta`)
- `src/hooks/usePrograms.ts` (extract + replace matching)
- `src/lib/matchPrograms.ts` (new, houses pure function)
- `src/components/onboarding/StepProgram.tsx` (primary + secondary + penalty chips)
- `src/pages/ProgramDetailPage.tsx` (stub-content banner)
- `src/locales/es/translation.json` + `src/locales/en/translation.json` (new keys)
- Tests: `src/lib/matchPrograms.test.ts` (new)
