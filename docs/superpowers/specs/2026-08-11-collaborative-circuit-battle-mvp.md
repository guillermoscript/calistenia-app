# Collaborative Circuit Battle MVP

Version: 1 · Issue #356 · Builds on the #355 data contract
([2026-08-09](./2026-08-09-collaborative-circuit-battle-data-contract.md), version 1)

#355 shipped the contract: three collections, shared types, pure state machines, and a
set of `null` mutation rules. This document records the decisions that turn it into a
working feature — where the server lives, how long an invite lasts, how idempotency is
represented, what the countdown tolerance is, and what happens in each edge case. The
#355 spec remains accurate for the data model; where the two disagree, this one wins.

## Decisions the contract deferred

### 1. The API lives in `pb_hooks`, not the AI API

`pb_hooks/battle_api.pb.js` with shared logic in `pb_hooks/utils/battles.js`.

Three reasons. Atomicity: consuming an invite while creating the participant row, and
checking a transition while writing it, both need `runInTransaction`, which only exists
inside PocketBase. Realtime: fan-out is a side effect of the write itself, so writing
from another service would add a network hop and buy nothing. Precedent:
`public_referral_lookup.pb.js` already does server-authoritative routing this way.

The costs are real and worth stating. The JSVM has no TypeScript, so the state machines
in `packages/core/lib/battle.ts` are transcribed by hand into `utils/battles.js` —
`tests/pb_hooks/battles.test.mjs` is what keeps the two copies honest. Route callbacks
run in isolated runtimes, so each one `require`s the helpers inside its own body. And
**production needs a PocketBase restart** after deploy to load new hook files; the
migration applies automatically, the hooks do not.

### 2. Invite TTL: 24 hours

The binding constraint is not the lobby, it is the logged-out friend who has to install
the app and finish signup before the token is consumed. Minutes would break that. It is
not a security-relevant window because joining is *also* gated on the battle still being
in `lobby`, and lobbies expire in 2 hours.

Tokens are **single-use**. A link that escapes the group chat can burn at most one seat.
The lobby UI issues a fresh token on every share, so the creator still experiences it as
"tap share, send a link".

### 3. Idempotency: the `battle_mutations` ledger

New collection (migration `1783200000_battle_api_support.js`), completely
API-inaccessible, with a unique index on `(battle, mutation_key)`. Mutating routes accept
an `idempotency_key`; the server inserts the ledger row inside the same transaction, and
an existing row means "already applied".

A replay returns the **current** snapshot with `replayed: true`, not a stored one:
handing back a stale snapshot is exactly what the reconnect contract forbids.

Two endpoints deliberately opt out. **Progress** is already idempotent — the monotonic
clamp makes a replayed value a no-op — and a ledger row per tick would grow without
bound. **Invite creation** opts out because the raw token is never stored, so a replay
could only ever return a null token; an extra single-use token is harmless.

The field is `mutation_key`, not `key`: `key` is reserved enough in SQL that a filter
would need quoting, and a mis-quoted filter fails silently in the JSVM.

### 4. Countdown tolerance: ±1000 ms

`start` sets `starts_at` to server-now + 5 s. Clients render the countdown from that
value corrected by `@calistenia/core/lib/serverClock`, which measures the offset from the
`Date` header of a health check using the RTT midpoint — so the realistic error is RTT/2
per device. **The device clock is never read directly.** QA asserts the tolerance by
starting a battle on two phones side by side and comparing when each hits `00:00`.

## Bug found and fixed in the #355 contract

`battles.revision` was created `required: true`. A PocketBase number field treats `0` as
blank, so the createRule's own `@request.body.revision = 0` condition could never be
satisfied: **every battle creation failed** with `revision: Cannot be blank`. Nothing had
been built on top yet, so it never reached production. The migration flips it to
`required: false`, mutating the field in place so it keeps its id.

## The API

All routes require authentication except the invite landing. Every mutation runs in a
transaction that re-reads the record, re-checks the transition table, writes only
server-owned fields, and increments `revision`. All of them return a full snapshot.

| Route | Caller | Effect |
|---|---|---|
| `GET /api/battles/{id}/snapshot` | creator or participant | battle + participants + standings, with lazy expiry |
| `POST /api/battles/{id}/publish` | creator | `draft → lobby`, seats the creator |
| `POST /api/battles/{id}/invites` | creator | issues a token, returns the raw value **once** |
| `POST /api/battles/{id}/invites/revoke` | creator | revokes outstanding invites |
| `POST /api/public/battle-invite` | anyone | landing metadata; counts only |
| `POST /api/battles/join` | authenticated | consumes the token atomically |
| `POST /api/battles/{id}/ready` | participant | `joined ⇄ ready`, drives `lobby ⇄ ready` |
| `POST /api/battles/{id}/start` | creator | `ready → live`, sets `starts_at` |
| `POST /api/battles/{id}/progress` | participant | validated, clamped, monotonic |
| `POST /api/battles/{id}/finish` | participant | `active → finished` |
| `POST /api/battles/{id}/leave` | participant | `→ left` |
| `POST /api/battles/{id}/cancel` | creator | `→ cancelled` |

### Token hygiene

The raw token is returned once and never stored — only `sha256(token)` in
`battle_invites.token_hash`. Both token-carrying endpoints are **POSTs** so the value
travels in a request body rather than a URL path, which PocketBase writes to its request
log. It is never sent as an analytics property, and the pending-invite handoff
(`battleInviteHandoff`) clears it on read and on sign-out.

### Failure responses do not leak

`invalid` (never existed, revoked, or consumed), `expired`, and `closed` are returned
with the same shape, and never mention a participant. A non-creator hitting a
creator-only route gets the same 403 regardless of whether the battle exists, so route
responses cannot be used to enumerate ids.

## Edge-case policies

- **Creator leaves the lobby → the battle is cancelled.** Nobody else can start it, so
  the alternative is a zombie for the expiry sweep to collect.
- **Creator leaves mid-`live` → the battle continues** and their participant goes
  `left`. The others' work is not discarded.
- **Last active participant leaves or finishes → the battle closes.** A single
  participant finishing alone still produces a valid `finished` battle.
- **`left` participants keep a score and a rank.** A battle result is stable for
  everyone who took part.
- **Minimum to start: two `ready` participants.** A battle of one is a circuit session,
  which the app already has. Device QA therefore genuinely needs two accounts.
- **Lobby expiry: cron *and* lazy check.** `battles_expiry` sweeps every 5 minutes;
  every snapshot read performs the same check inline. Belt and braces on purpose — a
  `cronAdd` callback that throws dies silently in the JSVM, and that is exactly how the
  reminder crons stayed broken for months. Staleness is measured against
  `last_activity_at`, added by this migration, because `updated` moves on unrelated
  writes.
- **Offline during `live`: input is blocked, nothing is buffered.** Progress is
  client-asserted, so a local buffer replayed after a disconnect is precisely what the
  server cannot validate. The UI disables input and shows a reconnecting state; on
  reconnect the client fetches a snapshot and replaces local state. The general offline
  queue (#301) deliberately does not cover this.
- **App killed mid-battle.** The circuit position is not stored locally — it comes from
  `me.progress` on the server, so a relaunch resumes exactly where the server says.
- **Two devices, same account.** The unique `(battle, user)` index makes them one
  participant; both render the same snapshot and the second is not special-cased.
- **Re-opening your own invite link while already in.** Returns the existing seat with
  `already_joined: true` and does **not** consume the token.

## Realtime

`packages/core/lib/battleRealtime.ts` treats realtime as a *signal*, not as data. Any
event on the battle or its participants schedules a coalesced (350 ms) snapshot fetch,
and the snapshot replaces local state wholesale. Snapshots older than the last applied
`revision` are dropped, so reconnects, missed events, out-of-order deliveries and
revision gaps are all one code path. Nothing is ever merged.

This is deliberately different from `raceRealtime`, which merges individual record events
into a local array. Races can afford that; battles cannot, because progress is
server-clamped and `revision` is the gap detector.

## Analytics: the `battle_*` collision, resolved

The race feature emitted `battle_created` / `battle_joined` / `battle_started` /
`battle_completed` / `battle_shared` with `battle_id` set to a `races` id, from 17 call
sites. Adding a discriminator would have left every existing dashboard silently
ambiguous, so **races moved to `race_*` with a `race_id` property** and `battle_*` now
means circuit battles only. `docs/business/08-analytics-events.md` is at version 2 and
records the break, with the warning that any report built on `battle_*` before
2026-08-11 was measuring races.

## Client surface

- `packages/core/lib/battleApi.ts` — typed wrappers; the only non-API write is creating
  the draft, which goes through the collection API by design.
- `packages/core/hooks/useBattle.ts` — snapshot + realtime + actions + derived phase.
  Deliberately not TanStack Query: a battle is a live session whose only valid
  representation is the newest snapshot, and caching it would invite the stale merge the
  contract forbids.
- `packages/core/data/battle-presets.ts` — three fixed formats. "Any circuit in the app"
  cannot promise comparable reps across participants, so the MVP stays small and explicit.
- `apps/mobile/src/app/battle/[id].tsx`, `battle-create.tsx`, `battle-invite/[token].tsx`
  and `src/components/battle/` — create, lobby, countdown, live and results.
- `apps/web/src/pages/BattleInviteLandingPage.tsx` — the shared link is a web URL, so it
  has to resolve on desktop and on phones without the app. Where the app is installed,
  the Android app link (`/battle-invite` prefix, added to `app.json`) intercepts it first.

## Deploy checklist

1. Merge → migrations apply automatically.
2. **Restart PocketBase in production** so `battle_api.pb.js` and `utils/battles.js`
   load. Until then every battle route 404s and the mobile UI is dead.
3. Confirm `[battle_api] hook file loaded` appears in the PocketBase log.
4. Re-point any OpenPanel report built on `battle_*` to `race_*`.
