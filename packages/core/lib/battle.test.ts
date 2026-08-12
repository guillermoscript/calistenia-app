import { describe, expect, it } from 'vitest'
import {
  assertBattleParticipantTransition,
  assertBattleTransition,
  canAcceptBattleJoin,
  canMutateBattle,
  canViewBattle,
  compareBattleScores,
  createBattleScore,
  validateBattleConfiguration,
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
