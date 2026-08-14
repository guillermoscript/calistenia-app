import { describe, expect, it } from 'vitest'
import type { BattleStanding } from '../types/battle'
import {
  assertBattleParticipantTransition,
  assertBattleTransition,
  canAcceptBattleJoin,
  canMutateBattle,
  canViewBattle,
  compareBattleScores,
  battleOutcomeFor,
  battleParticipantActivity,
  battleRecordFrom,
  battleRestSecondsLeft,
  battleSpanMs,
  battleWorkColumns,
  createBattleScore,
  formatBattleElapsed,
  isBattleActiveForMe,
  validateBattleConfiguration,
  BATTLE_IDLE_AFTER_MS,
} from './battle'

const config = {
  workout_template_id: 'park-circuit-v1',
  rounds: 3,
  scoring_mode: 'rounds_then_reps_then_time' as const,
  exercises: [
    { exercise_id: 'push-ups', position: 0, target: { kind: 'reps' as const, value: 12 }, rest_seconds: 30 },
    { exercise_id: 'plank', position: 1, target: { kind: 'seconds' as const, value: 45 }, rest_seconds: 20 },
  ],
}

describe('battle lifecycle contract', () => {
  it('allows only the documented battle transitions', () => {
    expect(() => assertBattleTransition('draft', 'lobby')).not.toThrow()
    expect(() => assertBattleTransition('lobby', 'ready')).not.toThrow()
    expect(() => assertBattleTransition('ready', 'live')).not.toThrow()
    expect(() => assertBattleTransition('live', 'finished')).not.toThrow()
    expect(() => assertBattleTransition('finished', 'live')).toThrow('Invalid battle transition')
    expect(() => assertBattleTransition('draft', 'live')).toThrow('Invalid battle transition')
  })

  it('prevents a late join after the lobby closes', () => {
    expect(canAcceptBattleJoin('lobby')).toBe(true)
    expect(canAcceptBattleJoin('ready')).toBe(false)
    expect(canAcceptBattleJoin('live')).toBe(false)
    expect(() => assertBattleParticipantTransition('joined', 'ready')).not.toThrow()
    expect(() => assertBattleParticipantTransition('ready', 'joined')).not.toThrow()
    expect(() => assertBattleParticipantTransition('invited', 'active')).toThrow()
  })
})

describe('battle configuration and scoring', () => {
  it('accepts mixed rep/time targets and rejects duplicate positions', () => {
    expect(validateBattleConfiguration(null as never)).toContain('configuration is required')
    expect(validateBattleConfiguration(config)).toEqual([])
    expect(validateBattleConfiguration({
      ...config,
      exercises: [config.exercises[0], { ...config.exercises[1], position: 0 }],
    })).toContain('duplicate exercise position: 0')
    expect(validateBattleConfiguration({
      ...config,
      scoring_mode: 'unknown' as never,
    })).toContain('unsupported scoring_mode')
    expect(validateBattleConfiguration({
      ...config,
      exercises: [config.exercises[0], { ...config.exercises[1], position: 2 }],
    })).toContain('exercise positions must be contiguous from 0')
    expect(validateBattleConfiguration({
      ...config,
      exercises: [{ ...config.exercises[0], target: { kind: 'distance', value: 12 } as never }],
    })).toContain('invalid target kind for push-ups')
  })

  it('settles an identical score by who finished first', () => {
    // El caso normal en los circuitos que son solo repeticiones: los dos completan todo,
    // así que rondas, reps y tiempo empatan y solo queda el reloj (#387).
    const early = createBattleScore({
      completed_rounds: 3, completed_reps: 105, completed_time_seconds: 0,
      finished_at: '2026-08-11 20:38:14.658Z', tie_break_key: 'zzz',
    })
    const late = createBattleScore({
      completed_rounds: 3, completed_reps: 105, completed_time_seconds: 0,
      finished_at: '2026-08-11 21:03:53.818Z', tie_break_key: 'aaa',
    })
    // Gana el que acabó antes aunque su id ordene después.
    expect(compareBattleScores(early, late)).toBeLessThan(0)
    expect(compareBattleScores(late, early)).toBeGreaterThan(0)
  })

  it('ranks a finisher ahead of someone still going with the same work', () => {
    const finished = createBattleScore({
      completed_rounds: 3, completed_reps: 105, completed_time_seconds: 0,
      finished_at: '2026-08-11 20:38:14.658Z', tie_break_key: 'zzz',
    })
    const stillActive = createBattleScore({
      completed_rounds: 3, completed_reps: 105, completed_time_seconds: 0,
      finished_at: null, tie_break_key: 'aaa',
    })
    expect(compareBattleScores(finished, stillActive)).toBeLessThan(0)
    expect(compareBattleScores(stillActive, finished)).toBeGreaterThan(0)
  })

  it('stays deterministic when nobody has finished', () => {
    const a = createBattleScore({ completed_rounds: 1, completed_reps: 5, completed_time_seconds: 0, tie_break_key: 'p1' })
    const b = createBattleScore({ completed_rounds: 1, completed_reps: 5, completed_time_seconds: 0, tie_break_key: 'p2' })
    expect(compareBattleScores(a, b)).toBeLessThan(0)
    expect(compareBattleScores(b, a)).toBeGreaterThan(0)
    expect(compareBattleScores(a, a)).toBe(0)
  })

  it('ranks rounds, then reps, then time, then a stable id', () => {
    const winner = createBattleScore({ completed_rounds: 2, completed_reps: 4, completed_time_seconds: 10, tie_break_key: 'p2' })
    const fewerRounds = createBattleScore({ completed_rounds: 1, completed_reps: 99, completed_time_seconds: 99, tie_break_key: 'p1' })
    const sameScoreEarlierId = createBattleScore({ completed_rounds: 2, completed_reps: 4, completed_time_seconds: 10, tie_break_key: 'p1' })
    expect(compareBattleScores(winner, fewerRounds)).toBeLessThan(0)
    expect(compareBattleScores(sameScoreEarlierId, winner)).toBeLessThan(0)
    expect(() => createBattleScore({ completed_rounds: -1, completed_reps: 0, completed_time_seconds: 0, tie_break_key: 'p1' })).toThrow()
  })

  // Hasta #426 ningún caso dejaba que el tiempo fuera lo que decide: o cambiaban las
  // rondas, o ambos lados llevaban 0 segundos. La dirección de esa comparación —aguantar
  // más va por delante— estaba sin cubrir, justo la duda que abrió el issue.
  it('ranks holding longer ahead when rounds and reps tie', () => {
    const heldLonger = createBattleScore({ completed_rounds: 2, completed_reps: 40, completed_time_seconds: 90, tie_break_key: 'zzz' })
    const heldLess = createBattleScore({ completed_rounds: 2, completed_reps: 40, completed_time_seconds: 30, tie_break_key: 'aaa' })
    expect(compareBattleScores(heldLonger, heldLess)).toBeLessThan(0)
    expect(compareBattleScores(heldLess, heldLonger)).toBeGreaterThan(0)
  })
})

describe('battle work columns', () => {
  const exercise = (kind: 'reps' | 'seconds', position: number) => ({
    exercise_id: `ex-${position}`,
    position,
    target: { kind, value: 30 } as const,
    rest_seconds: 20,
  })

  it('shows only reps for an all-reps circuit', () => {
    expect(battleWorkColumns({ exercises: [exercise('reps', 0), exercise('reps', 1)] }))
      .toEqual({ reps: true, seconds: false })
  })

  it('shows both units for a mixed circuit like CORE', () => {
    expect(battleWorkColumns({ exercises: [exercise('seconds', 0), exercise('reps', 1)] }))
      .toEqual({ reps: true, seconds: true })
  })

  it('drops the reps column when nothing in the circuit counts reps', () => {
    expect(battleWorkColumns({ exercises: [exercise('seconds', 0)] }))
      .toEqual({ reps: false, seconds: true })
  })

  it('falls back to the familiar reps column when there is nothing to read', () => {
    expect(battleWorkColumns({ exercises: [] })).toEqual({ reps: true, seconds: false })
    expect(battleWorkColumns(null)).toEqual({ reps: true, seconds: false })
  })
})

describe('battle access contract', () => {
  const battle = { creator: 'creator-1', status: 'lobby' as const }
  const participant = { user: 'member-1', status: 'joined' as const }

  it('lets only creator/member read battle data', () => {
    expect(canViewBattle('creator-1', battle, null)).toBe(true)
    expect(canViewBattle('member-1', battle, participant)).toBe(true)
    expect(canViewBattle('stranger', battle, participant)).toBe(false)
  })

  it('limits participant writes to their own lifecycle', () => {
    expect(canMutateBattle('creator-1', battle, null, { kind: 'edit_config' })).toBe(false)
    expect(canMutateBattle('creator-1', { ...battle, status: 'draft' }, null, { kind: 'edit_config' })).toBe(true)
    expect(canMutateBattle('creator-1', battle, null, { kind: 'transition', to: 'ready' })).toBe(true)
    expect(canMutateBattle('creator-1', battle, null, { kind: 'transition', to: 'live' })).toBe(false)
    expect(canMutateBattle('creator-1', { ...battle, status: 'finished' }, null, { kind: 'transition', to: 'live' })).toBe(false)
    expect(canMutateBattle('member-1', battle, participant, { kind: 'mark_ready' })).toBe(true)
    expect(canMutateBattle('stranger', battle, participant, { kind: 'mark_ready' })).toBe(false)
    expect(canMutateBattle('member-1', battle, participant, { kind: 'update_progress' })).toBe(false)
  })
})

describe('is a battle still mine to go back to', () => {
  it('drops a battle I already finished, even while it is still live', () => {
    // The bug this exists for: the floating bar read the battle status alone, so
    // finishing a run left it advertising a battle the user had already closed —
    // a battle stays `live` until the last opponent is done.
    expect(isBattleActiveForMe('live', 'active', false)).toBe(true)
    expect(isBattleActiveForMe('live', 'finished', false)).toBe(false)
    expect(isBattleActiveForMe('live', 'left', false)).toBe(false)
    // Being the creator changes nothing: creators train too, and a creator who has
    // finished has as little left to do there as anyone else.
    expect(isBattleActiveForMe('live', 'finished', true)).toBe(false)
  })

  it('drops every closed battle status', () => {
    for (const status of ['finished', 'expired', 'cancelled'] as const) {
      expect(isBattleActiveForMe(status, 'active', true)).toBe(false)
    }
  })

  it('keeps the lobby phases while my seat is open', () => {
    expect(isBattleActiveForMe('lobby', 'joined', false)).toBe(true)
    expect(isBattleActiveForMe('ready', 'ready', false)).toBe(true)
    expect(isBattleActiveForMe('lobby', 'invited', false)).toBe(true)
    expect(isBattleActiveForMe('lobby', 'left', false)).toBe(false)
  })

  it('keeps an unpublished draft for its creator, who has no seat yet', () => {
    // Publishing is what seats the creator, so a null seat on a draft is normal.
    expect(isBattleActiveForMe('draft', null, true)).toBe(true)
    expect(isBattleActiveForMe('draft', null, false)).toBe(false)
    // A seatless creator is never a reason to advertise a battle already under way.
    expect(isBattleActiveForMe('live', null, true)).toBe(false)
  })
})

describe('what a participant is doing right now', () => {
  const NOW = Date.parse('2026-08-12T10:00:00.000Z')
  const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

  const standing = (over: Partial<Parameters<typeof battleParticipantActivity>[0]> = {}) => ({
    status: 'active' as const,
    resting_until: null,
    last_activity_at: at(-5_000),
    ...over,
  })

  it('reads rest as resting only while the deadline is ahead', () => {
    expect(battleParticipantActivity(standing({ resting_until: at(12_000) }), NOW)).toBe('resting')
    // The instant it lapses they are working again, not idle: they just confirmed.
    expect(battleParticipantActivity(standing({ resting_until: at(-1) }), NOW)).toBe('working')
  })

  it('separates a long silence from a rest', () => {
    // The distinction the live board exists for: a stalled counter reads the same
    // whether someone is resting or has quietly stopped.
    const quiet = standing({ last_activity_at: at(-(BATTLE_IDLE_AFTER_MS + 1_000)) })
    expect(battleParticipantActivity(quiet, NOW)).toBe('idle')
    const justInside = standing({ last_activity_at: at(-(BATTLE_IDLE_AFTER_MS - 1_000)) })
    expect(battleParticipantActivity(justInside, NOW)).toBe('working')
  })

  it('lets a terminal seat win over any timestamp', () => {
    // Someone who finished mid-rest is finished, not resting.
    const done = standing({ status: 'finished', resting_until: at(30_000) })
    expect(battleParticipantActivity(done, NOW)).toBe('finished')
    expect(battleParticipantActivity(standing({ status: 'left' }), NOW)).toBe('left')
  })

  it('treats an unparseable or missing timestamp as working, never as 1970', () => {
    expect(battleParticipantActivity(standing({ last_activity_at: null }), NOW)).toBe('working')
    expect(battleParticipantActivity(standing({ last_activity_at: 'nonsense' }), NOW)).toBe('working')
    expect(battleParticipantActivity(standing({ resting_until: 'nonsense' }), NOW)).toBe('working')
  })

  it('accepts the space-separated form PocketBase actually stores', () => {
    // `2026-08-12 10:00:12.000Z`, not the ISO `T` — parsing this wrong is what made the
    // expiry sweep kill every lobby (#356).
    const stored = at(12_000).replace('T', ' ')
    expect(battleParticipantActivity(standing({ resting_until: stored }), NOW)).toBe('resting')
    expect(battleRestSecondsLeft(stored, NOW)).toBe(12)
  })

  it('counts rest down to zero and never past it', () => {
    expect(battleRestSecondsLeft(at(11_400), NOW)).toBe(12)
    expect(battleRestSecondsLeft(at(-9_000), NOW)).toBe(0)
    expect(battleRestSecondsLeft(null, NOW)).toBe(0)
  })
})

describe('battle record', () => {
  const entry = (over: Partial<BattleStanding>): BattleStanding => ({
    participant_id: 'p1',
    user: 'u1',
    display_name: 'Someone',
    status: 'finished',
    score: createBattleScore({
      completed_rounds: 3, completed_reps: 30, completed_time_seconds: 0, tie_break_key: 'p1',
    }),
    rank: 1,
    current_exercise_position: null,
    last_activity_at: null,
    resting_until: null,
    ...over,
  })

  const closed = (standings: BattleStanding[] | null) => ({ final_standings: standings })

  it('reads a win off the ranking of whoever saw it through', () => {
    const standings = [entry({}), entry({ participant_id: 'p2', user: 'u2', rank: 2 })]
    expect(battleOutcomeFor(standings, 'u1')).toBe('won')
    expect(battleOutcomeFor(standings, 'u2')).toBe('lost')
  })

  it('does not hand a win to someone who was only ranked above a walk-out', () => {
    // Ranks span everyone including those who left, so "rank 1" alone is not the
    // question — the winner is the best of the people still in it at the end.
    const standings = [
      entry({ participant_id: 'p1', user: 'u1', rank: 1, status: 'left' }),
      entry({ participant_id: 'p2', user: 'u2', rank: 2 }),
    ]
    expect(battleOutcomeFor(standings, 'u1')).toBe('left')
    expect(battleOutcomeFor(standings, 'u2')).toBe('won')
  })

  it('reports no result rather than a loss when nothing was stored', () => {
    // Every battle that closed before the ranking was sealed. Counting these as losses
    // would invent defeats the user never had.
    expect(battleOutcomeFor(null, 'u1')).toBe('unknown')
    expect(battleOutcomeFor([], 'u1')).toBe('unknown')
    expect(battleOutcomeFor([entry({ user: 'u2' })], 'u1')).toBe('unknown')
  })

  it('tallies a record and leaves unknown battles out of it entirely', () => {
    const won = closed([entry({}), entry({ participant_id: 'p2', user: 'u2', rank: 2 })])
    const lost = closed([entry({ participant_id: 'p2', user: 'u2', rank: 1 }), entry({ rank: 2 })])
    const record = battleRecordFrom([won, lost, closed(null)], 'u1')

    expect(record).toMatchObject({ fought: 2, won: 1, lost: 1, left: 0 })
  })

  it('walks the streak back from the newest battle and stops at the first loss', () => {
    const won = closed([entry({}), entry({ participant_id: 'p2', user: 'u2', rank: 2 })])
    const lost = closed([entry({ participant_id: 'p2', user: 'u2', rank: 1 }), entry({ rank: 2 })])
    // Newest first: two wins, then a loss, then a win that no longer counts.
    expect(battleRecordFrom([won, won, lost, won], 'u1').streak).toBe(2)
    expect(battleRecordFrom([lost, won, won], 'u1').streak).toBe(0)
  })

  it('steps over a battle you left instead of ending the streak on it', () => {
    // A walk-out is not a defeat, so it must not silently end a run of wins.
    const won = closed([entry({}), entry({ participant_id: 'p2', user: 'u2', rank: 2 })])
    const walked = closed([
      entry({ status: 'left', rank: 2 }),
      entry({ participant_id: 'p2', user: 'u2', rank: 1 }),
    ])
    const record = battleRecordFrom([won, walked, won], 'u1')

    expect(record.streak).toBe(2)
    expect(record).toMatchObject({ fought: 3, won: 2, lost: 0, left: 1 })
  })
})

describe('battleSpanMs', () => {
  it('measures the span between two battle timestamps', () => {
    expect(battleSpanMs('2026-08-12T10:00:00.000Z', '2026-08-12T10:07:30.000Z')).toBe(450_000)
  })

  it('accepts the space-separated form PocketBase stores', () => {
    expect(battleSpanMs('2026-08-12 10:00:00.000Z', '2026-08-12 10:00:05.000Z')).toBe(5_000)
  })

  it('returns 0 when either end is missing', () => {
    // A participant who never finished has no end; the caller shows 0, not NaN.
    expect(battleSpanMs('2026-08-12T10:00:00.000Z', null)).toBe(0)
    expect(battleSpanMs(null, '2026-08-12T10:00:00.000Z')).toBe(0)
  })

  it('never returns a negative span', () => {
    // Clock skew between the two writes must not render as a run that went backwards.
    expect(battleSpanMs('2026-08-12T10:00:05.000Z', '2026-08-12T10:00:00.000Z')).toBe(0)
  })
})

describe('formatBattleElapsed', () => {
  it('formats as m:ss with a padded seconds field', () => {
    expect(formatBattleElapsed(0)).toBe('0:00')
    expect(formatBattleElapsed(9_000)).toBe('0:09')
    expect(formatBattleElapsed(450_000)).toBe('7:30')
  })

  it('keeps counting minutes past the hour instead of wrapping', () => {
    // A long battle should read 63:20, not 3:20 — wrapping would understate the run.
    expect(formatBattleElapsed(3_800_000)).toBe('63:20')
  })
})
