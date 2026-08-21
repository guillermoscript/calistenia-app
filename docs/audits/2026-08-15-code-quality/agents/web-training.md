# Web training/session (apps/web)

## Grade

**C+**. Individual files are locally well-organized with unusually good "why" comments (Spanish), and several pages (SessionDetailPage, PostWorkoutActions, CircuitView) show the *correct* pattern: thin page → core hook/lib → presentational component. But that pattern is inconsistently applied. The scope has extensive, well-evidenced duplication — most damningly, the same "merge exercise catalog" logic exists **five separate times** with three different (and one demonstrably wrong) identity-resolution strategies, and the countdown/timer logic that mobile already extracted into shared `packages/core` hooks (documented in `apps/mobile/CLAUDE.md` under #402) was never migrated on web, even though web's own `CircuitView.tsx` proves the shared hook works fine here.

## Top 3 refactors

1. **Unify exercise-catalog loading into one `packages/core` hook.** Five independent implementations (`FreeSessionPage.extractExercisesFromWorkouts`/`mapPBRecord`, `LogWorkoutPage.extractCatalog`/`mapPBCatalog`, `SessionPreview.buildCatalogMap`, `hooks/useExerciseCatalog.ts`, `CircuitBuilder.useCatalog`) each merge `WORKOUTS` + `SUPPLEMENTARY_EXERCISES` + `exercise-catalog.json` + PB `exercises_catalog`, with **three different identity fields** (`rec.id`, `rec.slug || rec.id`, `r.exercise_id || r.id`). `LogWorkoutPage.tsx:73-76` explicitly documents that using `rec.id` instead of `slug` "silently fragments score history" — yet `FreeSessionPage.tsx:153` and `hooks/useExerciseCatalog.ts:39` do exactly that. This is a live correctness bug hiding in duplicated code, not just a style issue.
2. **Migrate `SessionView`'s `RestScreen`, `RestTimer.tsx`, and `Timer.tsx` onto the shared `usePausableCountdown`/`useCountdown` hooks in `packages/core/hooks`.** These hooks exist precisely for this (doc comment: "Sin React Native ni DOM: lo usan el circuito nativo y el de web con el mismo código"), and web's own `CircuitView.tsx` already uses `usePausableCountdown` correctly. The un-migrated copies re-implement timestamp countdown logic by hand three more times, and `Timer.tsx` additionally has a real drift bug (naive `setInterval` decrement instead of timestamp-based) that the shared hook already solves.
3. **Move `ActiveSessionContext`/`CircuitSessionContext` state-machine + persistence logic into `packages/core`**, mirroring the split `apps/mobile/CLAUDE.md` documents for its own session code (pure logic in `core/lib`, thin platform glue per app). Right now web and mobile maintain two parallel, near-identical contexts (`getCurrentSection`, `saveToStorage`/`loadFromStorage`/`clearStorage`, `buildSteps`/`flatSteps`) that must be kept in sync by hand — `ActiveSessionContext.tsx:288` even has a comment admitting this ("Debe coincidir con buildSteps de SessionView.tsx").

## Findings

### High

- **Duplicated + inconsistent exercise-catalog merge/identity logic across 5 files, one variant has a documented bug.**
  `apps/web/src/pages/FreeSessionPage.tsx:100-162`, `apps/web/src/pages/LogWorkoutPage.tsx:47-77`, `apps/web/src/components/free-session/SessionPreview.tsx:26-63`, `apps/web/src/hooks/useExerciseCatalog.ts:8-51`, `apps/web/src/components/circuit/CircuitBuilder.tsx:20-73`.
  Evidence (`LogWorkoutPage.tsx:73-76`): `// Identity MUST be the stable, human-meaningful slug — never the random PB primary key (rec.id), which silently fragments score history.` vs. `FreeSessionPage.tsx:153`: `id: rec.id ?? ''`.
  Category: DRY / Correctness-smell. Fix: one `packages/core` hook (`useExerciseCatalog`) with the slug-first identity rule, consumed by all five call sites.

- **Countdown/rest-timer logic re-implemented by hand instead of using the shared `usePausableCountdown`/`useCountdown` core hooks; one copy has a real drift bug.**
  `apps/web/src/components/SessionView.tsx:137-225` (`RestScreen`), `apps/web/src/components/RestTimer.tsx:1-117` (entire file), `apps/web/src/components/Timer.tsx:60-84` (main exercise timer effect).
  Evidence: `packages/core/hooks/usePausableCountdown.ts:1-9` doc comment states it's meant for exactly this ("lo usan el circuito nativo y el de web con el mismo código"), and `apps/web/src/components/circuit/CircuitView.tsx:100-109` already consumes it correctly with a comment referencing #402. `Timer.tsx:64-81` decrements `seconds` by 1 per `setInterval` tick — this drifts under tab throttling/backgrounding, the exact bug class the shared hook (timestamp-based) was built to fix; `RestScreen` in `SessionView.tsx` avoids the drift bug (it's timestamp-based) but still duplicates ~90 lines of hand-rolled logic instead of using the hook.
  Category: DRY / React-perf (correctness) / SOLID-SRP. Fix: swap both onto `usePausableCountdown`.

- **`ActiveSessionContext.tsx` / `CircuitSessionContext.tsx` / `SessionView.tsx` are near-duplicate, independently-maintained reimplementations of their `apps/mobile` counterparts.**
  `apps/web/src/contexts/ActiveSessionContext.tsx` (368 lines) vs `apps/mobile/src/contexts/ActiveSessionContext.tsx` (304 lines) — identical function names (`getCurrentSection`, `saveToStorage`, `loadFromStorage`, `clearStorage`, `ActiveSessionProvider`, `useActiveSession`), identical persistence shape. Same for `CircuitSessionContext.tsx` (505 web / 502 mobile) and `SessionView.tsx` (1336 web / 1128 mobile).
  Evidence of drift risk: `apps/web/src/contexts/ActiveSessionContext.tsx:286-291` comment: `// Debe coincidir con buildSteps de SessionView.tsx para que los índices de skipWarmup no se desincronicen.` — a manual-sync contract enforced only by comment, not by shared code.
  Category: DRY / SOLID-SRP (session-machine logic embedded in two separate React contexts instead of a shared, framework-agnostic module). Fix: extract the pure step-building / progress state machine into `packages/core/lib` (mobile already proved this split works for countdown logic via `session-machine.ts` per its CLAUDE.md).

### Medium

- **`CircuitSessionContext.tsx:420-467` — `flushUnsaved` callback defined then bypassed; mount effect reimplements the identical retry loop inline instead of calling it.**
  Lines 420-439 define `flushUnsaved` (loads queue, retries each PB create, persists remainder). Lines 441-467, the mount `useEffect`, do not call `flushUnsaved()` — they copy-paste the same loop body with a `cancelled` guard added. Two code paths doing the same thing that must be kept in sync by hand.
  Category: DRY / KISS. Fix: have the mount effect call `flushUnsaved()` (wrap with an abort/cancelled check inside the callback if needed).

- **`Confetti` component copy-pasted between `SessionView.tsx:69-124` and `CircuitView.tsx:23-82`, acknowledged in a comment.**
  `CircuitView.tsx:22`: `// ── Confetti (reused from SessionView pattern) ──`. Identical piece-generation math (`Math.random()` size/left/delay/dur/rot/shape), near-identical render, only wrapper markup differs.
  Category: DRY. Fix: extract to a shared `components/Confetti.tsx`.

- **`WorkoutShareCard.tsx` hardcodes its own color palette instead of importing the shared `CARD_COLORS`.**
  `apps/web/src/components/WorkoutShareCard.tsx:47-56` declares `lime`, `limeDim`, `limeGlow`, `fg`, `fgDim`, `fgMuted`, `bg`, `cardBg`, `borderColor` as literal hex strings, duplicating `apps/web/src/lib/canvas-helpers.ts`'s `CARD_COLORS`, which `apps/web/src/components/PRShareCard.tsx:7,44` already imports and uses correctly for the same 1080×1920 canvas share-card pattern (same `scale`/`pad`/`loadLogo`/`loadImage` boilerplate in both files).
  Category: DRY / Spaghetti (drift risk — palette can silently diverge between the two share cards). Fix: import `CARD_COLORS` in `WorkoutShareCard.tsx` too; consider extracting the common canvas card scaffold (background, glow, logo/avatar placement) into a shared helper.

- **`RoutineViewPage.tsx` embeds a 100-line multi-collection fetch/join/group directly in a page `useEffect`, unlike its sibling detail pages.**
  `apps/web/src/pages/RoutineViewPage.tsx:72-159`: fetches `users`, `user_programs` (expand `program`), `program_phases`, `program_exercises` and hand-joins them into `PhaseGroup[]`, all inline in the page component with `any`-typed intermediates (`let userProgram: any`, `(phase: any)`, `(e: any)`). Contrast with `SessionDetailPage.tsx`/`PublicSessionDetailPage.tsx`, which correctly delegate this shape of work to `useSessionDetail`/`usePublicSessionDetail` core hooks.
  Also line 121: `exercisesRes.items.filter((e: any) => e.phase_number === phase.phase_number)` runs **inside** `phasesRes.items.map(...)`, i.e. an O(phases × exercises) filter-in-map instead of building a `Map` keyed by `phase_number` once (vercel rule: `js-index-maps`).
  Category: Separation-of-concerns / React-perf (`js-index-maps`). Fix: extract to a `useProgramView`-style core hook; build a phase→exercises index once instead of filtering per phase.

- **MM:SS / countdown formatting reimplemented locally in at least 5 places instead of using the existing `formatCountdown` in core.**
  `packages/core/lib/countdown.ts:62` already exports `formatCountdown(seconds)`. Local reimplementations: `apps/web/src/components/circuit/CircuitView.tsx:160-164` (`formatElapsed`), `apps/web/src/pages/CircuitSessionDetailPage.tsx:41-45` (`formatDuration`), `apps/web/src/components/SessionView.tsx:216-217` (inline `mins`/`secs`), `apps/web/src/components/RestTimer.tsx:92` (inline), `apps/web/src/components/Timer.tsx:226` (inline).
  Category: DRY / KISS. Fix: call `formatCountdown` everywhere instead.

- **`useWorkDay.ts` reimplements its own `AudioContext`/beep oscillator instead of reusing `lib/sounds.ts`.**
  `apps/web/src/hooks/useWorkDay.ts:34-59` defines `getAudioCtx()`/`playBeep()` from scratch, with a comment at line 10 and 35 claiming it "reuses the same AudioContext pattern from RestTimer.jsx / Timer.jsx" — but it doesn't import `lib/sounds.ts`'s `getCtx()`/`tone()`, it re-implements them (own singleton, own oscillator/gain wiring).
  Category: DRY. Fix: import and reuse `tone()`/`getCtx()` from `apps/web/src/lib/sounds.ts` (or add a generic `playBeep(freq, duration, vol)` export there).

- **`FreeSessionPage.tsx` — `handleRetryLoad` (340-363) duplicates the mount-effect load logic (245-273) verbatim within the same file.**
  Both blocks: check `isPocketBaseAvailable()`, try `pb.collection('exercises_catalog').getList(...)`, map with `mapPBRecord`, fall back to `extractExercisesFromWorkouts()`, set `loadError`. Same file, same function shape, copy-pasted rather than factored into a shared `loadCatalog()` closure.
  Category: DRY. Fix: extract one `loadCatalog` function used by both the effect and the retry handler.

### Low

- **Pervasive `as any` on PocketBase records / catalog JSON / AI SDK message parts.** `LogWorkoutPage.tsx:60-62,72`, `FreeSessionPage.tsx:133-134,151,190`, `SessionDetailPage.tsx:69-71`, `PublicSessionDetailPage.tsx:81-83`, `RoutineViewPage.tsx:82,120,122-123`, `SessionPreview.tsx:47-48,81`, `AISessionTab.tsx:47,49-50,55,75,147,180,441-446,459,479,519` (heaviest concentration — 10+ occurrences typing AI SDK message `parts` as `any[]`). Category: Spaghetti (`any` abuse). Fix: type PB responses via generated/typed collection helpers; type AI SDK parts via the SDK's own part-union types.
- **Duplicated 3-line "share identity" object.** `SessionDetailPage.tsx:69-71` and `PublicSessionDetailPage.tsx:81-83` both build `{ userName: (user as any)?.display_name || user?.email?.split('@')[0], avatarUrl: ..., referralCode: ... }` identically. Category: DRY. Fix: small `getShareIdentity(user)` helper.
- **Non-null assertion on user input.** `LumbarCheckModal.tsx:78`: `lumbar_score: lumbarScore!` — relies on step-gating elsewhere in the component to guarantee non-null; not locally verifiable at the assignment site. Category: Spaghetti (`!` abuse). Fix: guard with an explicit check or narrow the type before calling `handleSave`.
- **Scattered `console.warn`/`console.error` instead of a centralized logger**, despite the codebase having `op.track`/Sentry-style instrumentation elsewhere: `LogWorkoutPage.tsx:247`, `RoutineViewPage.tsx:155`, `PRShareCard.tsx:212`, `WorkoutShareCard.tsx:339`, `CircuitSessionContext.tsx:379`. Category: Spaghetti / consistency. Fix: route through a shared logging helper if one exists, or at least keep the pattern consistent.
- **`useDebounce` generic hook defined inline in a page file.** `FreeSessionPage.tsx:206-213`. Not currently duplicated elsewhere, but a generic hook like this belongs in `apps/web/src/hooks/` (or `packages/core/hooks` if mobile needs it too) rather than a page component. Category: KISS / organization.

## Done well

- **`CircuitView.tsx`** correctly adopts the shared `usePausableCountdown` core hook (with a comment explaining the #402 migration and why the ring used to desync) — this is the pattern the rest of the scope should follow.
- **`PostWorkoutActions.tsx`** is a clean, well-scoped component: business logic (`buildPostWorkoutActions`, `usePostWorkoutChallenge`, `trackPostWorkoutAction`) lives in `packages/core`, the component is purely presentational/composition, and props are minimal and explicit. Good SRP example.
- **`SessionDetailPage.tsx` / `PublicSessionDetailPage.tsx`** correctly delegate data-fetching and shaping to core hooks (`useSessionDetail`, `usePublicSessionDetail`) and share one presentational `SessionDetailView` — the two pages differ only in data source and header, not in rendering logic.
- **`CircuitSessionContext.buildCircuitSessionData`** (lines 119-153) is a small, pure, easily-testable function cleanly separated from the React state/effect code around it.
- Comments throughout (in Spanish) are unusually thorough about *why*, not just *what* — e.g. the timing-tracker one-shot-finalize guard in `SessionView.tsx:935-942`, the superset-skip logic, the `flatSteps` sync warning — genuinely useful for future maintainers even where the underlying duplication should be fixed.

## Files reviewed

Read fully: `SessionView.tsx`, `RestTimer.tsx`, `Timer.tsx`, `WorkoutPage.tsx`, `ActiveSessionContext.tsx`, `CircuitSessionContext.tsx`, `FreeSessionPage.tsx`, `LogWorkoutPage.tsx` (catalog section + header), `SessionDetailPage.tsx`, `PublicSessionDetailPage.tsx`, `PostWorkoutActions.tsx`, `sounds.ts`, `useWorkDay.ts` (key sections), `hooks/useExerciseCatalog.ts`, `CircuitView.tsx` (full), `CircuitBuilder.tsx` (catalog section), `SessionPreview.tsx` (catalog + parse section), `LumbarCheckModal.tsx` (first half), `RoutineViewPage.tsx` (load effect), `CircuitSessionDetailPage.tsx` (types/helpers section), `PRShareCard.tsx` / `WorkoutShareCard.tsx` (headers + canvas setup).

Skimmed via grep/wc (not fully read): `ActiveSessionPage.tsx`, `CircuitPage.tsx`, `CircuitActivePage.tsx`, `AISessionTab.tsx`, `PRCelebration.tsx`, `ActiveFreeSessionBubble.tsx`, `SectionTransition.tsx`, `WarmupCooldownPrompt.tsx`, `SessionDetailView.tsx`, `BackLink.tsx`, `SessionForm.tsx`, `SleepLumbarSection.tsx`, `WorkoutContext.tsx`, `training-cues.ts`, `detectDayType.ts`.

Not found in this scope path as given: none — all listed paths existed.
