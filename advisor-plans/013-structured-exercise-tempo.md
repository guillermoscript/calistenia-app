# Plan 013: Structured exercise execution model (tempo / eccentric / pauses / holds) — stop burying cues in free text

> **Executor instructions**: Follow step by step; run every verification; obey
> STOP conditions. Update this plan's status row in `advisor-plans/README-exercise-data.md` when
> done.
>
> **Drift check (run first)**:
> `git diff --stat 943f558..HEAD -- packages/core/types/index.ts packages/core/data/workouts.ts seeds/exercises/_schema.json apps/web/src/components/SessionView.tsx apps/mobile/src/components/SessionView.tsx`
> Re-confirm the "Current state" facts (tempo is free-text-only) before editing.

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED (schema addition + a semi-automated backfill of cues parsed from
  free text; the player change is additive)
- **Depends on**: 011 (the structured fields live on the unified canonical record
  and flow through its seeds→catalog pipeline)
- **Related**: 014 (media) — both extend the same canonical record
- **Category**: data model / UX
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

Programs already prescribe real execution tempo — "baja MUY lento 5 segundos",
"pausa 1s arriba", "mantén 2s", controlled eccentrics — but **all of it is
trapped in the free-text bilingual `note` field** (and sometimes smuggled into
`reps` as `"5 (5s bajada)"`). There are **no structured fields** for eccentric
time, pause-at-top/bottom, or rep tempo. Consequences:

- The session player can only show the cue as an undifferentiated gray italic box
  (`exercise.note`); it cannot drive a tempo timer, count an eccentric, or beep at
  a pause.
- The cue can't be reused, translated consistently, filtered, or surfaced in the
  library/detail view as structured info.
- The same movement's tempo is re-described ad-hoc per program instead of living
  once on the canonical exercise.

This plan adds a **structured execution model** to the canonical exercise, backfills
it from the existing cues, and makes the player render it properly — while keeping
`note` for anything that doesn't fit a field.

## Current state (verified)

Tempo/execution is **free-text only**. Relevant fields on the `Exercise` type
(`packages/core/types/index.ts`, ~lines 15–40 — re-read for exact shape):
`reps: string`, `rest: number`, `isTimer?: boolean`, `timerSeconds?: number`,
`note: string`. **No** `tempo` / `eccentric` / `pause` / `hold` fields exist.

Real examples of cues living in `note`/`reps` (VERBATIM, `packages/core/data/workouts.ts`):

```ts
{ id: "neg_pullup", name: "Dominadas Negativas", sets: 3, reps: "5 (5s bajada)",
  rest: 120, muscles: "Dorsal, bíceps",
  note: "Sube con silla, baja MUY lento 5 segundos. Base para dominadas.",
  youtube: "negative pull up tutorial beginners", priority: "med",
  equipment: ['barra_dominadas'] }
// "Pull-up Estricto" note: "Sin kipping. Pausa 1s arriba."
// "Inverted Row con Pausa" note: "2s de pausa arriba..."
// "Glute Bridge Pausa (3s)" note: "Pausa isométrica 3s arriba."
// "Superman Hold" reps: "10 (3s arriba)"
```

Grep confirms 100+ "segundo(s)", 40+ "pausa/mantén", 30+ "controlado", 15+
"excéntrico" hits — all in `note`/`description`, none structured.

Seed schema (`seeds/exercises/_schema.json`) has `is_timer`,
`default_timer_seconds`, `note:{es,en}` — **no tempo/eccentric/pause fields**
either.

Player consumption (additive change target):

- Web `apps/web/src/components/SessionView.tsx:453-457` renders `exercise.note`
  as an italic box; line ~480 renders `<Timer initialSeconds={exercise.timerSeconds} .../>`
  only when `exercise.isTimer`.
- Mobile `apps/mobile/src/components/SessionView.tsx:514-518` renders `note`;
  line ~537 `<ExerciseTimer initialSeconds={exercise.timerSeconds || 30} />` when
  `isTimer`.

## Design

Add a structured, optional `tempo` to the canonical exercise (seconds per phase,
standard eccentric–pauseBottom–concentric–pauseTop order). Keep `is_timer` /
`timerSeconds` for pure isometric holds; keep `note` for free text.

Type (in `packages/core/types/index.ts`):

```ts
export interface ExerciseTempo {
  eccentric?: number      // seconds lowering / negative phase ("baja en 5s")
  pauseBottom?: number    // seconds paused at the bottom/stretched position
  concentric?: number     // seconds lifting / positive phase ("sube explosivo" ≈ 1)
  pauseTop?: number       // seconds paused at the top/contracted ("pausa 2s arriba")
}
// on Exercise:
tempo?: ExerciseTempo
```

- This models everything seen in the notes: eccentric duration, pause at top
  (most common), pause at bottom, controlled/explosive concentric. A movement's
  pure hold stays on `is_timer`/`timerSeconds`.
- Storage: add a `tempo` JSON field to PB `exercises_catalog` (and optionally an
  override on `program_exercises`), via a migration that **preserves field ids**
  (`feedback_migration_safety`). Add `tempo` to `seeds/exercises/_schema.json` so
  it flows through the Plan-011 pipeline into the bundled JSON.
- The seed files become the source of truth for tempo (like description).

Backfill (one-time, semi-automated + human review):
- Write a parser that scans existing `note` + `reps` text for cues and proposes a
  `tempo` object: `"baja ... (\d+) ?s|segundos"` → `eccentric`; `"pausa|mantén
  ... (\d+) ?s ... arriba"` → `pauseTop`; `"... arriba" + (\d+)s` in reps →
  `pauseTop`; `"isométrica (\d+)s"` → likely `is_timer`/hold; `"explosivo|fuerte"`
  → `concentric: 1`; `"lento|controlado"` without a number → leave to review.
- Output a **proposal file for human review** (do NOT auto-write tempo from fuzzy
  text — wrong tempo misleads training). After review, write the approved `tempo`
  into the seed files.

Player (additive, both platforms):
- When `exercise.tempo` is present, render a compact, localized tempo line/badge
  near the reps — e.g. "Tempo: baja 5s · pausa 2s arriba" / "Tempo 5-2-1-0".
- Keep rendering `note` for the remaining free text.
- **v1 does NOT auto-drive a per-phase guided timer** (beeping each phase) — that
  is a larger UX feature; explicitly deferred. v1 is model + display.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Core tests | discovered runner (plan 009 caveat) | pass |
| Web build | `cd apps/web && npm run build` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 |
| Find tempo cues | `grep -rnE '(\d+) ?s(egundos)?|pausa|mantén|lento|controlado|excéntric|explosiv' packages/core/data/workouts.ts seeds/exercises` | the cue corpus |

## Scope

**In scope**: `packages/core/types/index.ts` (add `ExerciseTempo`+`tempo`),
`seeds/exercises/_schema.json` + the seed `*.json` files (add reviewed `tempo`),
a PB migration adding `tempo` (field-id-preserving), a backfill/parse script
(`scripts/extract-tempo.mjs`, proposal-first), the Plan-011 generator step to
carry `tempo` into the bundled catalog, web + mobile `SessionView` (render tempo),
`scripts/seed-exercises.mjs` (write `tempo` to PB), `advisor-plans/README-exercise-data.md`.

**Out of scope**: a per-phase guided/beeping timer (deferred), changing
`reps`/`rest` semantics, media (Plan 014), any `sets_log` change.

## Git workflow

- Branch: `advisor/013-structured-exercise-tempo` (from `main`).
- Explicit paths in `git add`. Commit style:
  `feat(core): structured exercise tempo (eccentric/pause/hold) + player display`
- No push/PR/merge/rebase without the operator's say-so.

## Steps (summary — each gated by typecheck/build + review)

1. Add `ExerciseTempo` + `tempo?` to the type; typecheck.
2. Add `tempo` to the seed schema + a PB migration (preserve field ids).
3. Write `scripts/extract-tempo.mjs` → **proposal file**; human-review; write
   approved `tempo` into seeds. (Do not auto-commit unreviewed tempo.)
4. Extend the Plan-011 generator + `seed-exercises.mjs` so `tempo` flows to the
   bundled JSON and PB.
5. Render `tempo` in web + mobile `SessionView` (localized), keeping `note`.
6. Tests + build gate; update the index.

**Verify** highlights: `grep -n 'tempo' packages/core/types/index.ts` → present;
parser has unit tests for the cue→tempo extraction (pure function); web build +
mobile typecheck exit 0; a spot-check exercise (neg_pullup) shows
`tempo.eccentric === 5`.

## Test plan

The **cue parser is pure → fully unit-tested** (this is the regression-critical
piece): assert `"baja MUY lento 5 segundos"` → `{eccentric:5}`, `"Pausa 1s
arriba"` → `{pauseTop:1}`, `"5 (5s bajada)"` (reps) → `{eccentric:5}`, ambiguous
text (`"lento"` no number) → no numeric guess (left for review). The player change
is verified via manual smoke (a tempo exercise shows the structured line; a
non-tempo one is unchanged).

## Done criteria

- [ ] `ExerciseTempo` + `tempo?` exist on the type; seeds + PB schema carry `tempo`.
- [ ] Backfill proposal was human-reviewed; approved `tempo` written to seeds (report coverage count).
- [ ] `tempo` flows into the bundled catalog via the Plan-011 generator.
- [ ] Web + mobile `SessionView` render the structured tempo when present (manual smoke confirms).
- [ ] Parser unit tests pass; `cd apps/web && npm run build` + `cd apps/mobile && npm run typecheck` exit 0.
- [ ] PB migration preserves field ids (no data loss).
- [ ] `advisor-plans/README-exercise-data.md` plan 013 row updated.

## STOP conditions

- 011's seeds→catalog pipeline does not exist yet (tempo has nowhere to flow) —
  do 011 first or coordinate.
- The parser would auto-write tempo without human review — STOP; unreviewed tempo
  from fuzzy text is worse than none.
- A PB migration requires dropping/recreating a field — use the field-id-preserving
  pattern instead.

## Maintenance notes

- A **guided tempo player** (count/beep each phase, drive the rest timer from
  `tempo`) is the natural follow-up once the data exists — scope it separately.
- Once `tempo` coverage is high, consider deprecating tempo-in-`reps`
  (`"5 (5s bajada)"`) so `reps` is purely a count/range and tempo is structured.
- `note` remains for genuinely free-form coaching that doesn't map to a field.
