# Cross-app duplication & SoC audit (apps/web/src ↔ apps/mobile/src ↔ packages/core)

Scope: the *boundary* between the two apps and the shared package. Not an in-depth review of either app
(other agents own those) — only logic that exists in two or more places, or that lives in an app while
being platform-agnostic.

## Grade

**C+**

`packages/core` is genuinely good — ~37.6k lines, 78 hooks, ~110 lib modules, most with colocated tests, a
clean `platform.ts` adapter, a centralized `qk` query-key factory that the apps actually use (0 raw
`queryKey:` literals in web, 1 in mobile). The problem is not the absence of abstractions, it is that the
**session/realtime orchestration layer was never migrated** and that **web repeatedly bypasses abstractions
core already exports**. By my measurement roughly **2,800–3,000 lines of platform-agnostic business logic**
sit in `apps/*` instead of `packages/core`, including **330 lines that are byte-for-byte identical** between
the two apps. That duplication has already produced at least one live behavioral divergence (F-01) and one
silently-degraded GPS path (F-02). Foundation A, boundary discipline D.

## Top 3 refactors

1. **Move `lib/race/{raceApi,raceRealtime,errors}.ts` into core verbatim** (330 byte-identical lines, zero
   platform imports). The repo already did exactly this for `raceClock.ts` → `core/lib/serverClock.ts` with a
   re-export shim, so the pattern, the precedent and the migration note are already written down. This is a
   near-zero-risk mechanical move.
2. **Adopt `core/lib/cardio-fix.ts` in web's `CardioSessionContext`.** Core ships a tested 186-line pure GPS
   pipeline whose own docblock claims it is the one used by "mobile *y la web*" — but web still inlines two
   divergent copies, one of which silently lacks gap/jitter handling.
3. **Extract the four session contexts to a shared core layer** (`ActiveSession`, `Circuit`, `Cardio`, `Race`
   — 80–92% identical). They differ only in storage backend, app-lifecycle event source, and an analytics tag.
   Core already owns `storage` and `CoreConnectivity`; it needs one more slot: an app-lifecycle
   (foreground/background) adapter. That single addition unblocks ~1,600 duplicated lines.

## Top 8 extractions to core, ranked by impact × ease

Impact = duplicated/misplaced lines eliminated + bug classes closed. Ease = 5 is a mechanical move,
1 needs a new core abstraction first.

| # | Extraction | Lines freed | Impact | Ease | Score | Finding |
|---|---|---|---|---|---|---|
| 1 | `lib/race/{raceApi,raceRealtime,errors}.ts` → `core/lib/race/` | ~330 | 4 | **5** (byte-identical, precedent exists) | 20 | F-03 |
| 2 | Web adopts `processCardioFix` from `core/lib/cardio-fix.ts` | ~120 | **5** (closes a live GPS bug) | 4 | 20 | F-02 |
| 3 | `use-pantry-depletion.ts` → `core/hooks/usePantryDepletion.ts` | ~78 | 3 | **5** (diff is 3 lines) | 15 | F-11 |
| 4 | `detectDayType` → `core/lib/detect-day-type.ts` | ~53 | 3 | **5** (byte-identical) | 15 | F-15 |
| 5 | Storage keys → named consts in `core/lib/storage-keys.ts` + registry | ~25 | **5** (closes cross-account leak) | 3 | 15 | F-07 |
| 6 | Onboarding writes → `core/hooks/useOnboardingSubmit.ts` | ~90 | 4 | 3 | 12 | F-04 |
| 7 | Public-profile loader → `core/hooks/usePublicProfile.ts` | ~80 | 4 | 3 | 12 | F-05 |
| 8 | Session contexts → shared core layer (needs a `lifecycle` platform slot) | ~1,600 | **5** | 1 | 5 | F-10, F-01 |

Items 1–5 are a single afternoon's work and cover two real bugs. Item 8 is the big one but must wait on the
`CorePlatform.lifecycle` addition; do it after 1–7 so the contexts are already thinner.

---

## Twin file map

Overlap = `difflib` ratio on comment/blank-stripped lines. "IDENT" = byte-identical files.

| Twin | web path (lines) | mobile path (lines) | core equivalent | Overlap | What should move to core |
|---|---|---|---|---|---|
| detectDayType | `utils/detectDayType.ts` (53) | `lib/detect-day-type.ts` (53) | — | **100% IDENT** | Entire file (pure fn + `MUSCLE_MAP`) |
| race API | `lib/race/raceApi.ts` (223) | `lib/race/raceApi.ts` (223) | partial (`raceRoutes`, `race-sort`) | **100% IDENT** | Entire file |
| race realtime | `lib/race/raceRealtime.ts` (79) | `lib/race/raceRealtime.ts` (79) | — | **100% IDENT** | Entire file |
| race errors | `lib/race/errors.ts` (28) | `lib/race/errors.ts` (28) | — | **100% IDENT** | Entire file |
| race clock | `lib/race/raceClock.ts` (14) | `lib/race/raceClock.ts` (14) | `lib/serverClock.ts` ✅ | shim | **Already done** — reference pattern |
| pantry depletion | `components/pantry/use-pantry-depletion.ts` (78) | same path (80) | — | **92.9%** | Whole hook; diff is 1 import + 2 haptics calls |
| Circuit session | `contexts/CircuitSessionContext.tsx` (505) | same (502) | — | **92.3%** | Reducer/state machine + persistence + unsaved queue |
| Race context | `contexts/RaceContext.tsx` (577) | same (535) | — | **88.7%** | Orchestration, countdown, participant merge |
| Workout context | `contexts/WorkoutContext.tsx` (126) | same (144) | `usePrograms`/`useProgress` ✅ | **87.6%** | Whole context (it is a passthrough shell) |
| Active session | `contexts/ActiveSessionContext.tsx` (368) | same (304) | — | **80.3%** | Persistence, 24h expiry, cross-device adoption |
| race tracker | `lib/race/raceTracker.ts` (134) | same (135) | `lib/geo.ts` (haversine) | **77.7%** | Distance/pace accumulation; keep `expo-location` split |
| Cardio session | `contexts/CardioSessionContext.tsx` (749) | same (683) | `lib/cardio-fix.ts` ✅ *(mobile only)* | **66.6%** | Web must adopt `processCardioFix` |
| race snapshot | `lib/race/raceSnapshot.ts` (49) | same (47) | — | **68.2%** | Serialization shape; keep storage split |
| Onboarding flow | `components/onboarding/OnboardingFlow.tsx` (374) | same (412) | `lib/onboarding-state.ts` (state only) | **67.9%** | The 4 PB writes (`users`×3 + `body_measurements`) |
| Emoji picker | `components/social/EmojiPicker.tsx` (47) | same (57) | — | 62.5% | Emoji list + color map |
| Circuit builder | `components/circuit/CircuitBuilder.tsx` (549) | same (495) | `data/circuit-presets.ts` | 52.0% | Validation + preset application |
| Meal logger | `components/nutrition/MealLoggerContent.tsx` (1441) | `use-meal-logger.ts` (603) + `meal-logger-shared.ts` (127) | `useMealLoggerActions` (122) | *see F-06* | capture→analyzing→review→saving→success machine |
| Public profile | `pages/UserProfilePage.tsx` (630) | `app/u/[id].tsx` (481) | — | *see F-05* | The 5-query public-profile loader |
| Share links | `lib/share.ts` (172) | `lib/share.ts` (373) | — | *see F-09* | `BASE_URL` + all URL builders |
| Streak milestone | `components/StreakMilestone.tsx` (98) | `lib/streak-milestones.ts` (40) | — | *see F-08* | `MILESTONES` + `getActiveMilestone` + persistence |

## `pb.collection(` call sites per app

Totals: **web 91 calls / 32 files**, **mobile 71 calls / 18 files**, **core 387 calls**. Core does hold the
majority, but the app-side tail is where the twins live.

| # | File | Calls | Note |
|---|---|---|---|
| 1 | `apps/web/src/lib/race/raceApi.ts` | 15 | byte-identical to mobile twin ↓ |
| 2 | `apps/mobile/src/lib/race/raceApi.ts` | 15 | byte-identical to web twin ↑ |
| 3 | `apps/mobile/src/lib/health/sync.ts` | 12 | mobile-only (Health Connect) — legitimate |
| 4 | `apps/web/src/pages/UserProfilePage.tsx` | 6 | twin of #8 — same 5 queries (F-05) |
| 5 | `apps/web/src/pages/ProgramDetailPage.tsx` | 6 | |
| 6 | `apps/web/src/pages/ProfilePage.tsx` | 6 | twin of #9 — same users+nutrition_goals r/w |
| 7 | `apps/web/src/pages/AdminPage.tsx` | 5 | web-only — legitimate |
| 8 | `apps/mobile/src/app/u/[id].tsx` | 5 | twin of #4 (F-05) |
| 9 | `apps/mobile/src/app/(tabs)/profile.tsx` | 5 | twin of #6 |
| 10 | `apps/web/src/contexts/CardioSessionContext.tsx` | 5 | twin of #11 |
| 11 | `apps/mobile/src/contexts/CardioSessionContext.tsx` | 5 | twin of #10 |
| 12 | `apps/web/src/pages/RoutineViewPage.tsx` | 4 | |
| 13 | `apps/web/src/lib/push-subscription.ts` | 4 | web-only (Web Push) — legitimate |
| 14 | `apps/web/src/components/onboarding/OnboardingFlow.tsx` | 4 | twin of #15 (F-04) |
| 15 | `apps/mobile/src/components/onboarding/OnboardingFlow.tsx` | 4 | twin of #14 (F-04) |

---

## Findings

### High

**F-01 — Copy-paste drift produced a live behavioral divergence in the circuit state machine**
`apps/web/src/contexts/CircuitSessionContext.tsx:250-262` vs `apps/mobile/src/contexts/CircuitSessionContext.tsx:258-260`

```
// web:
if (isLastExercise) {
  // Fin de ronda — igual que en modo circuit: roundRest solo si hay
  // descanso configurado; con restBetweenRounds=0 pasa directo.
  if (circuit.restBetweenRounds > 0) {
// mobile:
if (isLastExercise) {
  // End of round — go to roundRest
  return { ...prev, phase: 'roundRest', completedExercises: prev.completedExercises + 1 }
```
The two files are 92.3% identical, but web gained a `restBetweenRounds > 0` guard that mobile never received.
A circuit configured with `restBetweenRounds = 0` skips the rest phase on web and shows a zero-second
`roundRest` on mobile. Category: **DRY / Correctness-smell**.
*Fix:* extract the reducer into `core/lib/circuit-machine.ts` (pure, no storage) and have both contexts drive it.

**F-02 — Web re-implements `core/lib/cardio-fix.ts` twice, and one copy is silently degraded**
`apps/web/src/contexts/CardioSessionContext.tsx:14`, `:17`, `:210-230`, `:283-350`

```
const MAX_ACCURACY_M = 20
const MIN_POINT_DISTANCE_M = 3
```
`packages/core/lib/cardio-fix.ts:4-6` exports these very constants under the comment
*"Precision tuning (idéntico a la web y al CardioSessionContext)"*, and `processCardioFix()` is a tested
186-line pure pipeline. **Only mobile imports it** (`apps/mobile/src/contexts/CardioSessionContext.tsx:22`);
`apps/web/src/pages/features/CardioPage.tsx:7` is the only other reference and it is a *prose comment*.
Web instead inlines the pipeline **twice in the same file**: the `watchPosition` handler (`:283-350`) which
roughly matches core, and the `visibilitychange` handler (`:210-230`) which has **no gap handling, no jitter
speed check and no split detection** — points ingested when the tab regains focus take a different code path
than points ingested while tracking. Category: **DRY / SOLID-DIP (existing abstraction ignored)**.
*Fix:* delete both inline copies; call `processCardioFix(state, fix, activityType)`.

**F-03 — 330 byte-identical lines of PocketBase race logic duplicated across apps**
`apps/web/src/lib/race/{raceApi.ts,raceRealtime.ts,errors.ts}` ≡ `apps/mobile/src/lib/race/{…}`

```
$ cmp -s apps/web/src/lib/race/raceApi.ts apps/mobile/src/lib/race/raceApi.ts   → BYTE-IDENTICAL
```
All three import **only** from `@calistenia/core` (`lib/pocketbase`, `lib/raceRoutes`, `types/race`) plus
sibling race files — zero platform-specific imports. `raceApi.ts` alone holds 15 `pb.collection()` calls,
`RACE_COUNTDOWN_MS`, `RACE_WINDOW_HOURS` and the whole race lifecycle. Category: **DRY**.
*Fix:* move to `packages/core/lib/race/`, leave re-export shims — exactly what `raceClock.ts` already does
(`apps/*/src/lib/race/raceClock.ts` is a 14-line `export { … } from '@calistenia/core/lib/serverClock'`).

**F-04 — Onboarding persistence handlers are duplicated verbatim, comments included**
`apps/web/src/components/onboarding/OnboardingFlow.tsx:125-175` ≡ `apps/mobile/src/components/onboarding/OnboardingFlow.tsx:138-188`

```
      // Edad/sexo ya no existen en `users` (PII; viven en `nutrition_goals`,
      await pb.collection('users').update(userId, {
        weight: parseDecimal(basics.weight),
```
~58 consecutive lines identical down to the Spanish comments and the `console.warn` fallback. Four PB writes
(`users`×3, `body_measurements` create) plus the PII rationale live in a *presentational wizard component*
in both apps. Core has `lib/onboarding-state.ts` and `types/onboarding.ts` but no persistence hook.
Category: **DRY / Separation-of-concerns**.
*Fix:* `packages/core/hooks/useOnboardingSubmit.ts` exposing `saveBasics/saveGoals/saveHealth`.

**F-05 — The public-profile loader (5 identical PB queries) is written twice**
`apps/web/src/pages/UserProfilePage.tsx:93-168` vs `apps/mobile/src/app/u/[id].tsx:98-155`

```
// both:
const user = await pb.collection('users').getOne(userId, { $autoCancel: false })
stats = await pb.collection('public_user_stats').getFirstListItem(
  pb.filter('user = {:uid}', { uid: userId }), { $autoCancel: false })
```
Same five collections (`users`, `public_user_stats`, `public_prs`, `public_sessions`, `user_programs`), same
filters, same `localMidnightAsUTC(...)` month window, same `let stats: any = {}` (duplicated `any` abuse).
Core already hosts sibling hooks (`usePublicSessionDetail`, `useProfileCompare`), so the slot exists.
Category: **DRY / Separation-of-concerns**.
*Fix:* `packages/core/hooks/usePublicProfile.ts`; both screens become presentational.

**F-06 — Web's meal logger is a 1,441-line god component; mobile already proved the logic is extractable**
`apps/web/src/components/nutrition/MealLoggerContent.tsx` (1441 lines, 26 `useState`) vs
`apps/mobile/src/components/nutrition/use-meal-logger.ts` (603) + `meal-logger-views.tsx` + `meal-logger-steps.tsx`

Both drive the identical `capture → analyzing → review → saving → success` machine
(`MealLoggerContent.tsx:547,918,968,1274,1282`). Mobile extracted it into a hook; web did not — and neither
put it in core, so the extraction can't be shared. The helpers are duplicated outright:

| Helper | web | mobile |
|---|---|---|
| `getDefaultMealType()` (`<10/<15/<18` thresholds) | `:49-55` | `meal-logger-shared.ts:90-96` |
| `LS_LAST_MEAL_TYPE = 'calistenia_last_meal_type'` | `:57` | `meal-logger-shared.ts:98` |
| get/set last meal type | `:61`, `:429` | `:102-118` |
| `MAX_PHOTOS = 5` | `:22` | `meal-logger-shared.ts` |

Mobile's own comment reads *"Hour-based default meal type … (parity with web)"* — the copy is acknowledged.
Category: **DRY / SOLID-SRP**.
*Fix:* promote `use-meal-logger.ts` to `packages/core/hooks/useMealLogger.ts` (it already imports only core
libs + `expo-image-picker`; inject the image picker).

**F-07 — Seven user-scoped storage keys bypass core's registry, so data survives an account switch**
`packages/core/lib/storage-keys.ts:6-7` states: *"IMPORTANTE: si añades una nueva clave global en un hook
offline-first, agrégala aquí también."* These are declared ad-hoc in app files and are **absent** from
`USER_SCOPED_STORAGE_KEYS`:

| Key | Declared at |
|---|---|
| `calistenia_strength_active` | `web/contexts/ActiveSessionContext.tsx:92`, `mobile/contexts/ActiveSessionContext.tsx:79` |
| `calistenia_cardio_active` | `web/contexts/CardioSessionContext.tsx:57`, `mobile/…:79` |
| `calistenia_cardio_unsaved` | `web/…:103`, `mobile/…:125` |
| `calistenia_circuit_active` | `web/contexts/CircuitSessionContext.tsx:50`, `mobile/…:57` |
| `calistenia_circuit_unsaved` | `web/…:51`, `mobile/…:58` |
| `calistenia_free_session_queue` | `web/contexts/ActiveSessionContext.tsx:91`, `web/pages/FreeSessionPage.tsx:67` |
| `calistenia_lumbar_checks` | `web/components/LumbarCheckModal.tsx:22`, `web/components/lumbar/SleepLumbarSection.tsx:23` |

`clearUserStorage()` therefore leaves user A's unsaved cardio/circuit sessions and lumbar history in place for
user B. Note the literals are also duplicated across the two apps rather than imported. Category:
**DRY / Correctness-smell**.
*Fix:* export every key as a named const from `core/lib/storage-keys.ts` and add the user-scoped ones to the
registry.

### Medium

**F-08 — Streak-milestone rules duplicated with *incompatible* persistence**
`apps/web/src/components/StreakMilestone.tsx:8,25-27` vs `apps/mobile/src/lib/streak-milestones.ts:3,8-14`

```
// both:
export const MILESTONES = [7, 14, 30, 60, 100] as const
[...MILESTONES].reverse().find(m => streak >= m && !isMilestoneShown(m, userId)) ?? null
```
Identical rule, but web persists one key per milestone (`calistenia_streak_milestone_{days}_{userId}` = `'true'`)
while mobile persists a JSON array under `streak_milestones_{userId}` — **not namespaced with `calistenia_`**
and written via `AsyncStorage` directly (`:1`) instead of core `storage`. The same user hitting day 7 sees the
celebration once per platform. Category: **DRY / Spaghetti**.
*Fix:* `core/lib/streak-milestones.ts` with one storage schema over `platform.storage`.

**F-09 — Canonical product URLs hardcoded in both apps**
`apps/web/src/lib/share.ts:3` and `apps/mobile/src/lib/share.ts:10`

```
const BASE_URL = 'https://gym.guille.tech'
```
`cardioUrl()` is byte-identical in both; web then inlines `/u/{id}`, `/u/{id}/routine`, `/shared/{id}`,
`/challenges/{id}`, `/session/{date}/{key}`, `/invite/{code}`, `/race/{id}` (`share.ts:51-110`) while mobile
exposes the same routes as named builders (`share.ts:14-35`). A domain change requires edits in two packages.
Sub-finding: `web/src/lib/share.ts:99-105` hardcodes Spanish `` `¡Únete a la carrera "${raceName}"! 🏃` ``
while every sibling uses `i18n.t(...)`. Category: **DRY / Spaghetti (magic strings)**.
*Fix:* `core/lib/share-urls.ts` with `BASE_URL` + all builders; keep the native/Web-Share transports per app.

**F-10 — Four session contexts differ only in storage + lifecycle + an analytics tag**
`apps/{web,mobile}/src/contexts/{ActiveSession,Circuit,Cardio,Race}SessionContext.tsx` — 80.3 / 92.3 / 66.6 / 88.7%

Full diff of `CircuitSessionContext` reduces to four axes:
```
<     localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
>     storage.setItem(STORAGE_KEY, JSON.stringify(data))
<     document.addEventListener('visibilitychange', handler)
>     const sub = AppState.addEventListener('change', (state) => { … })
<     op.track('circuit_started', { …, source: src })
>     op.track('circuit_started', { …, source: src, platform: 'mobile' })
```
Two of the three are already solved in core: `platform.ts:76-80` exports a `storage` object explicitly
documented as *"reemplazo directo"* for localStorage, and `platform.ts:32-42` defines `CoreConnectivity` with
`onOnline`/`onChange`. **Web bypasses both** — 21 raw `window`/`document` listener registrations across
12 files, including `CircuitSessionContext.tsx:470` using `window.addEventListener('online', …)` where core's
`connectivity.onOnline` exists and is consumed by `core/lib/offlineQueue.ts:295`. Category:
**SOLID-DIP / DRY**.
*Fix:* add a `lifecycle: { onForeground, onBackground }` slot to `CorePlatform`; then the contexts are one
shared implementation.

**F-11 — `use-pantry-depletion.ts` is a 78-line business hook copied wholesale**
`apps/web/src/components/pantry/use-pantry-depletion.ts` vs `apps/mobile/src/components/pantry/use-pantry-depletion.ts`

The complete diff is: the Sentry import path, and two `haptics` calls. Its own header says *"port web del hook
mobile"*. No platform API beyond those. Category: **DRY**.
*Fix:* move to `core/hooks/usePantryDepletion.ts`, accept an optional `onFeedback` callback for haptics.
Cheapest win in this report.

**F-12 — `EditMealSheet` hand-rolls `calcMacros` while siblings import it from core**
`apps/web/src/components/nutrition/EditMealSheet.tsx:68-71`

```
food.calories = Math.round(food.baseCal100 * factor)
food.protein  = Math.round(food.baseProt100 * factor * 10) / 10
```
`packages/core/lib/macro-calc.ts:58-72` (`calcMacros`) is the identical formula. The file imports core's
`meal-time` and `dateUtils` (`:8-9`) but not `macro-calc`, even though `MealLoggerContent.tsx:17`,
`MealLoggerPage.tsx:13` and mobile's `use-meal-logger.ts:20` all do. The same file also duplicates the
four-macro summation **twice within itself** (`:104-107` and `:139-142`). Category:
**DRY / SOLID-DIP (existing abstraction ignored)**.
*Fix:* import `calcMacros`; add `sumMealMacros(foods)` to `core/lib/macro-calc.ts`.

**F-13 — `WorkoutContext` is a duplicated passthrough shell with a feature gap**
`apps/web/src/contexts/WorkoutContext.tsx` (126) vs `apps/mobile/src/contexts/WorkoutContext.tsx` (144), 87.6%

Mobile's header: `// Port 1:1 del WorkoutContext de apps/web — los hooks de core son portables.` The context
adds nothing over core's `usePrograms`/`useProgress` except memoization. Mobile's copy **drops
`duplicateProgram` and `deleteProgram`** from the interface (web `:43-44`) — a silent feature gap created by
the copy, not a deliberate decision. Category: **KISS / DRY**.
*Fix:* `core/hooks/useWorkoutContextValue()`; keep the widget-sync effect (`mobile:122-135`) mobile-side.

**F-14 — Semantic color/label maps shadow core's `style-tokens.ts`**

`core/lib/style-tokens.ts` is otherwise a success (12 mobile + 10+ web imports), which makes the shadows
stand out:

| Map | Canonical | Local shadow(s) |
|---|---|---|
| `PRIORITY_COLORS` | `style-tokens.ts:31` (used by `web/components/ExerciseCard.tsx:14`) | `web/components/ExerciseCatalogPicker.tsx:61-65` — different palette (`emerald` vs `sky` for `low`) |
| `MEAL_TYPE_COLORS` | `style-tokens.ts:44` (used by `web/…/CoachPanel.tsx:5`) | `mobile/…/DailyMealPlan.tsx:28`, `mobile/…/WeeklyMealPlan.tsx:55` (identical to each other, key `text:` vs core's `color:`), `mobile/…/PantryPlanSection.tsx:12` (third, incompatible shape) |
| `ACTIVITY_LABEL` | — | `web/components/cardio/CardioShareCard.tsx:19-23` ≡ `mobile/components/share/CardioShareCard.tsx:42-46`, both hardcoded Spanish (`'CARRERA'`, `'CAMINATA'`, `'CICLISMO'`) with no `i18n.t` |
| `CONFETTI_COLORS` | — | `web/components/SessionView.tsx`, `web/components/circuit/CircuitView.tsx` |
| `QUALITY_LABEL_KEYS` | — | `mobile/app/sleep.tsx`, `mobile/…/SleepCard.tsx`, `mobile/…/SleepLoggerSheet.tsx` (3 copies) |

Category: **DRY**. *Fix:* import from `style-tokens.ts`; add `ACTIVITY_LABEL` there as i18n keys.

### Low

**F-15 — `detectDayType` is byte-identical and belongs in core**
`apps/web/src/utils/detectDayType.ts` ≡ `apps/mobile/src/lib/detect-day-type.ts` (53 lines, `cmp` clean)

A pure function over `Exercise[]` importing only `@calistenia/core/types`, with a 17-entry bilingual
`MUSCLE_MAP` classification table. Zero reason to be duplicated; the divergent filenames
(`detectDayType.ts` vs `detect-day-type.ts`) hide it from casual grep. Category: **DRY**.
*Fix:* `core/lib/detect-day-type.ts` — a 5-minute move with a test already trivial to write.

**F-16 — Web loses errors that mobile reports, in otherwise-identical code**
`apps/web/src/contexts/CircuitSessionContext.tsx:429,454` vs mobile `:422-423,448-449`

```
// web:            } catch {
// mobile:         } catch (e) {
//                   Sentry.captureException(e, { tags: { feature: 'circuit', op: 'flush_unsaved_session' } })
```
Nine `catch {}` blocks in the web file (`:67,84,91,100,110,429,434,454,460`); the two covering the
unsaved-session flush are the ones mobile instruments. `CorePlatform.reportError` (`platform.ts:52`) exists
precisely for this. Category: **Spaghetti (silent catch)**.
*Fix:* route through `getPlatform().reportError`.

**F-17 — Session-expiry magic number repeated across six contexts**
`24 * 60 * 60 * 1000` / `86400000` appears in `web/contexts/{ActiveSession,Cardio,Circuit,BackgroundJobs}Context.tsx`
and `mobile/contexts/{ActiveSession,Cardio,Circuit}SessionContext.tsx` — 9 web + 3 mobile occurrences.
`core/lib/dateUtils.ts` exports 21 date helpers but no `SESSION_MAX_AGE_MS`. Category: **Spaghetti (magic number)**.
*Fix:* one exported const alongside the extracted persistence layer.

**F-18 — `training-cues` is the right architecture but web only implements half of it**
`apps/web/src/lib/training-cues.ts` (32) vs `apps/mobile/src/lib/training-cues.ts` (85)

Mobile exports `restCues` **and** `circuitCues`; web exports only `circuitCues`. Rest countdowns on web are
therefore silent. The design itself is correct (core emits `TrainingCue`, each platform maps it) — this is a
completeness gap, not a duplication one. Category: **Correctness-smell**.
*Fix:* add `restCues` to web's mapper.

---

## Done well

- **`packages/core/platform.ts` is a genuinely good adapter.** `CoreStorage`/`CoreEnv`/`CoreAnalytics`/
  `CoreConnectivity`/`reportError` is the right seam, documented in Spanish with the per-platform mapping
  spelled out at `:7-8`. The findings above are apps failing to *use* it, not a flaw in it.
- **Query keys are centralized and actually respected.** `core/lib/query-keys.ts` exports a typed `qk`
  factory; across both apps there is exactly **one** raw `queryKey: [...]` literal
  (`mobile/src/contexts/BattleContext.tsx`). That is unusually good discipline.
- **PocketBase filters are not built in UI.** Only 1 inline `` filter: ` `` in web `.tsx`, 0 in mobile — and
  the app-level queries that do exist correctly use `pb.filter('user = {:uid}', …)` parameter binding rather
  than string interpolation.
- **`raceClock.ts` → `core/lib/serverClock.ts` is a model migration.** The shim keeps every import working and
  the docblock records *why* it moved (#356) and what re-exports it. Every extraction in this report should
  copy that pattern.
- **`core/lib/cardio-fix.ts` and `core/lib/style-tokens.ts` show the target state** — pure, tested,
  well-commented modules with real adoption. `style-tokens` has 20+ importers across both apps.
- **No dead core hooks.** Every one of the 78 hooks in `core/hooks/` is referenced by at least one app.
- **Mobile's meal-logger decomposition** (`use-meal-logger.ts` / `-views` / `-steps` / `-shared`) is the right
  shape; it is simply in the wrong package.

---

## Files reviewed

**Read fully:** `packages/core/platform.ts`, `packages/core/lib/storage-keys.ts`,
`packages/core/lib/cardio-fix.ts`, `packages/core/lib/serverClock.ts`,
`apps/web/src/utils/detectDayType.ts`, `apps/mobile/src/lib/detect-day-type.ts`,
`apps/{web,mobile}/src/lib/race/raceClock.ts`, `apps/mobile/src/lib/streak-milestones.ts`,
`apps/{web,mobile}/src/components/pantry/use-pantry-depletion.ts` (via full diff),
`apps/{web,mobile}/src/contexts/{Circuit,Workout}Context.tsx` (via full diff).

**Read in part (targeted ranges):** `apps/{web,mobile}/src/contexts/{ActiveSession,Cardio}SessionContext.tsx`,
`apps/{web,mobile}/src/components/onboarding/OnboardingFlow.tsx`,
`apps/web/src/pages/UserProfilePage.tsx`, `apps/mobile/src/app/u/[id].tsx`,
`apps/web/src/components/nutrition/{EditMealSheet,MealLoggerContent}.tsx`,
`apps/mobile/src/components/nutrition/{use-meal-logger,meal-logger-shared}.ts`,
`apps/{web,mobile}/src/lib/share.ts`, `apps/{web,mobile}/src/lib/training-cues.ts`,
`apps/web/src/components/StreakMilestone.tsx`, `apps/web/src/lib/race/raceApi.ts`,
`packages/core/lib/{macro-calc,style-tokens,query-keys,dateUtils}.ts`,
`packages/core/hooks/useMealLoggerActions.ts`,
`apps/{web,mobile}/src/components/{cardio,share}/CardioShareCard.tsx`,
`apps/mobile/src/components/nutrition/{DailyMealPlan,WeeklyMealPlan,PantryPlanSection}.tsx`,
`apps/web/src/components/{ExerciseCard,ExerciseCatalogPicker}.tsx`.

**Skimmed / measured only (grep + similarity scoring):** the remaining ~700 `.ts`/`.tsx` files in
`apps/web/src` (72.3k lines), `apps/mobile/src` (49.6k lines) and `packages/core` (37.6k lines) — basename
twin matching, `pb.collection(` census, `filter:` census, storage-key census, `queryKey` census,
`.reduce(`/`Math.round`/`toFixed(` census, label-map census, date-arithmetic census.

**Method note:** overlap percentages come from `difflib.SequenceMatcher` over comment- and blank-stripped
lines; "byte-identical" claims were verified with `cmp -s`.
