# Collaborative Circuit Battle Data Contract

Version: 1 · Issue #355 · Data/UI boundary for the MVP

## Decision

Use new `battles`, `battle_participants`, and `battle_invites` collections.
Do not reuse `races` or `race_participants`: those records model GPS/cardio
competition, expose cardio-specific fields, and currently allow client-side
progress updates. A battle needs workout targets, server-owned state, a
deterministic score, and participant-scoped access.

The MVP does not require rep-detection AI. A trusted battle API receives
progress assertions from the workout client, validates them against the battle
configuration, and remains authoritative for timestamps, lifecycle, score and
revision. The API is the only writer for battle and participant records.

## Contract types

`packages/core/types/battle.ts` is the shared shape used by future web/mobile
clients and the server boundary.

- `BattleConfiguration` contains `workout_template_id`, positive `rounds`, an
  ordered `exercises` array, and `rounds_then_reps_then_time` scoring.
- Each exercise has a stable `exercise_id`, zero-based `position`, one target
  (`reps` or `seconds`), and `rest_seconds`.
- `BattleProgress` stores completed rounds, completed reps, completed time,
  current exercise position, and the last activity time.
- `revision` is a monotonic server version. Every accepted write increments it.

## Battle state machine

```text
draft ──publish──> lobby ──all participants ready──> ready ──start──> live ──finish──> finished
  │                  │                                  │              │
  └─cancel───────────┴─expire/cancel────────────────────┴─expire/cancel──> expired/cancelled
```

Allowed transitions are enforced by `packages/core/lib/battle.ts` and must be
rechecked by the server in the same transaction as the write:

| From | Allowed next states |
|---|---|
| `draft` | `lobby`, `cancelled` |
| `lobby` | `ready`, `expired`, `cancelled` |
| `ready` | `lobby`, `live`, `expired`, `cancelled` |
| `live` | `finished`, `expired`, `cancelled` |
| `finished`, `expired`, `cancelled` | none |

`ready → lobby` supports a participant becoming unready before the countdown.
New invite acceptances are allowed only in `lobby`; opening a deep link after
the lobby closes returns a non-mutating expired/closed result.

## Participant state machine

```text
invited ──accept──> joined ──ready──> ready ──battle live──> active ──finish──> finished
    └────────────────────────────── leave ───────────────────────────────────────> left
```

Allowed participant transitions are `invited → joined|left`,
`joined → ready|left`, `ready → active|left`, and `active → finished|left`.
Finished and left are terminal. The server records the transition timestamp;
the client never supplies authoritative dates.

## PocketBase schema and access rules

The additive migration `1782800000_created_battles.js` creates:

| Collection | Purpose | Important fields |
|---|---|---|
| `battles` | One collaborative circuit session | creator, status, config JSON, revision, server timestamps, invite expiry/revocation |
| `battle_participants` | One row per user/battle | battle, user, status, progress JSON, lifecycle timestamps, last seen |
| `battle_invites` | Hashed one-time deep-link tokens | battle, token hash, status, expiry, consumed-by/time |

Read rules expose `battles` to its creator or users represented in
`battle_participants`, and expose participant rows to the participant or the
battle creator. Invite rows are never readable through the public API, so a
token hash cannot be harvested.

The creator may create only a `draft` with revision `0`. Battle and
participant create/update/delete rules are server-only. The future battle API
is responsible for authenticating the caller, checking creator/participant
role, checking the transition table, validating the request body, and writing
only the fields allowed for that role. This prevents clients from setting
`finished`, score, timestamps, revision, or another user's `user` relation.

## Realtime and reconnect behavior

Subscribe to the battle record and the participant records filtered by battle
id. A client keeps the last `{ battle_id, revision }` locally only as a cache
hint. On connection, app resume, subscription error, or a revision gap it must
fetch a fresh battle plus participant snapshot and replace local state; it
must not merge stale progress into the server snapshot.

The server accepts an update only when the caller's participant is active and
the battle is live. It clamps progress to non-negative values, rejects a
decrease in completed work, validates the exercise position, computes the
score from the accepted progress, sets server timestamps, increments revision,
and publishes the new records through PocketBase realtime. Repeated requests
with the same idempotency key are no-ops that return the accepted revision.

If a reconnect sees a finished, expired, or cancelled battle, the client stops
writing and renders the latest results. If it sees a live battle with no local
participant snapshot, it loads the participant row before allowing progress.

## Invite and deep-link behavior

Deep links carry an opaque random token, never a PocketBase id or raw user
identity. Only `sha256(token)` is stored in `battle_invites.token_hash`.

1. Creator asks the server for an invite; the server creates an active token
   with a short expiry and returns the raw token once.
2. The link landing endpoint hashes the token, checks active status, expiry,
   revocation and battle status, then returns minimal lobby metadata.
3. After authentication, the server consumes the token atomically and creates
   or returns the caller's unique participant row. Replays, expired tokens,
   revoked tokens and joins after `lobby` are rejected without revealing
   participant identity.
4. The creator can revoke outstanding invites. Consumed tokens cannot be
   reused for another participant.

## Score contract

The MVP score is a descending lexicographic tuple:

```text
(completed_rounds, completed_reps, completed_time_seconds, -stable_tie_break_order)
```

Rounds always win first. If rounds tie, reps win. If both tie, completed time
seconds win. If all measurable values tie, the stable participant record id
(`tie_break_key`) wins in ascending codepoint order. The tie-break key is not a
display name and is assigned by the server, so it is deterministic across
clients and reconnects.

Examples:

| Participant | Rounds | Reps | Time (s) | Result |
|---|---:|---:|---:|---|
| A | 3 | 10 | 0 | 1st |
| B | 2 | 40 | 90 | 2nd; rounds beat extra reps/time |
| C | 2 | 40 | 90 | 3rd if C's stable id sorts after B |

Mixed rep/time exercises contribute to their corresponding aggregate. The
contract deliberately reports both values rather than converting seconds into
reps, avoiding a hidden exchange rate between unlike exercises.

## Analytics before UI

The existing versioned analytics contract in `packages/core/lib/analytics.ts`
already reserves the MVP names:

| Event | Trigger | Required battle properties |
|---|---|---|
| `battle_created` | Draft is created | `surface=battle`, `battle_id`, `participant_count`, `result=created` |
| `battle_joined` | Participant row is accepted | `surface=battle`, `battle_id`, `participant_count`, `result=joined` |
| `battle_started` | Battle enters `live` | `surface=battle`, `battle_id`, `participant_count`, `result=started` |
| `battle_completed` | Results become available | `surface=battle`, `battle_id`, `participant_count`, `result=completed` |
| `battle_shared` | Invite or result share succeeds | `surface=battle`, `battle_id`, `share_type`, `participant_count`, `result`, `share_confirmed` |

These names are emitted once at the authoritative domain event, not once per
realtime subscriber. Deep-link landing can use the existing
`invite_landing_viewed` event with `source=battle_invite`; no new event name is
needed for the MVP.
