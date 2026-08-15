# packages/core/lib/ + packages/core/data/ + packages/core/types/ + packages/core/locales/ (structure)

## Grade

**B** — The domain logic is disciplined: purity is mostly respected (side-effecting modules are usually isolated), types are centralized with almost no `any`, and several modules carry excellent "why" documentation that references the bugs they fixed. It loses a full grade for one concrete, measured bundle-size problem (a 2.6MB minified JSON chunk imported statically from ~8 call sites with zero code-splitting) and a stack of smaller DRY/dead-code items that show the codebase growing faster than its own cleanup passes.

## Top 3 refactors

1. **Stop importing `exercise-catalog.json` eagerly.** Build one shared, lazily-loaded catalog index module (id/slug/family/media all indexed once) and have `catalogMedia.ts`, `resolveExerciseId.ts`, `variants.ts`, and the ~8 app call sites consume it via dynamic `import()` behind the routes that actually need it. This is the single highest-leverage change in scope — it currently ships a 2.6MB chunk to any user who opens the exercise library, detail page, free session, or log-workout screen.
2. **Extract a generic "owner-only GPS route store" factory** and rebuild `cardioRoutes.ts` and `raceRoutes.ts` on top of it — they are explicitly documented as twins and duplicate the same upsert/fetch/chunk logic against two parallel PocketBase collections.
3. **Finish or delete the `METRIC_LABELS` deprecation** (and sweep the other 14 confirmed dead exports below) — a `@deprecated` export sitting next to its unused replacement, both with zero consumers, is a small thing but it's a symptom: nothing currently greps for orphaned exports in this package, so they accumulate silently.

## Findings

### High

- **`packages/core/lib/catalogMedia.ts:11`, `resolveExerciseId.ts:15`, `variants.ts:9`, `apps/web/src/pages/{ExerciseLibraryPage,ExerciseDetailPage,FreeSessionPage,LogWorkoutPage}.tsx`, `apps/web/src/components/free-session/SessionPreview.tsx`, `apps/mobile/src/lib/catalog.ts:5`** — `import catalog(Data) from '../data/exercise-catalog.json'` (3.3MB / 71,318 lines on disk) is a static top-level import at every one of these sites; no `React.lazy`/dynamic `import()` anywhere in the chain. Verified in the built web bundle: `apps/web/dist/assets/exercise-catalog-hlGfYtCa.js` is **2.6MB minified**, its own chunk, loaded whenever any of those routes mount. Category: **React-perf (bundle-dynamic-imports / bundle-conditional)**. Fix: one shared lazy-loaded catalog module with an `import()`-based loader; pages that only need one exercise (`ExerciseDetailPage`) shouldn't pull the whole catalog either way.
- **`packages/core/lib/catalogMedia.ts:20-31`, `resolveExerciseId.ts` (`flattenCatalog`), `variants.ts`** — three separate modules each independently iterate `Object.values(catalog.categories).flatMap(c => c.exercises)` to build their own index (by id/slug for media, by id/slug/name for id-resolution, by family for variants) over the *same* 3.3MB structure at module-load time. Category: **DRY**. Fix: one shared `flattenCatalog()` + one shared entry-by-id Map, each of the three consumers derives its specific index from that.

### Medium

- **`packages/core/lib/cardioRoutes.ts:52-88` vs `raceRoutes.ts:32-64`** — identical shape: `getFirstListItem(filter) → update`, catch → `create`, catch → swallow (for save); `getFirstListItem → toPoints`, catch → `[]` (for fetch). `raceRoutes.ts:3` literally says *"Gemela de `cardioRoutes.ts` (#299) y por el mismo motivo"* (twin, for the same reason). Category: **DRY**. Fix: `createOwnerRouteStore(collection, fkField)` factory shared by both.
- **`packages/core/lib/money.ts:5` doc vs `packages/core/lib/shopping.ts:369-371`** — money.ts's own header comment says amounts should be "redondear solo al presentar (formatMoney)" as if `formatMoney` belongs to the currency module, but it's actually defined in `shopping.ts` (`export function formatMoney(n) { return n.toFixed(2) }`) and every one of its ~15 consumers across web/mobile imports it from `@calistenia/core/lib/shopping`, not `.../lib/money`. Category: **SOLID-SRP / doc-code mismatch**. Fix: move `formatMoney` into `money.ts` (it's currency-generic, shopping-agnostic) and re-export from `shopping.ts` if call sites must stay stable short-term.
- **Inconsistent I/O-vs-pure naming convention in `lib/`** — `battleApi.ts`, `plan-api.ts`, `pantry-api.ts`, `ai-jobs-api.ts` are clearly flagged as PocketBase/HTTP clients by their `*-api.ts` suffix, but `activeSessionSync.ts`, `battleRealtime.ts`, `monthActivity.ts`, `serverClock.ts`, `timezone-sync.ts`, `buildInsightContext.ts`, `cardioRoutes.ts`, `raceRoutes.ts` all call `pb.collection(...)`/`fetch(...)` too, with no naming signal. Grep confirms 14 non-excluded lib files reference `pb.` and 6 call `fetch(`. Category: **Separation-of-concerns / naming**. Fix: either rename consistently or (better) keep the current split but add a one-line `// I/O: talks to PocketBase` header banner convention so "is this file pure?" is answerable without reading it.
- **`packages/core/lib/challenges.ts:19-33`** — `METRIC_LABELS` (`const`, line 29) is explicitly annotated `/** @deprecated Use getMetricLabels() for reactive labels */`, but repo-wide grep shows **zero consumers of either `METRIC_LABELS` or `getMetricLabels()`**, and `METRIC_UNITS` (line 36) is also unused anywhere. Category: **KISS / dead code**. Fix: delete all three, or finish wiring `getMetricLabels()` into whatever UI shows metric names (currently it must be inlining i18n keys some other way).
- **`packages/core/lib/pr-utils.ts:8-13` (`parseRepsForPR`) vs `packages/core/lib/cumulative-scoring.ts:31-53` (`parseRepsTotal`)** — two free-text "reps" tokenizers with overlapping regex vocabulary (`\d+`, `NxM`, `A-B` ranges) built independently: one picks the max digit for PRs, the other sums per-segment for cumulative totals. Intentionally different *semantics*, but the low-level range/multiply parsing is reinvented rather than shared, so a future syntax addition (e.g. a new separator) has to be taught to both by hand. Category: **DRY**. Fix: extract a shared `tokenizeRepsSegments(reps): number[]` that both build on.
- **`packages/core/lib/nutritionGoal.ts:72-84`** — two parallel `switch (goal)` statements over the same three goals (`muscle_gain`/`fat_loss`/`recomp`) computing `dailyCalories` delta and `proteinPerKg` respectively. Category: **SOLID-OCP**. Fix: one `Record<NutritionGoal, { calorieDelta: number; proteinPerKg: number }>` table, consistent with the good table-driven pattern already used in `challenge-presets.ts` and `PR_PATTERNS` in `challenge-scoring.ts`.

### Low

- **`packages/core/lib/battle.ts`** (563 lines, largest file in scope) mixes five concerns in one pure module: status/participant state machines (13-64), config validation (70-114), score comparison (116-172), activity/rest derivation (247-330), and a full UI-facing result-view/outcome derivation (432-555). All pure and well-documented, but big enough to be worth splitting into `battle-transitions.ts` / `battle-scoring.ts` / `battle-result.ts` for navigability. Category: **SOLID-SRP**.
- **`packages/core/types/index.ts:609`** — `data?: Record<string, any>` on `NotificationRecord` is the only `any` found in the entire 1,423-line `types/` scope (otherwise clean). Category: **KISS / type-safety escape**. Fix: a discriminated union keyed by `NotificationType` would let each notification kind's payload be typed.
- **`packages/core/lib/shopping.ts:59-65` (`addDaysISO`) vs `packages/core/lib/dateUtils.ts:86-88` (`addDays`)** — two independent "add N days to a `YYYY-MM-DD` string" implementations: `dateUtils.addDays` goes through `dayjs.tz(dateStr, _tz)` (timezone-aware, injectable), `shopping.addDaysISO` does raw `new Date(y, m-1, d+days)` component math (always local-machine calendar, no tz injection). Both are individually correct today, but they can diverge at DST boundaries and there's no test pinning them to the same answer. Category: **DRY**. Fix: have `shopping.ts` import `addDays` from `dateUtils.ts`.
- **`packages/core/data/exercise-catalog.base.json`** (187KB) has zero runtime importers anywhere in `apps/` or `packages/core` (confirmed via repo-wide grep) — it appears to be a build-time input for `scripts/build-exercise-catalog.mjs` (per the comment in `muscles.ts:5`), but sitting inside `data/` next to files that *are* bundled at runtime makes it easy to mistake for live data. Category: **KISS**. Fix: a one-line comment at the top of the file (or moving it under `scripts/`) would remove the ambiguity. Not independently verified against the build script.
- **15 confirmed zero-usage exported functions/consts** (repo-wide grep, excluding the file that defines each, across `apps/`, `packages/`, `pb_hooks/`, `mcp-server/`):
  - `packages/core/lib/battle.ts:39` `canTransitionBattle`
  - `packages/core/lib/battle.ts:49` `canTransitionBattleParticipant`
  - `packages/core/lib/battle.ts:32` `BattleContractError`
  - `packages/core/lib/battle.ts:13` `BATTLE_STATUS_TRANSITIONS`
  - `packages/core/lib/battle.ts:23` `BATTLE_PARTICIPANT_TRANSITIONS`
  - `packages/core/lib/battleInviteHandoff.ts:34` `hasPendingBattleInvite`
  - `packages/core/lib/battleInviteHandoff.ts:39` `discardBattleInviteToken`
  - `packages/core/lib/challenges.ts:20` `getMetricLabels`
  - `packages/core/lib/challenges.ts:29` `METRIC_LABELS` (see Medium finding above)
  - `packages/core/lib/challenges.ts:36` `METRIC_UNITS`
  - `packages/core/lib/cumulative-scoring.ts:20` `CUMULATIVE_METRICS`
  - `packages/core/lib/quotes.ts:8` `getLocalQuotes`
  - `packages/core/lib/timezone-sync.ts:20` `detectDeviceTimezone`
  - `packages/core/lib/ai-jobs-api.ts:53` `submitLookupFoodJob`
  - `packages/core/lib/activeSessionSync.ts:25` `MAX_REMOTE_SESSION_AGE_MS`
  - `packages/core/lib/nutritionGoal.ts:17` `ACTIVITY_MULTIPLIERS`
  - `packages/core/types/battle.ts:8` `BATTLE_STATUSES`
  - `packages/core/types/battle.ts:20` `BATTLE_PARTICIPANT_STATUSES`

  (Note: `canTransitionBattle` has a same-named function in `pb_hooks/utils/battles.js` — a parallel JS reimplementation for the goja/server runtime, not a real consumer of the TS export; that cross-runtime duplication is out of this scope's remit but worth flagging to whoever owns `pb_hooks/`.) A broader automated sweep also flagged ~100 exported `interface`/`type` names with no by-name external import, but these are almost all false positives (TS infers structural types without importing the name), so they're omitted here for evidence quality — only function/const/class exports (which require an explicit import to be used) are listed above.

## Done well

- `cardioRoutes.ts`, `raceRoutes.ts`, `plan-api.ts`, `plan-shopping.ts`, `shopping.ts`, and `exerciseMedia.ts` all carry deliberate header comments explaining *why* the module boundary exists, often citing the specific bug or incident that motivated it (e.g. `plan-api.ts:1-9` explicitly documents that it replaced three duplicated "generate a plan" wrappers spread across `pantry-api.ts`/`ai-jobs-api.ts`). This is genuinely good practice for a shared package multiple apps depend on.
- `types/` (1,423 lines across 6 files) has essentially zero duplication — each domain concept (`Challenge`, `GpsPoint`, `PantryItem`, etc.) is defined exactly once and imported everywhere else, and only one `any` escape was found in the whole directory.
- `packages/core/locales/es/translation.json` and `en/translation.json` are in perfect lockstep — 4,331 keys each, 0 missing on either side (verified programmatically), consistent with the recently-merged usage/duplicate-key guardrails (#444/#445).
- `challenge-presets.ts`, `battle-presets.ts`, and `circuit-presets.ts` are properly table-driven (arrays of config objects), not switch/if chains — the right pattern that `nutritionGoal.ts` (Medium finding above) should follow too.
- `cumulative-scoring.ts`'s `sumExerciseTotal` docstring (lines 63-79) documents a real historical undercounting bug and why the chosen dedup key avoids it — the kind of "why" comment that prevents regressions.

## Files reviewed

**Read fully:** `challenge-scoring.ts`, `cumulative-scoring.ts`, `express-progress.ts`, `pr-utils.ts`, `cardioRoutes.ts`, `raceRoutes.ts`, `geo.ts` (partial, math section), `battle.ts` (full), `battleApi.ts` (head + exports), `battleInviteHandoff.ts`, `pantry.ts`, `pantry-api.ts` (head), `plan-api.ts` (head), `plan-shopping.ts` (head), `shopping.ts` (full), `money.ts`, `spend.ts` (grep only), `storage-keys.ts`, `catalogMedia.ts`, `resolveExerciseId.ts` (head), `variants.ts` (head), `challenges.ts` (head), `challenge-presets.ts` (head), `nutritionGoal.ts` (switch sections), `duration.ts`, `meal-time.ts` (exports), `buildInsightContext.ts` (structure + console usage), `monthActivity.ts` (structure + console usage), `workouts.ts` (head), `types/index.ts` (structure, `any` grep), `types/pantry.ts` (exports), `types/battle.ts` (grep), `types/health.ts` (grep), locale JSON files (programmatic key-diff).

**Skimmed (line counts, grep patterns, targeted excerpts only):** everything else in `packages/core/lib/*.ts` (~140 files), `packages/core/data/*.ts` and `*.json`, `packages/core/types/onboarding.ts`, `race.ts`, `community-program.ts`.

**Out of scope, not reviewed:** `query-client.ts`, `query-keys.ts`, `pocketbase.ts`, `optimistic.ts`, `offlineQueue.ts` (per assignment), `hooks/`, `apps/*`, translation *content* (only structure/key-sync checked).
