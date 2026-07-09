# Countdown Race Feature ("most distance in X minutes")

Status: **shipped**
Created: 2026-04-12 · Rewritten: 2026-07-08 (issue #149)
Context: Extension to the Race Competition feature built for La Perla Run

## What it is

A race mode where the goal is **"most distance in X minutes"** instead of
"first to X km". Winner is whoever covers the most ground before the clock
hits zero.

## Where it lives (actual monorepo layout)

The original April version of this doc predated the monorepo split and listed
single `src/` paths. The feature exists in parallel on both platforms:

| Piece | Web | Mobile |
|---|---|---|
| Create race (mode toggle Distancia/Tiempo) | `apps/web/src/components/race/CreateRaceDialog.tsx` | `apps/mobile/src/app/race-create.tsx` |
| Race state machine + auto-finish | `apps/web/src/contexts/RaceContext.tsx` | `apps/mobile/src/contexts/RaceContext.tsx` |
| Live leaderboard + countdown | `apps/web/src/components/race/RaceLive.tsx` | `apps/mobile/src/components/race/RaceLive.tsx` |
| Results + winner | `apps/web/src/components/race/RaceResults.tsx` | `apps/mobile/src/components/race/RaceResults.tsx` |
| Share card | `apps/web/src/components/race/RaceShareCard.tsx` | (folded into cardio share) |
| Shared types | `packages/core/types/race.ts` (`RaceMode = 'distance' \| 'time'`) | idem |
| Shared ranking | `packages/core/lib/race-sort.ts` (`sortRaceParticipants`) | idem |
| Server clock (timer drift) | `apps/web/src/lib/race/raceClock.ts` | `apps/mobile/src/lib/race/raceClock.ts` |

## Data model (PocketBase)

- `races` collection: `mode` (`'distance' | 'time'`), `target_distance_km`,
  `target_duration_seconds`, `starts_at`, `ends_at`, `finished_at` — added by
  migration `pb_migrations/1776000001_upgrade_races_schema.js` (backfilled
  existing rows with `mode: 'distance'`).
- Results live as rows in **`race_participants`** (`distance_km`,
  `duration_seconds`, `avg_pace`, `status`, `finished_at`) — there is no
  `race_results` collection.

## How it works

- Creator picks EITHER a distance target OR a duration (minutes) — no hybrid
  mode (decided 2026-07-08).
- Race starts with the same 5-4-3-2-1-GO countdown as distance races.
- During a time race the middle stat tile shows **RESTA** (remaining time)
  instead of elapsed, counting down from `target_duration_seconds`.
- **Last 10 seconds**: tile turns red + countdown tick sound + haptic per
  second (skipped for races shorter than 30s). At zero the existing
  finish sound/haptic fires via the participant's `finished` transition.
- Auto-finish is client-side per participant in `RaceContext`: when the
  server-anchored clock (`raceClock.serverNow()`, using `starts_at` as the
  authoritative origin — this is the timer-drift mitigation) reaches
  `target_duration_seconds`, the client calls `finishParticipant` with the
  final distance. The creator can still force-finish early.

## Winner determination

`sortRaceParticipants(participants, race)` in `packages/core/lib/race-sort.ts`
(tested in `race-sort.test.ts`) is the single ranking used by live
leaderboards, results and the share card:

- Groups: finished → racing → DNF.
- Finished, `mode: 'distance'` with a target: by `finished_at` ascending
  (first to arrive wins).
- Finished, `mode: 'time'` **or no distance target**: by `distance_km`
  descending, ties by better pace then name. Rationale: everyone
  auto-finishes (or is force-finished) almost simultaneously, so
  `finished_at` only reflects network latency.
- Winner label swaps to "Recorrió más" (`race.winnerTime`) for time races.

## Edge cases (as implemented)

1. **Pause during a time race** — the race clock keeps counting (pause is a
   strategic cost, like real races).
2. **Phone dies** — last synced distance is the final score (same as
   distance races).
3. **Creator finishes early** — freezes each participant's latest data.
4. **Timer drift** — `starts_at` + server clock offset is authoritative, not
   a client counter.
5. **Very short races (< 30s)** — final-10s ticks are disabled.

## Not in scope

- Hybrid "first to X km OR most distance in Y min" (explicitly rejected)
- Elimination races, handicap starts, relay teams, power-ups
