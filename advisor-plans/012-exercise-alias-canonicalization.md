# Plan 012: Exercise alias / canonicalization layer (`resolveExerciseId`, populate `variant_of`)

> **Executor instructions**: Follow step by step; run every verification; obey
> STOP conditions. Update this plan's status row in `advisor-plans/README-exercise-data.md` when
> done.
>
> **Drift check (run first)**:
> `git diff --stat 943f558..HEAD -- packages/core/data/exercise-catalog.json packages/core/types/index.ts packages/core/lib`
> Confirm the "Current state" facts (especially that `variant_of`/`promoted_from`
> exist on the type but are unpopulated) before proceeding.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (introduces id rewriting at log time — must be conservative)
- **Depends on**: 011 (needs the unified catalog + `seeds/exercises/_id-map.json`)
- **Category**: data-integrity / UX
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

Even after the catalog is unified (Plan 011), there is still **no runtime
mechanism to map a variant spelling or a user-typed/custom name to the canonical
exercise id**. The request — *"one exercise could have different names"* — needs a
resolver so that:

- a custom-entered "Pull Ups" / "pull-up" / "dominadas" resolves to the canonical
  `pullup_*` id instead of creating a brand-new orphan history;
- alternate ids (kebab slug from the picker, legacy variants) collapse onto one
  canonical id;
- the catalog's existing-but-empty `variant_of` field is actually used.

This is the last piece that makes score tracking robust across naming variation.

## Current state

- `packages/core/types/index.ts` — the `Exercise` type already declares
  `variant_of` and `promoted_from` (optional) but they are **null/undefined for
  every catalog entry** (verified in the audit). The fields are "prepared but
  unused."
- `packages/core/lib/wger-mappings.ts` — already contains slug normalization
  (`normalize('NFD')` → strip accents → kebab) used for wger import; **reuse this
  normalizer**, do not write a second one.
- `packages/core/lib/i18n-db.ts` — `localize()` resolves a `{es,en}` field to a
  display string; the resolver will need names in both locales to build the alias
  index.
- `packages/core/hooks/useProgress.ts` — `logSet(exerciseId, ...)` writes the id
  verbatim (Plan 009 reference). The resolver should be applied to ids that come
  from **free-text / custom** entry, NOT to ids that already come from the catalog
  (those are already canonical).
- `seeds/exercises/_id-map.json` — from Plan 011, slug → canonical id. The
  resolver's backbone.
- `LogWorkoutPage.tsx` — `makeCustomId(name)` builds `custom_<name>` ids for
  off-catalog entries (VERBATIM, from the audit):
  ```tsx
  function makeCustomId(name: string): string {
    return `custom_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`
  }
  ```
  This is exactly where unresolved variants leak in — a custom name that *is* a
  catalog exercise still gets a `custom_` id.

## Design

Create `packages/core/lib/resolveExerciseId.ts`:

```ts
/**
 * Resolve an arbitrary exercise id OR a human-typed name to the canonical
 * catalog id. Conservative: returns the input unchanged when there is no
 * confident match (never guesses across exercises).
 */
export function resolveExerciseId(input: string): string
```

Resolution order (first confident hit wins):
1. **Exact canonical id** — `input` is already a catalog id → return as-is.
2. **Slug map** — `input` (or its normalized form) is a key in `_id-map.json` →
   return mapped canonical id (handles kebab slug from the picker).
3. **Alias index** — build, at module load, a `Map<normalizedName, canonicalId>`
   from every catalog entry's `{es,en}` name (+ any future `aliases` array). If
   `normalize(input)` hits → return that id. (`normalize` = reuse
   `wger-mappings.ts`.)
4. **No confident match** — return `input` unchanged (so `makeCustomId` still
   produces a stable custom id; no false merges).

Explicitly **do NOT** use fuzzy/Levenshtein matching in v1 — a wrong fuzzy match
silently merges two different exercises' scores, which is worse than a split.
Fuzzy suggestions belong in the *search* UI (offer "did you mean"), not in
identity resolution.

Wire-in points:
- `LogWorkoutPage.tsx` custom path: before `makeCustomId`, try
  `resolveExerciseId(typedName)`; only fall back to `makeCustomId` if it returns
  the input unchanged.
- (Optional) `useProgress.checkAndUpdatePR` / `logSet`: resolve the id at the
  boundary so PRs and history always key on canonical ids.

Populate `variant_of`: in the catalog (via the Plan 011 generator), set
`variant_of` on entries that the `_id-map` reconciliation identified as the same
movement, so the resolver and any "exercise family" UI can group them.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Core tests | discovered runner (plan 009 caveat) | pass |
| Web typecheck/build | `cd apps/web && npm run typecheck && npm run build` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 |
| Confirm normalizer reuse | `grep -n 'normalize' packages/core/lib/wger-mappings.ts` | the existing normalizer |

## Scope

**In scope**: `packages/core/lib/resolveExerciseId.ts` (create) + its test,
`apps/web/src/pages/LogWorkoutPage.tsx` (wire the custom path), optionally
`packages/core/hooks/useProgress.ts` (resolve at log boundary), the Plan-011
generator step that populates `variant_of`, `advisor-plans/README-exercise-data.md`.

**Out of scope**: fuzzy matching, any `sets_log` data migration (Plan 011 Phase
D), search-UI "did you mean" (separate UX task), schema changes beyond using the
already-declared `variant_of`.

## Git workflow

- Branch: `advisor/012-exercise-alias-canonicalization` (from `main`).
- Explicit paths in `git add`. Commit style:
  `feat(core): resolve exercise names/variants to a canonical id`
- No push/PR/merge/rebase without the operator's say-so.

## Steps

1. **Build the resolver + alias index** (`resolveExerciseId.ts`), reusing the
   `wger-mappings.ts` normalizer and loading `_id-map.json` + the catalog names.
   Make it pure and synchronous (catalog + map are static imports).
2. **Unit-test it** (this is the core deliverable's safety net): exact id passes
   through; a kebab slug maps via `_id-map`; an es name and an en name both
   resolve; an unknown string returns unchanged (no false merge); accents/case
   handled.
3. **Wire the LogWorkoutPage custom path** to try the resolver before
   `makeCustomId`.
4. **Populate `variant_of`** in the Plan-011 generator (or as a follow-up step in
   the catalog data) for movements the id-map flagged as the same family.
5. **Typecheck/build/test gate**; update the index.

**Verify** (per step): resolver tests pass; `grep -n 'resolveExerciseId'
apps/web/src/pages/LogWorkoutPage.tsx` → ≥1; web build + mobile typecheck exit 0.

## Test plan

The resolver is pure → fully unit-testable and that is where coverage lives.
Critical assertions: (1) **never** merge an unknown name onto an existing id
(returns input unchanged), (2) exact-id and slug-map paths are deterministic,
(3) both locales' names resolve. Add a regression case for each real ambiguity
found during Plan 010/011 (e.g. the thoracic pair).

## Done criteria

- [ ] `packages/core/lib/resolveExerciseId.ts` exists, pure, with the 4-step resolution order.
- [ ] Resolver unit tests pass, including the "unknown → unchanged (no false merge)" case.
- [ ] `LogWorkoutPage` custom path calls `resolveExerciseId` before `makeCustomId`.
- [ ] `variant_of` is populated for reconciled families in the catalog.
- [ ] `cd apps/web && npm run build` and `cd apps/mobile && npm run typecheck` exit 0.
- [ ] `advisor-plans/README-exercise-data.md` plan 012 row updated.

## STOP conditions

- `seeds/exercises/_id-map.json` (Plan 011) does not exist yet — 012 depends on it.
- Any temptation to add fuzzy matching to identity resolution — STOP; that belongs
  in search UX, not here (false merges corrupt scores).
- Wiring the resolver into `logSet` changes ids for exercises that were already
  canonical — verify the resolver is a no-op on canonical ids before enabling it
  at the log boundary.

## Maintenance notes

- The alias index is built from catalog names; when Plan 013 or future work adds
  an explicit `aliases: string[]` to the canonical record, fold it into step 3 of
  the resolver — that is the cleanest long-term home for synonyms (e.g.
  "dominadas" ↔ "pull-up").
- Keep identity resolution conservative forever. Suggestions/"did you mean" can be
  fuzzy; the id that gets written to history must not be.
