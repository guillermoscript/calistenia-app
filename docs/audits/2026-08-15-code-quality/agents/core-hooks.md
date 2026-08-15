# packages/core/hooks (+ platform.ts, lib/query-client|query-keys|pocketbase|optimistic|offlineQueue, package.json)

Scope: 70 hook files (15.245 lines incl. 4 test files) + 6 infra files (1.011 lines).

## Grade

**B−**

The architecture is genuinely good and unusually consistent for a 70-hook surface: 59/70 hooks go through TanStack Query, every query key comes from one typed factory, and platform coupling is properly inverted through `platform.ts` (almost zero `window`/`localStorage`/`AsyncStorage` leakage — remarkable for a shared web+RN package). What drags it down is the **long tail of hooks written before the conventions settled**: a handful of god hooks (`useProgress` 869 L, `useProgramEditor` 668 L, `useNutrition` 640 L) that fetch + mutate + persist + emit analytics + fire notifications in one file, 145 silent `catch` blocks, and a few genuine correctness defects (an infinite-refetch loop, a leaked realtime subscription, a non-transactional delete-then-recreate, raw string interpolation in 4 PocketBase filters).

## Top 3 refactors

1. **Break up `useProgress.ts` (869 L)** — move `buildProgressMap`, `pendingProgressRows`, `computePRBackfill` and `emitProgramMilestoneIfCompleted` to `lib/` (the first two are already `export`ed *purely for testability*, which is the tell), and split the returned 17-member API into `useProgress` (read/derive) + `useProgressMutations` (log/mark/unmark) + `usePRs`. This also fixes the broken `useCallback` deps (finding M1) as a side effect.
2. **Add the two missing shared helpers the hooks keep re-inventing**: an `aiApiFetch()` in `lib/ai-api.ts` that attaches the PB bearer token (duplicated verbatim in 6 files) and a public `emitOnce()` in `lib/analytics.ts` (hand-rolled 3×). Together they delete ~60 lines of copy-paste and give the auth header one place to change.
3. **Make `pb.authStore` reactive.** `usePrograms.ts:270` and `fetchCatalog:164` read `pb.authStore.isValid` during render — a non-reactive external mutable store. Wrap it in a `useSyncExternalStore` over the existing `pb.authStore.onChange` (the subscription already exists in `useAuth.ts:172`) and expose it via `qk.authReady`, which is declared in `query-keys.ts:15` and barely used.

---

## Findings

### High

**H1 · `useProgress.ts:333-869` — god hook, 869 lines, 17-member public API** · `SOLID-SRP`
```ts
return {
  progress, settings, usePB, pbReady,
  logSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, isWorkoutDone,
  getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
  getLongestStreak, updateSettings, getMonthActivity,
  getLastSessionDate, checkAndUpdatePR,
}
```
One hook owns: PB reads across 4 collections, localStorage write-through, the offline queue, settings CRUD, PR detection, streak/calendar derivation, 3 analytics event families, and a program-milestone side effect. It has 47 `any` and 9 silent catches — the highest in the scope on both counts.
*Fix:* extract pure logic to `lib/`, split read hook from mutation hook (see Top-3 #1).

**H2 · `useChallenges.ts:173-198` — write-in-effect + invalidate = infinite refetch loop for non-creators** · `Correctness-smell`
```ts
useEffect(() => {
  const ids = data?.expiredIds ?? []
  ...
      await pb.collection('challenges').update(id, { status: 'ended' })
    } catch { /* solo el creador puede actualizar; ignorar si no lo es */ }
  ...
    await qc.invalidateQueries({ queryKey: qk.challenges(userId) })
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [data?.expiredIds, userId])
```
`fetchChallenges` builds a fresh `expiredIds` array every run, so the dep changes on every refetch. When the user is a *participant but not the creator* the `update` always 403s (swallowed), `expiredIds` never empties, and the unconditional `invalidateQueries` re-runs the query → effect → invalidate → forever. The `eslint-disable` is hiding the missing `qc` dep that would have made this visible.
*Fix:* gate the invalidate on at least one successful update, and dedupe by id in a ref so the effect can't re-fire for ids it already attempted.

**H3 · `useProgramEditor.ts:507-627` — non-transactional delete-then-recreate, fully sequential** · `Correctness-smell` / `React-perf (async-parallel)`
```ts
for (const p of existingPhases.items) { await pb.collection('program_phases').delete(p.id) }
...
for (const e of existingExercises.items) { await pb.collection('program_exercises').delete(e.id) }
...
for (const ex of sortedExercises) { ... await pb.collection('program_exercises').create({...}) }
```
`saveProgram` deletes every phase, day-config and exercise, then recreates them one `await` at a time. A 3-phase × 7-day × 8-exercise program is ~190 sequential round-trips; if any create fails midway the `catch` only sets an error string and **the user's program is left gutted** (deletes committed, creates lost). The 3 delete loops are additionally wrapped in `catch { /* no existing phases */ }`, so a network blip is indistinguishable from "nothing to delete".
*Fix:* batch the writes with `Promise.all` per collection, and diff-and-patch instead of destroy-and-recreate so a partial failure is recoverable.

**H4 · Raw template-literal PocketBase filters in 4 places while the rest of the codebase binds** · `Correctness-smell`
- `useProgress.ts:678` `filter: \`user = "${userId}" && workout_key = "${workoutKey}" && completed_at >= "${dayStart}"...\`` — the *same file* uses `pb.filter()` in 6 other places.
- `useReactions.ts:100` `getFirstListItem(\`session_id = '${sessionId}' && reactor = '${userId}' && emoji = '${emoji}'\`)` — its twin `useCommentReactions.ts:128-132` does the identical query with proper `pb.filter('... = {:cid} ...', {...})` bindings.
- `useComments.ts:28` `filter: \`session_id = '${sessionId}'\``
- `useRacePRs.ts:55,131`

`workout_key` and `emoji` are user-influenced values; an embedded quote breaks the filter (400) at best.
*Fix:* mechanical — convert all four to `pb.filter()` with named bindings.

**H5 · `useNotifications.ts:172-185` — async subscribe race leaks the realtime subscription** · `Correctness-smell`
```ts
let unsub: (() => void) | undefined
const subscribe = async () => {
  unsub = await pb.collection('notifications').subscribe('*', (e) => { ... })
}
subscribe()
return () => { if (unsub) unsub() }
```
If the effect unmounts (or `userId` changes) before the `await` resolves, `unsub` is still `undefined`, the cleanup no-ops, and the subscription is established *afterwards* with no one holding its handle. On a login→logout→login cycle the app accumulates listeners that invalidate queries for the previous user. This is the only realtime subscription in the whole scope, so it's a one-line fix with no ripple.
*Fix:* add a `let cancelled = false`; in cleanup set it and, if `unsub` is already set, call it; inside the async fn call `unsub()` immediately if `cancelled`.

**H6 · `useAuth.ts:162-168` — ghost-token re-verification is web-only; `platform.ts` has no app-state adapter** · `Separation-of-concerns / DIP`
```ts
useEffect(() => {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return
  const onVisible = () => { if (document.visibilityState === 'visible') void verifyAuth().catch(() => {}) }
  document.addEventListener('visibilitychange', onVisible)
```
This is the only raw DOM access in the scope, and the `typeof document` guard makes it a **permanent silent no-op on React Native** — so mobile never re-checks a server-invalidated token on foreground, which is precisely the ghost-session failure (#254) this code exists to prevent. `CorePlatform` (`platform.ts:44-53`) has `storage`/`env`/`analytics`/`connectivity` but nothing for foreground/AppState.
*Fix:* add `appState.onForeground(handler): () => void` to `CorePlatform` — web binds `visibilitychange`, RN binds `AppState`.

### Medium

**M1 · `useProgress.ts:419, 450, 461, 860` — a fresh array in the dep list defeats every `useCallback` in the hook** · `React-perf (rerender-dependencies)`
```ts
const key = qk.sessions(userId, activeProgramId)          // :335 — new array every render
...
}, [activeProgramId, qc, key])                            // :419 loadFromPB
}, [qc, key])                                             // :450 patchProgress
}, [qc, key])                                             // :461 patchSettings
}, [updateSettings, qc, key, settings])                   // :860 checkAndUpdatePR
```
`qk.sessions()` returns a new tuple each call, so `key` never compares equal and *every* memoized callback is rebuilt every render — including `patchProgress`, which is itself a dep of `logSet` and `markWorkoutDone`. `useNutrition.ts:161-166` already solved this and left a comment explaining why ("el mismo antipatrón que causó el bucle infinito de nutrition_badges"); `useProgress` never got the fix.
*Fix:* `const key = useMemo(() => qk.sessions(userId, activeProgramId), [userId, activeProgramId])`, exactly as `useNutrition` does.

**M2 · `usePrograms.ts:270` and `:164` — non-reactive read of `pb.authStore` during render** · `Correctness-smell`
```ts
const authReady = !!userId && pb.authStore.isValid   // :270, gates 3 useQuery `enabled`
```
`pb.authStore.isValid` is external mutable state with no React subscription. When the RN `AsyncAuthStore` rehydrates after first paint, nothing re-renders, so all three program queries stay `enabled: false` until an unrelated render happens to occur. The comment at `:164` shows the team already hit the symptom and patched it by throwing inside the queryFn.
*Fix:* `useSyncExternalStore(pb.authStore.onChange, () => pb.authStore.isValid)`.

**M3 · `useReactions.ts` vs `useCommentReactions.ts` — near-duplicate engines that have drifted apart** · `DRY`
The emoji-tally algorithm is character-for-character the same, but extracted in one and inlined in the other:
```ts
// useCommentReactions.ts:12  — extracted, pure, testable
function buildEmojiMap(commentReactions: any[], userId: string): CommentEmojiReactions {
// useReactions.ts:60-77       — same loop, inlined in the queryFn
for (const emoji of REACTION_EMOJIS) { const emojiReactions = sessionReactions.filter(...) }
```
The divergence is where the bugs live: the comment version uses `pb.filter` bindings, `Math.max(0, ...)` on the optimistic count, and an `onSettled` reconcile; the session version has none of the three (raw interpolation — see H4 — and a count that can go negative at `useReactions.ts:121`).
*Fix:* one `useEmojiReactions({ collection, fkField, emojis })` parameterised over collection + FK field; both call sites become 3 lines.

**M4 · The AI-API bearer header is copy-pasted in 6 files** · `DRY`
```ts
if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
```
`useNutrition.ts:328` and `:354`, `useCrossInsights.ts:162`, `useFoodCatalog.ts:207`, `useNutritionCoach.ts:300`, `useSleepInsight.ts:139`. `lib/ai-api.ts` is 9 lines long and exports only `AI_API_URL` — the obvious home for a wrapper is already there and empty.
*Fix:* `export async function aiApiFetch(path, init)` in `lib/ai-api.ts`.

**M5 · `pb.authStore.record?.id ?? userId` duplicated 4× while `getCurrentUser()` is exported and unused** · `DRY`
`useBlocks.ts:85`, `useFollows.ts:108`, `useReports.ts:45`, `useDeleteAccount.ts:46` (the last one even re-types the deprecated `.model` inline: `(pb.authStore as { model?: { id?: string } }).model?.id`). `lib/pocketbase.ts:205` already exports `getCurrentUser()` doing exactly this.
*Fix:* add `getCurrentUserId()` next to it and use it in all four.

**M6 · "Emit this analytics event once, ever" is hand-rolled 3×** · `DRY`
```ts
// useCommunityPrograms.ts:284 — the good version, but file-private
function emitOnce(key: string, emit: () => void): void { if (storage.getItem(key)) return; storage.setItem(key, 'true'); ... }
// useProgress.ts:48/92        — same pattern, inlined
if (storage.getItem(milestoneKey)) return ... storage.setItem(milestoneKey, 'true')
// useProgress.ts:584          — same pattern again, different value format
if (!storage.getItem(psKey)) { storage.setItem(psKey, Date.now().toString()); op.track('program_started', ...) }
```
*Fix:* promote `emitOnce` to `lib/analytics.ts` and call it from all three.

**M7 · `useCommunityPrograms.ts:433` — side effects inside a `queryFn`, contradicting the codebase's own stated rule** · `Separation-of-concerns`
```ts
emitDerivedEvents(userId, programId, progress)   // writes storage markers + fires analytics
return { program, milestones, membership, progress, challengeLinks }
```
`useChallenges.ts:169-172` states the convention explicitly — *"El auto-end NO puede vivir en la queryFn (que debe ser pura/sin escrituras)"* — and this file does the opposite. It only survives retries/refetches because `emitOnce` persists a marker, which couples analytics correctness to localStorage never being cleared.
*Fix:* return the derived milestone flags from the queryFn and emit from an effect keyed on them.

**M8 · `useProgramEditor.ts:156-648` — one giant `useState` object with 12 hand-rolled reducers, plus i18n inside a data hook** · `SOLID-SRP / KISS`
`setStep`, `updateInfo`, `redistributeWeeks`, `addPhase`, `removePhase`, `updatePhase`, `updateDay`, `addExercise`, `removeExercise`, `updateExercise`, `moveExercise`, `resetEditor` are all `useCallback(setState(s => ({...s, ...})))` over one `ProgramEditorState`. That is a reducer written the long way. `saveProgram` additionally depends on `[state.programId, state.info, state.phases, state.days, qc]`, so its identity churns on every keystroke. It also reaches for `i18n.language` / `i18n.t('programEditor.saveError')` (`:487`, `:635`) — presentation concern baked into a data hook, which makes the error message untestable and unlocalisable by the caller.
*Fix:* `useReducer` with an action union; return an error *code*, let the UI translate it.

**M9 · Hard-coded query-key prefixes used for invalidation, bypassing the factory** · `DRY / Spaghetti`
```ts
useBlocks.ts:74-79     qc.invalidateQueries({ queryKey: ['comment-reactions'] })  // ×5 keys
useFoodHistory.ts:113  qc.invalidateQueries({ queryKey: ['food_history', 'recent', userId] })
useProgramEditor.ts:631 / usePrograms.ts:555  qc.invalidateQueries({ queryKey: ['programs', 'detail'] })
usePantry.ts:198, :261 qc.invalidateQueries({ queryKey: ['pantry', 'spend'] })
```
These are broad *prefix* invalidations, and `query-keys.ts` simply has no root for them (`qk.reactions`, `qk.pantry.spend`, `qk.programs.detail` all require arguments). Renaming any of these domains in the factory silently breaks invalidation — no type error, no test failure, just stale UI.
*Fix:* give every domain in `query-keys.ts` an `all` root (as `feed`, `comments`, `notifications`, `programs` already have) and use it.

**M10 · `useNutrition.ts:230, 250-260, 348-370` — a hand-rolled second cache next to React Query** · `KISS`
```ts
const loadedDates = useRef<Set<string>>(new Set())
...
const fetchEntriesForDate = useCallback(async (date: string) => {
  if (loadedDates.current.has(date)) return
```
`entries` is an ever-growing accumulator stored under `qk.nutrition.today(userId)` — a key that claims one day but holds every date ever fetched — with manual dedupe-by-id, manual invalidation, and a ref tracking which dates are "loaded". `query-keys.ts:152-155` already declares `qk.nutrition.byDate` and `qk.nutrition.range` for exactly this, unused by this hook.
*Fix:* one query per date/range under the existing keys; derive the union with `useQueries` instead of accumulating.

**M11 · Magic page-size caps that silently truncate** · `Correctness-smell`
`getList(1, 2000)` ×6 (`useProgramEditor.ts:518`, `usePrograms.ts:174`…), `getList(1, 500)` (`useNutrition.ts:285`), `getList(1, 200)` ×10. None checks `totalPages`/`totalItems` against the cap. `useNutrition.fetchEntriesForDateRange` caps a multi-month range at 500 entries, so a user logging 6 meals/day silently loses everything past ~83 days — and the surrounding code only checks `if (res.items.length === 0) return`.
*Fix:* use `getFullList` (already used 67× elsewhere) or assert `totalItems <= perPage` and report otherwise.

**M12 · `useChallenges.ts:125-137` — N+1 request just to read `totalItems`** · `React-perf (async-parallel)`
```ts
const countPromises = Array.from(challengeMap.keys()).map(async (cid) => {
  const res = await pb.collection('challenge_participants').getList(1, 1, { filter: pb.filter('challenge = {:cid}', { cid }) })
  const ch = challengeMap.get(cid)!            // ← non-null assertion
  ch.participantCount = res.totalItems
} catch { /* ignorar errores individuales de conteo */ })
```
The comment concedes it ("N+1 necesario para el recuento exacto") but it isn't — one `getFullList` over `challenge = A || challenge = B || …` with `fields: 'challenge'` counts client-side in a single round-trip, which is the pattern `usePrograms.ts:174-179` already uses for day-configs.

**M13 · `offlineQueue.ts:243-277` — no early exit on network failure, unbounded queue, late persistence** · `React-perf (js-early-exit) / Correctness-smell`
```ts
for (const item of queue) {
  try { await pb.collection(item.collection).create(item.data) }
  catch (e) { if (isNetworkError(e)) { remaining.push(item) } ... }
}
setQueue(remaining)
```
The first network error proves the device is offline, yet the loop keeps issuing every remaining request. `enqueue` (`:52`) has no cap or TTL, so a week offline grows an unbounded JSON blob that `getQueue()` re-parses on every `useProgress` fetch. And `setQueue(remaining)` runs only after the whole loop — a kill mid-drain replays already-committed writes (safe for `sets_log`/`sessions` thanks to `client_id`, unprotected for any other collection).
*Fix:* `break` on the first `isNetworkError`; persist `remaining` incrementally; cap the queue with an oldest-first eviction.

**M14 · DOM types in a package that declares it has none** · `Separation-of-concerns / DIP`
`package.json:6` — *"Sin dependencias de DOM ni React Native"*. But `File`/`Blob`/`FormData` appear in public signatures: `useBodyPhotos.ts:20,21,64,102,160,167`, `useMealLoggerActions.ts:16,35,74,89`, `useNutrition.ts:305,380`, `useWgerSearch.ts:68`. It's also inconsistent *within one file* — `useNutrition.ts:305` takes `File | File[]` while `:380` takes `Array<File | Blob>`.
*Fix:* define a `CoreUploadFile` type in `platform.ts` (`{ uri/blob, name, type }`) and normalise at the boundary; RN has no `File` constructor (the mobile avatar upload already works around this).

**M15 · `loading` is derived two different ways across the public hook surface** · `DRY`
8 hooks expose `loading: query.isLoading`, 7 expose `loading: …isPending`. In React Query v5 these differ materially: hooks that supply `initialData` (`useProgress`, `useNutrition`, `useSleep`, `useWater`, `useRestPreferences`) have `isPending === false` *always*, so `loading` from those is a constant lie, while `isLoading` at least tracks the first fetch. Callers can't reason about `loading` uniformly.
*Fix:* pick one derivation and state it in a shared `toHookStatus(query)` helper.

**M16 · `useProgress.ts:424` / `:288-291` — storage write during render** · `React-perf (rerender-derived-state-no-effect)` / `Correctness-smell`
```ts
initialData: () => ({ progress: lsGet(), settings: ensureStartDate(lsGetSettings()) }),
// :288
const ensureStartDate = (s: Settings): Settings => { if (!s.startDate) { s.startDate = todayStr(); lsSetSettings(s) } ... }
```
`initialData` runs during render and `ensureStartDate` both mutates its argument and writes to storage. Under StrictMode double-render / concurrent replays this fires twice.
*Fix:* move the default-seeding into the queryFn or an init-once effect.

**M17 · `useProgress.ts:438-440` — ref write during render** · `React-perf (rerender-use-ref-transient-values)`
```ts
const readyForUserRef = useRef<string | null>(null)
if (userId && query.isFetched) readyForUserRef.current = userId
const pbReady = !userId || query.isFetched || readyForUserRef.current === userId
```
This is state-that-should-be-state expressed as a render-phase ref mutation, and it's load-bearing (the comment explains it prevents the whole tree unmounting during onboarding). Not concurrent-safe.
*Fix:* `useState` + a functional update in an effect, or derive from `query.dataUpdatedAt !== 0`.

**M18 · `useReactions.ts:87-97, 156` — dead mutation variable** · `KISS / SOLID-ISP`
```ts
mutationFn: async ({ sessionId, emoji, hasReacted, sessionOwnerId }: { ...; sessionOwnerId?: string }) => {
```
`sessionOwnerId` is destructured, typed and threaded from the public `toggleReaction(sessionId, emoji, sessionOwnerId)` signature — and never read (the notification moved server-side, per the comment at `:110`). Every caller is forced to source a value that goes nowhere.

**M19 · Hand-rolled `ref.current = value` in render in 4 hooks while `useLatest` exists** · `DRY` / `React-perf (advanced-use-latest)`
```ts
useBlocks.ts:65    blockedIdsRef.current = blockedIds
useFollows.ts:102  followingIdsRef.current = followingIds
useNutrition.ts:239 entriesRef.current = entries
useReactions.ts:28 sessionIdsRef.current = sessionIds
```
`hooks/useLatest.ts` is exactly this, documented ("Antes cada componente se escribía su propio `ref.current = fn`"), and adopted only by the 3 timer hooks.

### Low

**L1 · `useCountdown.ts:82-84` — factory re-invoked on every render** · `React-perf (rerender-lazy-state-init)`
```ts
const runnerRef = useRef(createCountdownRunner(remaining, { thresholds, warnOnce }))
```
`useRef` has no lazy-init form, so `createCountdownRunner` runs (and its result is discarded) on every one of the ~4 renders/second this hook drives. Cheap, but it's the hot path.

**L2 · `useCommunityPrograms.ts:417-418` — local variable shadows the global `window`**
```ts
const window = windows.find(w => w.week === milestone.week)
if (!window) continue
```

**L3 · 37 `console.log/warn/error` calls in a shared package** · `Spaghetti`
`usePrograms.ts` (6), `useBodyPhotos.ts` (5), `useReferrals.ts` (4), `useNutrition.ts` (4)… `getPlatform().reportError` exists (`platform.ts:52`) and is used in `useProgress.ts:494` — but often *alongside* the console call (`useProgress.ts:684-685`) rather than instead of it.

**L4 · 145 silent `catch {}` / `.catch(() => {})` across 30 hook files** · `Spaghetti`
Highest density: `useFoodCatalog.ts` (10), `usePrograms.ts` (11), `useProgress.ts` (9), `useNutrition.ts` (7), `useChallenges.ts` (6). Several conflate distinct failures — `useProgramEditor.ts:544` `catch { hasDayConfig = false }` treats a network blip as "this collection doesn't exist in this deployment". The comment at `useProgress.ts:570-574` documents that exactly this pattern hid a 400 for months (#376).

**L5 · `any` density** · `Spaghetti`
`useProgress.ts` 47, `useLeaderboard.ts` 21, `useCommunityPrograms.ts` 14, `useActivityFeed.ts` 14, `useComments.ts` 13. Mostly at the PB-record boundary — `(record: any) => record.day_id` — where a shared `PBRecord<T>` mapper type would recover the typing. Also drives non-null assertions like `challengeMap.get(cid)!` (`useChallenges.ts:133`) and `_pbAvailableResult!` (`lib/pocketbase.ts:38`).

**L6 · `packages/core/package.json` declares no `main`/`module`/`exports` and no index barrel**
Consumers resolve deep paths (`@calistenia/core/hooks/useProgress`) through bundler/tsconfig aliasing only, so the package has no enforced public surface — every internal file is importable, which is why `lib/` internals leak into app code with nothing to stop it.

**L7 · `useChallenges.ts:104` — mutating the PocketBase response record in place**
```ts
if (c.status === 'active' && c.ends_at < today) { expiredIds.push(c.id); c.status = 'ended' }
```
`c` is `p.expand.challenge`, shared with anything else holding that response.

---

## Done well

- **One data-fetching pattern, actually followed.** 59 of 70 hooks use TanStack Query. The 9 non-RQ hooks are almost all legitimately non-server-state (`useCountdown`, `usePausableCountdown`, `useExerciseTimer`, `useLocalize`, `useSessionDetail`, `useMealLoggerActions`, `usePostWorkoutChallenge` are pure/derived), and `useBattle.ts:8-11` opts out with a **stated architectural reason** ("A battle is not cached server state we poll — it is a live session whose only valid representation is the newest snapshot"). Deliberate outliers, not accidents.
- **`platform.ts` inversion works.** For a package shared by a Vite SPA and an Expo app, finding exactly *one* raw DOM access in 15k lines (H6) is a strong result. `storage`, `env`, `analytics`, `connectivity`, `pbAuthStore` and `reportError` are all injected, and `query-client.ts` wires React Query's `onlineManager` through the same adapter.
- **`query-keys.ts` is a genuinely good factory** — 236 lines, domain-grouped, `as const` tuples, and the comments encode real hard-won distinctions (`communityPrograms` vs `programs` at `:104-107`, `mealDayPlans` vs `weeklyMealPlan` at `:185-186`) that would otherwise be tribal knowledge.
- **The countdown family is the model the rest should copy.** `usePausableCountdown` composes `useCountdown` rather than forking it (`usePausableCountdown.ts:75-83`), all the "fire once" logic lives in a pure `createCountdownRunner` in `lib/countdown` that's unit-tested without React, and neither imports RN or DOM. Same for `useBattle` → `lib/battleApi` + `lib/battleRealtime` + `lib/battle`.
- **`lib/optimistic.ts` and `lib/offlineQueue.ts` are careful work.** `makeOptimisticListHandlers` captures `resolvedKey` in the context precisely so a rollback can't land on the wrong key (`:4-5`), and rolls back on `!ctx` rather than `!ctx.prev` with the falsy-value reasoning spelled out (`:50-52`). `offlineQueue`'s `client_id` design (`:25-34`) correctly treats `status: 0` as "unknown" rather than "failed".
- **The comments carry real institutional memory.** `useProgress.ts:530-534` (why `phase: 0` not `-1`), `usePrograms.ts:157-163` (why an empty catalog must throw rather than cache), `useCommentReactions.ts:112-117` (why `hasReacted` is passed in rather than re-read) — each documents a specific past bug. This is what makes the codebase tractable despite the god hooks.

---

## Files reviewed

**Read fully (14):** `useProgress.ts`, `useReactions.ts`, `useCommentReactions.ts`, `useCountdown.ts`, `usePausableCountdown.ts`, `useProgressions.ts` (head), `platform.ts`, `lib/query-client.ts`, `lib/query-keys.ts`, `lib/optimistic.ts`, `lib/pocketbase.ts`, `lib/ai-api.ts`, `package.json`, `.agents/skills/vercel-react-best-practices/rules/advanced-use-latest.md`

**Read substantially (9):** `useChallenges.ts` (1-290), `useProgramEditor.ts` (structure + `saveProgram` 472-668), `useNutrition.ts` (1-330), `usePrograms.ts` (150-400), `useCommunityPrograms.ts` (280-462), `useNotifications.ts` (150-200), `useAuth.ts` (150-200), `useBattle.ts` (1-80), `lib/offlineQueue.ts` (1-60, 224-310)

**Skimmed via targeted grep (all remaining 47 hooks):** patterns swept across the whole scope — `useQuery`/`useMutation` vs `useEffect`+`useState` classification, raw template-literal PB filters, `any` density, silent catches, `console.*`, `pb.authStore` reads, DOM/RN globals, `.subscribe(`, `eslint-disable`, ref-writes-in-render, hard-coded query keys, `isPocketBaseAvailable` guards, `getList` page caps, `loading` derivation.

**Not opened:** the 4 `*.test.ts` files (out of scope per instructions), `lib/` files other than the 5 named (covered by another agent).
