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
    expect(() => assertBattleParticipantTransition('invited', 'active')).toThrow()
  })
})

describe('battle configuration and scoring', () => {
  it('accepts mixed rep/time targets and rejects duplicate positions', () => {
    expect(validateBattleConfiguration(config)).toEqual([])
    expect(validateBattleConfiguration({
      ...config,
      exercises: [config.exercises[0], { ...config.exercises[1], position: 0 }],
    })).toContain('duplicate exercise position: 0')
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
    expect(canMutateBattle('creator-1', battle, null, 'edit_config')).toBe(false)
    expect(canMutateBattle('creator-1', { ...battle, status: 'draft' }, null, 'edit_config')).toBe(true)
    expect(canMutateBattle('member-1', battle, participant, 'mark_ready')).toBe(true)
    expect(canMutateBattle('stranger', battle, participant, 'mark_ready')).toBe(false)
    expect(canMutateBattle('member-1', battle, participant, 'update_progress')).toBe(false)
  })
})
