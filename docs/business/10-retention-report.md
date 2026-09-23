# Weekly Retention Report (OpenPanel)

Companion doc for `scripts/openpanel-retention-report.mjs` (issue #826). The
script's own header comment repeats the load-bearing parts of this doc so
they travel with the code; this file is the longer version with the
reasoning and the exact renewal steps.

Read `08-analytics-events.md` first for the event **contract** (what gets
sent, when, with which properties). This doc is about **reading it back**.

## Which project is which

Two self-hosted OpenPanel projects, both under `https://openpanel.guille.tech`:

| Platform | OpenPanel project id | Source of truth |
| --- | --- | --- |
| Mobile (Expo/RN) | `calistenia-app` | `apps/mobile/src/lib/init-core.ts` (`clientId` default `896084a4-…`) |
| Web (Vite) | `tech` | Prior retention research (2026-09-22); **not** the dashboard URL slug `calistenia`, which is not a project id |

The mobile id is verifiable in code (it's the ingestion client's project).
The web id (`tech`) is **not** independently re-verified by this issue — it
comes from earlier ad hoc research recorded in the project's own memory
index. If a report run produces suspiciously empty results for `web`, the
first thing to check is whether `tech` is still the right id in the
dashboard (Settings → General, or wherever the current OpenPanel version
shows it) — override it with `OPENPANEL_PROJECT_ID_WEB` without touching the
script.

Both ids can be overridden per-run:

```
OPENPANEL_PROJECT_ID_MOBILE=...
OPENPANEL_PROJECT_ID_WEB=...
```

## Read mechanism — decided and verified

OpenPanel ships an **official, documented Export API**
(<https://openpanel.dev/docs/api/export>):

- `GET {base}/export/events` — paginated raw events, filterable by `event`,
  `profileId`, `start`/`end`, with `includes=profile,meta`.
- `GET {base}/export/charts` — pre-aggregated series (not used here; raw
  events give more control over the cohort math and are small enough in
  volume for this app).
- Auth headers: `openpanel-client-id` / `openpanel-client-secret`.
- **Requires a `read` or `root` client. The default client created with a
  project is `write`-only (ingestion) and cannot export.**
- Rate limit: 100 requests / 10s per client id (documented; not something
  this report's volume gets close to). `limit` maxes out at 1000/page;
  paginate with `page`.

This was **not** taken on faith from the docs. On 2026-09-23, against the
real instance, with no read credentials available yet:

```
GET https://openpanel.guille.tech/api/                        → 200 {"status":"ok",...}
GET https://openpanel.guille.tech/api/export/events (write client) → 401
  {"error":"Unauthorized","message":"Export: Client is not allowed to export"}
```

This confirms three things at once: the host and `/api` path are right, the
route exists at exactly the documented path, and — as the docs say — the
app's existing ingestion client genuinely cannot read data back. A **new**
client with read access is required; there is no way around creating one.

**Decision: use the Export API, not the internal dashboard tRPC.** The tRPC
route would need Guillermo's live browser session (not something a script or
CI job can hold), and it is not a documented, stable API — it could change
in any dashboard update without notice. The Export API is the supported
path, and it demonstrably works against this instance once a client has
export rights.

### `includes` must say `properties` explicitly — verified against the real server source

`fetchEventsPage()` sends `includes=profile,meta,properties`, not just
`profile,meta`. This was **verified by reading OpenPanel's own server code**
(`apps/api/src/controllers/export.controller.ts` and
`packages/db/src/services/event.service.ts` in `Openpanel-dev/openpanel`,
2026-09-23), not assumed from the docs: the controller builds
`select: { profile: false, meta: false, ...includes.reduce(...) }`, and
`getEventList()` only adds `properties` to the SQL `SELECT` when
`select.properties` is truthy (`if (select.properties) { sb.select.properties
= 'properties' }`). `profile,meta` alone never sets that key — the earlier
version of this script requested `includes=profile,meta` and would **never**
have received `properties` back, for any event, regardless of date range or
whether issue #823 (`is_first_workout`) had shipped. Fixed; see the fetch
layer test in `openpanel-retention-report.test.mjs` (`'requests properties
explicitly...'`) that would catch a regression.

### `end` is an exclusive midnight-UTC cutoff — also verified against the real server source

`toInclusiveEndOfDay()` turns a bare `--to 2026-09-22` into
`2026-09-22T23:59:59.999Z` before it reaches the API. Also verified against
the real server code: the controller does `endDate: end ? new Date(end) :
undefined`, and `getEventList()` filters with `created_at <= endDate`. A
bare date string parses to **midnight at the start** of that day
(`new Date('2026-09-22')` → `2026-09-22T00:00:00.000Z`), so an unmodified
`--to` would have silently dropped every event from the entire last day of
any requested range — including the AC-3 validation range's own last day.
Fixed at the single point where the URL is built, so every caller benefits
without needing to know about it.

### Known fragility of the Export API itself

Not verified against this instance (no read credentials yet), but reported
against OpenPanel upstream and worth knowing before trusting a surprising
number:

- **`properties` has been reported missing from exported events even when
  requested** (openpanel-dev/openpanel#281), independent of the `includes`
  bug above (which meant it was never *requested* at all). The script does
  not assume `properties` is present even now that it's correctly requested
  — see "First-workout abandonment" below, where its absence silently
  switches to the fallback approximation instead of crashing or silently
  under-counting.
- **Event counts have been reported to vary with the `limit` parameter**
  (openpanel-dev/openpanel#296) on some versions. If a re-run of the same
  range produces a different total than a previous run, this is the first
  thing to suspect — try a smaller `limit` in `fetchEventsPage()` before
  assuming the underlying data changed.

## Credentials

Never hardcoded, never committed. Read from the environment (this repo's
scripts don't use `dotenv`; the script optionally loads a root `.env` itself
if one exists — see `loadDotEnvIfPresent()` — so `.env`-based local runs work
without extra flags, and CI/worktrees without a `.env` simply skip that
step instead of failing).

| Variable | Purpose |
| --- | --- |
| `OPENPANEL_READ_CLIENT_ID` / `OPENPANEL_READ_CLIENT_SECRET` | Read (or root) client, tried first for every platform |
| `OPENPANEL_READ_CLIENT_ID_MOBILE` / `_SECRET_MOBILE`, `_WEB` / `_SECRET_WEB` | Per-platform override, used instead of the pair above if the dashboard only allows project-scoped clients |
| `OPENPANEL_CORE_PROFILE_IDS` | Comma-separated profile ids to exclude from the report in addition to Demo Play (see "Exclusions") |
| `OPENPANEL_BASE_URL` | Optional, defaults to `https://openpanel.guille.tech/api` |
| `OPENPANEL_PROJECT_ID_MOBILE` / `_WEB` | Optional, defaults per the table above |

### Creating the read client (one-time, by Guillermo, in the dashboard)

The public docs describe the client's **access levels** (`write` is the
project default; `read`/`root` unlock export) but do not spell out the exact
menu path for the self-hosted dashboard version running at
`openpanel.guille.tech`. Based on how OpenPanel organizes client management
elsewhere in its docs, the expected path is:

1. Open `https://openpanel.guille.tech`, sign in, select the project
   (`calistenia-app` or `tech` — repeat for both, or once if the dashboard
   offers an organization-level client).
2. **Project Settings → Clients** (or **API Keys** — the exact label may
   differ by version).
3. Create a new client, set its access level to **Read** (root also works
   but grants more than this report needs).
4. Copy the client id and secret into `.env` at the repo root as
   `OPENPANEL_READ_CLIENT_ID` / `OPENPANEL_READ_CLIENT_SECRET` (or the
   `_MOBILE`/`_WEB` variants if the dashboard forces one client per
   project). **Never commit `.env` or paste these values anywhere that
   isn't your local machine or Dokploy's env store.**

If the menu wording doesn't match step 2 on the running version, the goal is
unambiguous even if the label isn't: a client whose access level is `read`
or `root`, as opposed to the `write` one the apps already use to send
events.

### Renewing

If the client secret is rotated or revoked (e.g. the client is deleted and
recreated), repeat step 3–4 above and update `.env` (and Dokploy's env store
if this ever runs from CI instead of a laptop). Nothing else in the script
needs to change — credentials are read purely from the environment.

## Exclusions

Two separate lists, on purpose:

1. **`packages/core/lib/analytics.ts::ANALYTICS_EXCLUDED_PROFILE_IDS`**
   (Demo Play, `7imoyrw39rritud`) — an **app-level** decision about what the
   app itself sends to OpenPanel. The report script keeps its own copy
   (`DEMO_PLAY_EXCLUDED_PROFILE_IDS`) rather than importing the TS file,
   because these `scripts/*.mjs` run under plain Node without a bundler and
   `analytics.ts` imports sibling modules without file extensions (works
   under Vite/Metro, not under `node`). Every run checks the copy against
   the real source file's text (`extractAnalyticsExcludedIds()`) and prints
   a warning — not a crash — if they've drifted apart.
2. **`OPENPANEL_CORE_PROFILE_IDS`** (dev + a friend, per the issue) — a
   **reporting-only** decision. These are real devices sending real events;
   excluding them from the app's own analytics would be wrong, but they
   should not count as "new users" in a retention report about actual
   customers. Set this env var to their comma-separated profile ids — never
   commit it, never put it in code, and never print the values (the script
   doesn't log profile ids anywhere for this reason).

## Metric and anchor definitions

### Funnel anchor: the app's `session_started`, not OpenPanel's automatic `session_start`

Both exist and measure different things. OpenPanel's automatic `session_start`
fires on any visit — reload, background wake, no intent implied. The app's
own `session_started` (`packages/core/lib/session-funnel.ts`,
`TRAINING_FUNNEL_EVENTS.sessionStarted`) fires when a workout session
actually starts, **including an anonymous trial session before signup** —
which is exactly why it can legitimately appear *before* `signup_completed`
in the funnel order the issue specifies. Using the app's own event for the
whole funnel (and for the D1/D7 "did they come back" signal, see below)
keeps every step measuring the same kind of intent; mixing in the automatic
event would have made the steps incomparable.

Funnel: `session_started → signup_completed → onboarding_completed →
first_workout_started → workout_completed`, counted as **distinct profiles
per step** (not raw event counts — `workout_completed` and the automatic
events can repeat per profile, and counting events would have inflated the
middle of the funnel relative to the edges).

**The funnel is scoped to the requested `--from`/`--to`, never to the wider
lookahead fetch window described below.** `session_started` and
`workout_completed` are fetched past `--to` so D1/D7 and the north star have
the activity they need (see the next section) — but the funnel's first and
last steps use those same two event names, so passing the raw fetched arrays
straight to `computeFunnel()` would let a profile whose *only* event falls in
that lookahead window inflate the funnel count, past what the report's own
"Rango: …" header says it covers. `buildFunnelEventsByStep()` re-clips
`session_started`/`workout_completed` back to `[--from, --to]` before the
funnel is computed; `runPlatform()` never calls `computeFunnel()` on the raw
`eventsByStep`.

### D1 / D7: weekly cohorts anchored on `signup_completed`

Cohort = profiles whose earliest `signup_completed` falls in a given ISO
week (Monday–Sunday, UTC). "Returned on day N" = has a `session_started`
event whose UTC calendar day is exactly N days after the signup's calendar
day. This is **calendar-day bucketing, not a rolling 24h window** — a
rolling window would shift what "day 1" means depending on the hour someone
happened to sign up at, and two people who signed up the same morning could
end up in different "day 1" windows relative to each other. See the test
`'uses calendar-day boundaries, not a rolling 24h window'` in
`scripts/openpanel-retention-report.test.mjs` for the exact edge case this
guards against.

**The `session_started` events used as the "returned" signal are fetched
past `--to`, not truncated at it.** D7 for a profile who signed up close to
the end of the requested range needs activity up to `signup + 7 days`, which
can fall *after* `--to` — if the fetch itself stopped at `--to`, that later
`session_started` would not be wrongly bucketed, it would simply never be
fetched at all, and the most recent cohorts in the report would read as
having near-zero D1/D7 purely as an artifact of the fetch window, easy to
mistake for a real retention drop. `buildEventFetchWindows()` requests
`session_started` (and `workout_completed`, for the north star below) up to
`--to + LOOKAHEAD_DAYS` (7, matching the widest window either metric needs)
while every cohort is still bucketed strictly by the requested
`--from`/`--to` — only the *lookahead* events get the wider fetch, not the
`signup_completed` events that define cohort membership.

### North star: 3 `workout_completed` in the first 7 days *of the account*

Anchored on `signup_completed`, not on `session_started` or
`first_workout_started`: "their first 7 days" is a property of the
**account**, counted from when it started existing, not of any one session.
Anchoring on a session event instead would make the window's start depend on
when someone happened to first open the app relative to signing up, and
different cohorts would no longer be measured against the same yardstick.
The window is a half-open `[signup, signup + 7d)` — a completion landing
exactly 7 days later does not count, matching "within their first 7 days."
Same fetch-window caveat as D1/D7 above applies here: `workout_completed` is
also fetched up to `--to + LOOKAHEAD_DAYS` so a signup near the end of the
range still has its full 7-day completion window available.

### First-workout abandonment: primary + fallback, and the report says which one ran

Primary: `workout_abandoned.is_first_workout === true` (added by issue #823,
developed in parallel with this one — may not exist in the events for a
given date range yet). The script only trusts this path if **at least one**
`workout_abandoned` event in the fetched range actually carries the
`is_first_workout` key; otherwise (property missing everywhere — either
#823 isn't live yet, or it's the upstream `properties`-missing bug from
`openpanel-dev/openpanel#281`) it falls back automatically.

Fallback (explicit approximation, matches the issue's own wording): a
profile's earliest `first_workout_started` counts as abandoned if there is
no `workout_completed` for that same profile within the next 24 hours. This
can over-count someone who genuinely resumed the same workout much later,
and under-counts nothing — it is a documented approximation, not a second
source of truth. Every report states which method (`is_first_workout` vs.
`fallback_no_matching_completion`) produced its abandonment number, so the
two are never silently mixed across runs.

## Profile identity and known data quirks

- **Count by profile id, never by `deviceId`.** The prior retention research
  already names this as a mistake made once; `op.identify({ profileId:
  user.id, ... })` in `packages/core/hooks/useAuth.ts` ties every event
  after signup to the PocketBase user id, and that id is what this script
  keys everything on.
- **Web has duplicate anonymous profiles.** Before `identify()` runs,
  OpenPanel assigns an auto-generated 32-hex-char anonymous profile id.
  This script does not attempt alias-resolution (merging an anonymous id
  into the real one after the fact) — that would need additional API calls
  this issue's verified access doesn't cover. Instead,
  `isLikelyAnonymousProfileId()` flags them, and the report surfaces a
  caveat line when the web `session_started` count includes any, so a
  reader knows the top of the web funnel may be inflated relative to the
  steps that already require an account. `signup_completed` itself is
  unaffected: `identify()` runs before `track('signup_completed', …)`
  (`useAuth.ts:50-59`), so that event and everything downstream already
  carries the real profile id.

## Running it

```
pnpm report:retention -- --from 2026-08-20 --to 2026-09-22 --platform both
pnpm report:retention -- --from 2026-08-20 --to 2026-09-22 --platform mobile --out weekly.md.local
```

Output goes to stdout by default. `--out <path>` also writes a copy to disk;
the script warns (but does not refuse) if the destination doesn't look
git-ignored, because **this repo is public and a saved report can contain
real, if aggregate, numbers about real users.** Prefer a path ending in
`.local` (already covered by the root `.gitignore`) or something outside the
repo entirely.

## Validation status: explicitly pending

Acceptance criteria asks for the script's output on `2026-08-20..2026-09-22`
to be compared against the prior ad hoc research (mobile: 101
`session_start` → 33 `signup_completed` → 29 `onboarding_completed` → 18
`first_workout_started` → 3 `workout_completed`; D1≈23%, D7≈9%). **This did
not run**, and could not: it requires the read client described above,
which only Guillermo can create (it's a dashboard action, not something this
script — or any automated agent — should self-provision). No such client
existed in `OPENPANEL_READ_CLIENT_ID*` at the time this was built, and the
app's own ingestion client is confirmed `write`-only (see the 401 above).

Exact steps to close this out:

1. Create the read client as described above (both projects, or one
   org-level client if the dashboard offers it).
2. Put the id/secret in `.env` at the repo root.
3. Run `pnpm report:retention -- --from 2026-08-20 --to 2026-09-22`.
4. Compare against the numbers quoted above. Expect some drift even if
   everything is correct: the prior research's `session_start` figure most
   likely came from OpenPanel's *automatic* session event (informal phrasing
   in the issue text), while this script's `session_started` step is the
   app's own explicit event and will legitimately read differently — that
   is not a bug, see "Funnel anchor" above. A large discrepancy in
   `signup_completed` onward (where naming isn't ambiguous) would be the
   real signal something is off.
5. If `--to` is close to *today* when this runs (as it would be for
   `--to 2026-09-22` run on or right after that date), the D7/north-star
   numbers for the most recent week or so of cohorts will still look thin
   **even with the fetch-window fix above** — not because the fetch was
   truncated (that's fixed), but because those users genuinely have not had
   7 real days pass yet. That's an honest "not enough time has elapsed"
   result, not a bug; don't read it as a retention drop. A future
   improvement would be to mark such cohorts as "immature" in the rendered
   table instead of leaving the reader to notice this themselves.

## Extending this report

The pure logic (`computeFunnel`, `computeCohortRetention`, `computeNorthStar`,
`computeFirstWorkoutAbandonment`, `isoWeekKey`, …) lives in
`scripts/openpanel-retention-report.mjs` and is unit-tested in
`scripts/openpanel-retention-report.test.mjs` with in-memory event arrays —
no network, no fixtures on disk. Add a metric by adding a pure function next
to the existing ones, wiring it into `runPlatform()`/`renderPlatformReport()`,
and covering its edge cases (boundary values, empty cohorts, missing
properties) the same way the existing tests do.
