# Backend audit — `pb_hooks/`, `pb_migrations/`, `mcp-server/src/`

Read-only code-quality audit. No files were modified.

## Grade

**C+ overall** — split by sub-scope:

| Scope | Grade | Rationale |
|---|---|---|
| `pb_hooks/` | **B−** | Genuinely disciplined about the JSVM gotchas (isolated runtimes, per-handler `require`, `e.next()` chaining) and backed by 21 test suites, but one hook file still breaks the chain, the notification fan-out does synchronous HTTP in a loop inside a write hook, and filter strings are concatenated rather than bound in 10 places. |
| `pb_migrations/` | **B** | Consistent naming, 179/195 have rollbacks, recent ones are idempotent and preserve field ids. Docked for 11 colliding timestamps and a couple of non-idempotent `fields.add`. |
| `mcp-server/src/` | **C+** | Uniform error handling and `.strict()` input validation everywhere, no `@ts-ignore` debt — but there is no data-access layer at all (167 raw PB calls inside MCP tool handlers), business rules are duplicated across the package boundary and have **already drifted**, and `tools/` has zero tests. |

## Top 3 refactors

1. **Kill the duplicated business logic that has already drifted.** `mcp-server/src/tools/smart.ts` re-implements `packages/core/lib/nutritionGoal.ts`'s TDEE/macro formula with different constants and writes the result to the same collection the app reads (F23). `src/api/insight-context-server.ts` is a self-declared 693-line "FAITHFUL port" of two core modules, with a third verbatim copy of the shared types (F24). Both should import from `packages/core` with `tz`/`pb` threaded as explicit parameters.
2. **Give `mcp-server` a data-access layer and move the AI envelope into one helper.** 12 tool files hold 85 tools, 167 `pb.collection(...)` calls and hand-rolled domain math; 14 `generateObject`/`generateText` sites repeat the same 6-line envelope and the same `(usage as any)` mapping block (F26, F29, F30). Extract `api/repos/*` + `runStructuredGeneration()`.
3. **Make the notification fan-out asynchronous and fix `e.next()`.** `referral_side_effects.pb.js` silently kills the hook chain for `referrals` (F1), and the follower/participant loops issue up to 500 sequential 10-second-timeout `$http.send` calls inside a record-create hook (F3). Queue the push fan-out instead of sending inline.

---

## Findings

### HIGH

#### F1 — `referral_side_effects.pb.js` never calls `e.next()`, silently killing the hook chain
**File:** `pb_hooks/referral_side_effects.pb.js:11-93` · **Category:** Correctness-smell

```js
onRecordAfterCreateSuccess((e) => {
  const referrerId = e.record.getString("referrer")
  ...
  if (!referrerId || !referredId) return          // ← early return, no e.next()
```
`grep -c 'e.next()'` returns **0** for this file; every other hook file in the repo returns ≥ hook count. The repo documents this exact failure mode twice — `workout_stats.pb.js:21-27` and `notification_service.pb.js:17-23` both explain that a handler which doesn't chain silently prevents handlers *other files* registered for the same collection from ever running (#412), with no log line. It is currently harmless only because no other file registers on `referrals` today; the next one added dies silently.
**Fix:** open the handler with `e.next()` like every sibling file does.

#### F2 — Battle push notifications drop `actorId`, defeating the block guard the helper exists to enforce
**File:** `pb_hooks/utils/battles.js:569-575`, `593-599`, `658-664` · **Category:** Correctness-smell

```js
  notifications.sendPush(
    creatorId,
    name || 'Alguien',            // ← the other user's name IS the push title
    'se ha unido a tu batalla',
    '/battle/' + battleId,
    'challenge_join',
  )                               // ← 5 args; the 6th (actorId) is missing
```
`utils/notifications.js:120-126` documents the contract explicitly: *"`actorId` es opcional pero debe pasarse SIEMPRE que el push hable de otro usuario (#386) … el push se enviaba igual: quien bloquea seguía recibiendo el nombre y el texto del bloqueado"*. All three battle notifiers violate it, and two of them put the other user's name in the title — the exact leak #386 closed.
**Fix:** pass the acting user id as the 6th argument in all three call sites.

#### F3 — Notification fan-out does synchronous HTTP per recipient inside a write hook
**File:** `pb_hooks/utils/notifications.js:187-201`; `pb_hooks/notification_service.pb.js:374-386` · **Category:** Correctness-smell / perf

```js
for (var i = 0; i < followers.length; i++) {
  ...
  createNotification(fid, type, actorId, referenceId, "user", data)
  if (push) { sendPush(fid, push.title, push.body, push.url, type, actorId) }
}
```
Each iteration costs: `isBlocked` query + `prefAllows` query + a record save + (in `sendPush`) another `isBlocked` + `prefAllows` + `$http.send({ timeout: 10 })`. `getFollowers` caps at 500 (`notifications.js:172`) and the challenge-complete loop at 100 (`notification_service.pb.js:365`), so a popular user completing a workout can hold the create request open for minutes. The whole loop runs inside `onRecordAfterCreateSuccess`.
**Fix:** enqueue the fan-out (one `$http.send` carrying the recipient list, or a job row the AI API drains) rather than one blocking call per recipient.

#### F4 — Session-owner lookup re-implemented inline, and the copies miss `circuit_sessions`
**File:** `pb_hooks/notification_service.pb.js:103-114`, `188-195`, `202-206` vs `pb_hooks/utils/blocks.js:62-72` · **Category:** DRY

`blocks.js` already has the helper, and its own comment names the problem:
```js
// Dueño (userId) de un session_id de comments/feed_reactions.
// Cascada try/catch como notification_service.pb.js, AMPLIADA con
// circuit_sessions (la del servicio de notifs no lo incluye hoy).
function findSessionOwner(app, sessionId) { var cols = ["sessions", "cardio_sessions", "circuit_sessions"] ... }
```
The notification service instead inlines a two-collection cascade three times (`sessions` → `cardio_sessions`), so a reaction or comment on a **circuit** session notifies nobody — it falls off the end of both `try`s and `return`s.
**Fix:** call `blocks.findSessionOwner(...)` (or move it to a neutral `utils/sessions.js`) from all three sites.

#### F23 — `cal_calculate_macros` duplicates `packages/core` TDEE math and the two have already diverged
**File:** `mcp-server/src/tools/smart.ts:993-1041` vs `packages/core/lib/nutritionGoal.ts:66-91` · **Category:** DRY / Correctness-smell

```js
// mcp-server/src/tools/smart.ts:1020            // packages/core/lib/nutritionGoal.ts:74
case "fat_loss":                                 case 'fat_loss': dailyCalories = tdee - 500 * paceFactor; break
  targetCalories = tdee - 400;                   case 'recomp':   dailyCalories = tdee - 200; break
  proteinPerKg = 2.2;                            default:         proteinPerKg = 1.8; break
```
Verified divergences: fat-loss deficit 400 vs 500×pace · recomp maintenance vs −200 kcal · maintain protein 1.6 vs 1.8 g/kg · `pace` unsupported server-side. The BMR line is byte-identical (`10 * weight + 6.25 * height - 5 * age ± …`), so this is a fork, not an independent design. The tool then **upserts into the same `nutrition_goals` collection** the app reads (`smart.ts:1057-1066`), so asking the assistant to recalculate silently overwrites the app's own targets with different numbers.
**Fix:** import `calculateMacros` from `packages/core/lib/nutritionGoal` and delete the inline copy.

#### F24 — Insight context and its types exist in three hand-maintained copies
**File:** `mcp-server/src/api/insight-context-server.ts:1-22`, `:31-35`; `cross-insight-generator.ts:58-105`; `sleep-insight-generator.ts:34-67` · **Category:** DRY

```
* insight-context-server.ts — server-side (cron-triggered) FAITHFUL port of
* packages/core/lib/buildInsightContext.ts + packages/core/lib/monthActivity.ts
```
```ts
// cross-insight-generator.ts declares InsightDayRow/InsightSummary as LOCAL
// (non-exported) interfaces … Re-declared here verbatim
```
693 lines of deliberately duplicated aggregation logic, plus `InsightContext`/`InsightDayRow`/`InsightSummary` declared three times with **different field sets** (the sleep copy has 7 row fields, the cross copy has 18). The stated reason for the fork — core's module-level `_tz` singleton — is a parameterization problem, not an inherent barrier; `insight-context-server.ts` already solved it by threading `tz` explicitly.
**Fix:** parameterize `buildInsightContext` on `tz` + a PB client in `packages/core`, export the types once, and import from both sides.

#### F25 — `mcp-server` test coverage is near-zero where the logic lives
**File:** `mcp-server/src/**` · **Category:** Correctness-smell

Four test files exist: `api/prompts.test.ts`, `api/prompts.langfuse.test.ts`, `api/reminder-dispatcher.test.ts`, `api/text-sanitizer.test.ts`. Untested: 22 of 26 `api/` modules — including every generator, `job-processor`, `push-sender`, `fcm-sender`, `meal-analyzer`, `insight-context-server`, `receipt-sanitizer` — plus **all 12 `tools/` files** (85 tools, 167 PocketBase calls, the macro math of F23). By contrast `tests/pb_hooks/` has 21 suites.
**Fix:** start with the pure functions that already have no I/O — `receipt-sanitizer`, `model-resolver`, `utils.ts` date helpers, and the extracted macro/insight logic once F23/F24 land.

---

### MEDIUM

#### F5 — Filter strings concatenated instead of bound, inconsistently within the same files
**Files:** `utils/blocks.js:17`, `user_blocks.pb.js:21`, `:40`, `utils/notifications.js:64`, `:171`, `:210-211`, `:270`, `utils/workout_stats.js:87`, `:108`, `notification_service.pb.js:363` · **Category:** Spaghetti / Correctness-smell

```js
// utils/blocks.js:17 — concatenated
"(blocker = '" + a + "' && blocked = '" + b + "') || (blocker = '" + b + "' && blocked = '" + a + "')",
// utils/blocks.js:43 — bound, 26 lines later in the same file
"blocker = {:u} || blocked = {:u}", "", 0, 0, { u: userId }
```
`utils/notifications.js:210-211` is the worst case because `since` is a formatted string rather than a PB-generated id. `battle_api.pb.js` and `public_challenge_preview.pb.js` bind correctly throughout, so the codebase knows the right form.
**Fix:** convert all ten to `{:param}` binding; the values are already available as locals.

#### F6 — `utils/battles.js` is a god module
**File:** `pb_hooks/utils/battles.js:1-1099` (55 exported symbols, `module.exports` at `:1027`) · **Category:** SOLID-SRP

One file owns: state-transition tables, config validation, progress arithmetic, scoring/ranking, record serialization, display-name lookup, three notification senders, invite token hashing/issuance, idempotency-key claiming, response persistence, expiry sweeping, transaction wrapping, and HTTP error mapping.
**Fix:** split into `battles/state.js`, `battles/scoring.js`, `battles/invites.js`, `battles/notify.js`, `battles/http.js`; the per-handler `require` pattern makes this free.

#### F7 — Eight battle routes repeat the same 12-line envelope
**File:** `pb_hooks/battle_api.pb.js:63-110`, `154-190`, `240-332`, `336-379`, `383-438`, `442-485`, `489-545`, `549-601`, `605-634` · **Category:** DRY

Every one is: `require` → `requireUserId(e)` → `pathValue("id")` → `readBody(e)` → `runGuarded($app, fn)` → `findBattle($app, id)` → `snapshotOf(...)` → `catch { respondError }`.
**Fix:** a `battles.route(function (ctx) {...})` wrapper in `utils/battles.js` that supplies `userId`/`battleId`/`body`/`txApp` and handles the re-read + snapshot + error mapping.

#### F8 — `snapshotOf` does an N+1 user lookup, on every mutation
**File:** `pb_hooks/utils/battles.js:677-683` · **Category:** Correctness-smell / perf

```js
for (var i = 0; i < participants.length; i++) {
  var row = serializeParticipant(participants[i])
  row.display_name = displayNameFor(app, row.user)   // one findRecordById per participant
```
`snapshotOf` is the return value of all 8 mutation routes *and* the polled `/snapshot` endpoint, so a live 6-person battle re-reads 6 user records on every progress tick from every device.
**Fix:** one batched `findRecordsByFilter("users", "id ?~ ...")` (or cache per request) instead of a lookup per row.

#### F9 — Two different display-name resolutions
**File:** `pb_hooks/utils/battles.js:534-541` vs `pb_hooks/utils/notifications.js:24-31` · **Category:** DRY

```js
// battles.js — display_name only
return app.findRecordById('users', userId).getString('display_name') || ''
// notifications.js — three-step fallback
return user.getString("display_name") || user.getString("name") || user.getString("email").split("@")[0] || ""
```
A user with no `display_name` shows as blank in the battle standings and by name in the notification about that same battle.
**Fix:** one helper, one fallback chain (see F10 for which).

#### F10 — Display-name fallback leaks the email local-part cross-user
**File:** `pb_hooks/utils/notifications.js:27` · **Category:** Correctness-smell

```js
return user.getString("display_name") || user.getString("name") || user.getString("email").split("@")[0] || ""
```
The result lands in notification `data.followerName`/`reactorName` and in push titles delivered to *other* users. `users_field_privacy.pb.js:52` deliberately keeps `email` out of the public whitelist and PocketBase gates it behind `emailVisibility`; this path routes around both.
**Fix:** drop the email branch — fall back to a neutral literal ("Alguien"), which every caller already does with `|| "Alguien"`.

#### F11 — `todayDateString` mixes the server clock with a UTC marker
**File:** `pb_hooks/utils/notifications.js:219-224`, used at `:250` · **Category:** Correctness-smell

```js
return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + ...   // server LOCAL date
...
var todayStart = todayDateString() + " 00:00:00.000Z"                                 // labelled UTC
```
`utils/workout_stats.js:66-72` gets this right (`Date.UTC` throughout) and documents why. The "first session of the day" gate is off by a day whenever the server is not on UTC.
**Fix:** build the day with `getUTCFullYear/getUTCMonth/getUTCDate`, or reuse `workout_stats.serverToday()`.

#### F12 — `block_guards.pb.js` is five copies of one guard
**File:** `pb_hooks/block_guards.pb.js:10-33`, `36-44`, `47-59`, `62-70`, `73-85` · **Category:** DRY / SOLID-OCP

Each handler is: read actor field → resolve counterparty → `isBlocked` → `throw new BadRequestError("No se pudo completar la acción")` → `e.next()`. Only the collection name, the actor field name, and the counterparty resolution differ.
**Fix:** a descriptor table `[{collection, actorField, resolveOwner}]` driving one registration loop — new guarded collections then cost one line.

#### F13 — Three byte-identical handlers, twice
**File:** `pb_hooks/notification_service.pb.js:466-478`, `480-492`, `494-506`; `pb_hooks/workout_stats.pb.js:34-44`, `49-59`, `63-73` · **Category:** DRY

The notification trio differs *only* in the collection string:
```js
onRecordAfterCreateSuccess(function(e) { e.next(); try { ... helpers.checkReferralBonus(userId); helpers.notifyFriendsOnWorkout(userId) } ... }, "sessions")
// …identical body… }, "circuit_sessions")
// …identical body… }, "cardio_sessions")
```
**Fix:** `["sessions","circuit_sessions","cardio_sessions"].forEach(function (c) { onRecordAfterCreateSuccess(handler, c) })` — the closure variable is captured at registration time, which is outside the isolated-runtime problem.

#### F14 — Silent result caps across the hooks
**Files:** `user_blocks.pb.js:41` (500 notifications), `notification_service.pb.js:365` (100 participants), `utils/notifications.js:172` (500 followers), `weekly_insights.pb.js:26`, `:32` (5000 push tokens) · **Category:** Correctness-smell

None log when the cap is reached, so a challenge with 101 participants silently leaves one un-notified and a block silently leaves notification 501 in place. `battle_api.pb.js:802-804` shows the right pattern:
```js
if (stale.length >= BATTLE_BATCH || expiredInvites.length >= INVITE_BATCH) {
  console.log("[battles_expiry] hit a batch cap — more remain, next run in 5 minutes")
}
```
**Fix:** paginate, or at minimum log on `length >= cap` as the expiry sweep does.

#### F15 — Participant count fetched in full to read `.length`
**File:** `pb_hooks/public_challenge_preview.pb.js:46-55` · **Category:** Correctness-smell / perf

```js
participantCount = $app.findRecordsByFilter(
  "challenge_participants", "challenge = {:cid}", "", 0, 0, { cid: id }
).length
```
`limit 0` = unbounded; every row of an express challenge is materialized on an **unauthenticated** public endpoint just to produce an integer.
**Fix:** `$app.db().newQuery("SELECT COUNT(*) ...")`, or cap the limit.

#### F20 — Eleven migrations share a timestamp with another migration
**File:** `pb_migrations/` · **Category:** Correctness-smell

Colliding prefixes: `1773243361`, `1773243396`, `1773246964`, `1773251039`, `1774000048`, `1774000063`, `1774378015`, `1774378016`, `1782700000`, `1782800000`, `1783600000`. E.g. `1783600000_backfill_user_stats_workouts.js` and `1783600000_race_routes.js`, or `1782800000_add_challenge_preset_key.js` and `1782800000_created_battles.js`. Apply order then falls back to the alphabetical suffix, which is arbitrary relative to intent.
**Fix:** use real `Date.now()` values (as the auto-generated `1773…` ones do) rather than hand-rounded constants.

#### F26 — `mcp-server` has no data-access layer; tools own the queries and the rules
**File:** `mcp-server/src/tools/*` · **Category:** Separation-of-concerns / SOLID-SRP

167 `pb.collection(...)` calls live directly in MCP tool handlers: `programs.ts` (1285 lines / 16 tools / 38 queries), `smart.ts` (1408 / 9 / 34), `pantry.ts` (859 / 9 / 10). `cal_calculate_macros` (`smart.ts:988-1113`) is 125 lines doing physiology math, goal-policy constants, a PB upsert, and markdown table rendering in one handler. Only `pantry.ts` and `recipes.ts` import anything from `api/`.
**Fix:** `api/repos/{programs,nutrition,progress}.ts` for queries and `api/domain/*` for rules; tools shrink to schema + call + formatting.

#### F27 — Two config modules, plus 24 loose `process.env` reads
**File:** `mcp-server/src/config.ts:8-10` vs `mcp-server/src/api/config.ts:16-17` · **Category:** DRY / SOLID-DIP

```ts
// src/config.ts                                        // src/api/config.ts
export const PORT = parseInt(process.env.PORT ??        port: parseInt(process.env.PORT ??
  process.env.MCP_SERVER_PORT ?? "3001", 10);             process.env.MCP_SERVER_PORT ?? "3001", 10),
export const PB_URL = process.env.POCKETBASE_URL ??     pocketbaseUrl: process.env.POCKETBASE_URL ??
  "http://127.0.0.1:8090";                                "http://127.0.0.1:8090",
```
Both call `dotenv.config()`. Outside them, 24 more direct reads (`POCKETBASE_URL` ×3, `LANGFUSE_SECRET_KEY`/`LANGFUSE_PUBLIC_KEY` ×7 each, `INTERNAL_API_KEY` ×2, VAPID/FCM keys). A default changed in one place silently disagrees with the other.
**Fix:** one config module, imported everywhere; delete the duplicate.

#### F28 — `getTier` / `resolveTier`, a duplicate the code documents as such
**File:** `mcp-server/src/mcpuse/api-routes.ts:72-74` vs `src/api/model-resolver.ts:102-106` · **Category:** DRY

```ts
/** Mirrors mcpuse/api-routes.ts getTier() — the shared resolution rule for user.tier → Tier. */
export function resolveTier(user: Record<string, unknown> | null | undefined): Tier {
```
`api-routes.ts` never imports it and keeps its own copy.
**Fix:** import `resolveTier`, delete `getTier`.

#### F29 — The same `(usage as any)` mapping block, six times
**File:** `src/api/pantry-parser.ts:36-40`, `:80-84`, `:129-133`; `meal-plan-generator.ts:154`, `:196`; `pantry-plan-generator.ts:136` · **Category:** DRY / `any` abuse

```ts
usage: {
  prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
  completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
  total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
},
```
Eighteen `as any` casts total, all working around one AI-SDK field-naming question that nobody resolved.
**Fix:** one `normalizeUsage(usage: LanguageModelUsage)` with the real SDK type; `meal-analyzer.ts:235` and `food-lookup.ts:96` already use the typed `step.usage?.inputTokens` form.

#### F30 — Fourteen AI call sites share one envelope and no abstraction
**File:** `src/api/{weekly,sleep,cross}-insight-generator.ts`, `pantry-parser.ts` ×3, `meal-plan-generator.ts` ×2, `pantry-plan-generator.ts`, `meal-analyzer.ts` ×2, `food-lookup.ts`, `free-session-generator.ts` ×2 · **Category:** DRY / SOLID-OCP

Every one is: `resolveModel(tier)` → `getPromptWithMeta(name)` → build user text → `generateObject({ model, schema, instructions, messages, telemetry: langfuseTelemetry(name, …) })` → `{ ...object, model_used: modelName }`. Adding a generator means copying ~15 lines of plumbing, which is how the `usage` block (F29) and the telemetry-arg inconsistency (weekly/sleep/cross pass no `prompt: langfusePrompt`, the other 11 do) both spread.
**Fix:** `runStructuredGeneration({ promptName, schema, userText, tier, metadata })` in `api/`; each generator keeps only its schema and its text builder.

#### F31 — Byte-identical number formatters in two generators
**File:** `src/api/sleep-insight-generator.ts:76-79` vs `src/api/cross-insight-generator.ts:114-117` · **Category:** DRY

```ts
const n1 = (v: number | null | undefined): string => v == null ? "?" : Math.round(v * 10) / 10 + "";
const n0 = (v: number | null | undefined): string => v == null ? "?" : Math.round(v) + "";
```
**Fix:** move to `src/utils.ts` (which already holds the date formatters).

#### F32 — The weekly-insight cron route is a 78-line business transaction in the transport layer
**File:** `src/mcpuse/api-routes.ts:507-584` · **Category:** Separation-of-concerns

One Hono handler owns: internal-key auth, user fetch, tz/tier resolution, context building, the `MIN_INSIGHT_DAYS` cost gate (a magic 3 declared inline at `:534`, documented as mirroring `packages/core/hooks/useCrossInsights.ts`), a dedup query, generation, persistence, and push. None of it is reachable or testable except over HTTP.
**Fix:** `api/weekly-insight-job.ts` exporting `runWeeklyCrossInsight(userId, periodType)`; the route becomes auth + parse + call.

#### F33 — `any` throughout the HTTP layer
**File:** `src/mcpuse/api-routes.ts:37`, `:56`, `:72`, `:78-79`, `:408`, `:425`, `:439`, `:519`, `:522` · **Category:** Spaghetti

```ts
function applyRateLimit(c: any, userId: string): RateLimitResult {
async function getAuthUser(c: any, pbUrl: string): Promise<any | null> {
function apiError(c: any, err: unknown): Response { const e = err as any;
```
15 `any`s in this file — the highest in the codebase. Hono exports `Context`, and PocketBase exports `RecordModel`.
**Fix:** type `c: Context`, `Promise<RecordModel | null>`, and narrow the error with a type guard instead of `as any`.

#### F34 — 590 lines of prompt text hardcoded alongside the Langfuse copies
**File:** `src/api/prompts.ts:29-620` · **Category:** DRY

`FALLBACKS` holds 16 full Spanish prompts (`meal-analyzer` alone is 55 lines) that are also the live Langfuse prompts. There is no mechanism keeping them in sync — the fallback is silently used whenever `LANGFUSE_SECRET_KEY` is unset, so drift is invisible until output quality changes.
**Fix:** move the fallbacks to versioned `.md` files under `src/api/prompts/`, and add a check that flags when a fallback and its Langfuse version differ.

#### F35 — `startOfWeek` mixes the server clock with the target timezone
**File:** `src/utils.ts:65-72` · **Category:** Correctness-smell

```ts
const todayStr = today(tz);
const d = new Date(`${todayStr}T12:00:00`);   // parsed in SERVER local time
const day = d.getDay();                        // server-local weekday
d.setDate(d.getDate() + diff);
return toDateStr(d, tz);                       // formatted in tz
```
`toDateStr`/`today`/`daysAgo` are all tz-correct; only this one round-trips through the server clock. The 12:00 anchor hides it for most offsets, but not for the ±12h edges.
**Fix:** do the arithmetic in the target zone (dayjs with the `timezone` plugin is already a dependency — `insight-context-server.ts:26-28` imports it).

#### F36 — A new PocketBase client and a network `authRefresh()` per request
**File:** `src/mcpuse/api-routes.ts:56-68` · **Category:** Correctness-smell / perf

```ts
const pb = new PocketBase(pbUrl);
pb.authStore.save(token, null);
const result = await pb.collection("users").authRefresh();
```
Every `/api/*` call pays a full PB round-trip before doing any work. `src/auth.ts:46-75` has the identical routine for the MCP side (a second duplicate).
**Fix:** verify the JWT locally and only `authRefresh()` when the record is actually needed, or memoize per token with a short TTL — and share one implementation with `auth.ts`.

#### F37 — Rate limiting is per-process in-memory state
**File:** `src/mcpuse/api-routes.ts:26-33` · **Category:** Correctness-smell

```ts
const buckets = new Map<string, RateBucket>();
setInterval(() => { ... }, 5 * 60 * 1000).unref();
```
Limits reset on every deploy and are divided by the instance count if the service is ever scaled. Acceptable for one container; worth a comment saying so, since nothing in the file says it.
**Fix:** document the single-instance assumption, or move the buckets into PocketBase/Redis.

#### F21 — `fields.add` without an existence check, next to a migration that guards it
**File:** `pb_migrations/1783900000_offline_dedup_client_id.js:40-53` vs `1784000000_private_accounts.js:107-114` · **Category:** Correctness-smell

```js
// 1783900000 — unguarded, and the same literal id for two different collections
collection.fields.add(new Field({ ..., "id": "text_client_id", "name": "client_id", ... }))
// 1784000000 — guarded
if (!users.fields.find((f) => f.name === "is_private")) { users.fields.add(new Field({ ... })) }
```
The index push right below it *is* made idempotent (`.filter(i => !i.includes(...))`), so the intent was clearly there for the field too.
**Fix:** wrap the `fields.add` in the same `.find()` guard the neighbouring migration uses.

---

### LOW

| # | File:line | Evidence | Category | Fix |
|---|---|---|---|---|
| F16 | `pb_hooks/battle_api.pb.js:774` | `stale[i].set("revision", stale[i].getInt("revision") + 1)` — inlines what `battles.bumpRevision` (`utils/battles.js:701`) does, in the one place that doesn't call it | Spaghetti | Call `battles.bumpRevision(stale[i])` |
| F17 | `pb_hooks/race_og_tags.pb.js:16-32` | `routerUse((e) => { const BOT_RE = /bot\|crawler\|.../i; ... })` — a global middleware that recompiles a regex and tests the path + UA on **every** request in the app, to serve one crawler route | KISS / perf | Use `routerAdd("GET", "/race/{id}", …)` and fall through with `e.next()` for non-bots |
| F18 | `pb_hooks/notification_service.pb.js:163`, `:203` | `$app.findRecordById("comments", parentId)` fetched twice in the same handler, once to notify the parent author and once to test `skipOwner` | KISS | Fetch once, reuse |
| F19 | `pb_hooks/referral_side_effects.pb.js:46`, `:60` | `pt.set("amount", 100)` / `pt2.set("amount", 50)` — the reward policy as bare literals in the middle of a hook | Spaghetti | Named constants at the top of the file with the issue reference |
| F22 | `pb_migrations/1774000048…` and 15 others | 16 of 195 migrations pass only an up function (all predate `1776…`); the rest all have a rollback | KISS | Leave as-is; note in the migration README that pre-`1776` migrations are forward-only |
| F38 | `src/prompts.ts` vs `src/api/prompts.ts` | Two files with the same basename and unrelated jobs — MCP prompt registration vs the Langfuse prompt store | Spaghetti | Rename to `mcp-prompts.ts` / `prompt-store.ts` |
| F39 | `src/mcpuse/api-routes.ts:557`, `:596` | `const { generateCrossInsight } = await import("../api/cross-insight-generator.js")` while the other seven generators are statically imported at `:13-21` | KISS | Pick one; static, since the process loads them all anyway |
| F40 | `src/api/model-resolver.ts:49`, `:67`, `:73` | `(config.providers as Record<string, boolean>)[provider]` — the same cast three times because `AppConfig.providers` is a closed struct | Spaghetti | Type `providers` as `Record<Provider, boolean>` in `AppConfig` |

---

## Done well

- **The JSVM gotchas are genuinely internalized, not just documented.** 12 of 13 hook files call `e.next()` at least once per registered handler; `notification_service.pb.js:17-23`, `workout_stats.pb.js:21-27` and `follow_requests.pb.js:23-29` each explain *why* with the issue number, and every handler does its own `require` inside the body. `users_field_privacy.pb.js:35-38` even explains why the whitelist array can't be hoisted.
- **`battle_api.pb.js` is a model transport layer.** Thin routes, all state changes inside `runGuarded` transactions, idempotency keys claimed per endpoint, one `respondError` mapping, and a documented reason for every non-obvious ordering decision (e.g. `:505` — "checked before claiming the idempotency key, so a rejected call does not burn it"). It is the file the rest of `pb_hooks` should imitate.
- **`utils/workout_stats.js:156-192` fixes lost-update the right way** — a single atomic `UPDATE … COALESCE(total_sessions,0)+1` with the streak expression bound twice, plus an explicit note that the SQL bypasses record hooks and therefore calls `checkStreakMilestone` by hand *using the same function the hook uses, not a copy*.
- **`users_field_privacy.pb.js:74-84` derives the redaction from the live schema** rather than a maintained blacklist, so a new `users` column is private by default — with the comment explaining that the opposite choice is exactly how `hr_avg`/`hr_max` leaked in #386.
- **`pb_hooks` is well tested**: 21 test suites under `tests/pb_hooks/`, including `private_accounts`, `block_reads`, `public_views` and `user-stats`.
- **`mcp-server` input validation and error handling are uniform**: every one of the 85 tool schemas ends in `.strict()`, every tool handler returns `errorResult(...)` from its catch, every route returns `apiError(c, err)`, and `apiError` (`api-routes.ts:78-92`) distinguishes AI-SDK errors (502), Zod errors (422) and everything else, gating debug detail on `NODE_ENV`.
- **No accumulated suppression debt in `mcp-server`**: zero `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, or `FIXME` across `src/`.
- **`model-resolver.ts:22-33`** is a config-driven candidate table with an override path rather than the `switch` chain this usually turns into — adding a provider is a table row.
- **Recent migrations are careful**: `1784000000_private_accounts.js` guards both `fields.add` calls with `.find()`, backfills before hardening the rule, keeps a full rollback, and its 57-line header records an empirically verified fact about `@collection.follows` aliasing that would otherwise be lost.

---

## Files reviewed

**Read fully**
- `pb_hooks/block_guards.pb.js`, `follow_requests.pb.js`, `public_challenge_preview.pb.js`, `public_referral_lookup.pb.js`, `push_token_takeover.pb.js`, `race_og_tags.pb.js`, `referral_side_effects.pb.js`, `user_blocks.pb.js`, `users_field_privacy.pb.js`, `weekly_insights.pb.js`, `workout_stats.pb.js`, `notification_service.pb.js`
- `pb_hooks/utils/blocks.js`, `pb_hooks/utils/notifications.js`, `pb_hooks/utils/workout_stats.js`
- `pb_migrations/1784000000_private_accounts.js`; `1783900000_offline_dedup_client_id.js` (first 60 lines)
- `mcp-server/src/api/admin-pb.ts`, `config.ts`, `telemetry.ts`, `model-resolver.ts`, `weekly-insight-generator.ts`, `sleep-insight-generator.ts`, `cross-insight-generator.ts`, `pantry-parser.ts`
- `mcp-server/src/config.ts`, `utils.ts`, `auth.ts`
- `packages/core/lib/nutritionGoal.ts:40-130` (out of scope; read only to confirm the F23 duplication)

**Read in part / skimmed**
- `pb_hooks/battle_api.pb.js` (read fully: 1-250, 250-500, 500-805 — i.e. all of it, in three passes)
- `pb_hooks/utils/battles.js` (full function/export inventory + lines 534-700 read closely; scoring/validation/invite internals skimmed)
- `mcp-server/src/mcpuse/api-routes.ts` (lines 1-120 and 500-600 read; remainder skimmed via grep for error/`any`/`catch` patterns)
- `mcp-server/src/tools/smart.ts` (tool inventory + `cal_calculate_macros` 963-1120 read fully; other 8 tools skimmed)
- `mcp-server/src/api/prompts.ts` (lines 1-90 + fallback key inventory)
- `mcp-server/src/api/insight-context-server.ts` (header + type declarations, lines 1-40)
- `mcp-server/src/api/push-sender.ts`, `fcm-sender.ts` (first ~50 lines each)
- `mcp-server/src/lib/tool-i18n.ts` (first 40 lines)

**Analyzed by pattern, not read line-by-line**
- `pb_migrations/*.js` (195 files) — naming, timestamp collisions, rollback presence, `fields.add` idempotency, `removeById`+`add` pairs, shared rule-clause duplication
- `mcp-server/src/tools/{programs,nutrition,pantry,exercises,gamification,progress,workouts,circuits,health,media,recipes}.ts` — tool counts, `pb.collection` call counts, `.strict()` coverage, `errorResult` coverage, `outputSchema`/view coverage
- `mcp-server/src/views/*.schema.ts`, `src/data/`, `src/resources.ts`, `src/server.ts`, `src/bootstrap.ts`, `src/standalone.ts`, `src/oauth.ts`, `src/mcpuse/{auth-bridge,oauth-routes}.ts` — env access, `new PocketBase` sites, `any` counts, suppression-comment counts

**Not found / not applicable**
- No `.agents/skills/pocketbase-best-practices/` in-repo variant beyond the one at that path (it exists and was read: SKILL.md rule index); rules cited above are `sdk-filter-binding`, `sdk-initialization`, `query-n-plus-one`, `rules-locked-vs-open`.
