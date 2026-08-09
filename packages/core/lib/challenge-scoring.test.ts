import { describe, expect, it } from 'vitest'
import {
  isChallengeLiveOn,
  legacyPrKey,
  pickAffectedChallenges,
  workoutAffectsChallenge,
  type ScorableChallenge,
} from './challenge-scoring'

const challenge = (over: Partial<ScorableChallenge>): ScorableChallenge => ({
  id: 'c1',
  metric: 'most_sessions',
  status: 'active',
  starts_at: '2026-08-01',
  ends_at: '2026-08-31',
  ...over,
})

describe('workoutAffectsChallenge', () => {
  it('counts any completion for session- and streak-scored challenges', () => {
    const none = new Set<string>()
    expect(workoutAffectsChallenge(challenge({ metric: 'most_sessions' }), none)).toBe(true)
    expect(workoutAffectsChallenge(challenge({ metric: 'longest_streak' }), none)).toBe(true)
  })

  it('requires the challenge exercise to have been logged for metric "exercise"', () => {
    const ch = challenge({ metric: 'exercise', exercise_slug: 'muscle_up' })
    expect(workoutAffectsChallenge(ch, new Set(['muscle_up', 'dips']))).toBe(true)
    expect(workoutAffectsChallenge(ch, new Set(['dips']))).toBe(false)
  })

  it('does not score an "exercise" challenge with no slug configured', () => {
    const ch = challenge({ metric: 'exercise', exercise_slug: '' })
    expect(workoutAffectsChallenge(ch, new Set(['muscle_up']))).toBe(false)
  })

  it('requires the matching pr_* family for legacy PR metrics', () => {
    expect(workoutAffectsChallenge(challenge({ metric: 'most_pullups' }), new Set(['wide_pullup']))).toBe(true)
    expect(workoutAffectsChallenge(challenge({ metric: 'most_pullups' }), new Set(['diamond_pushup']))).toBe(false)
    expect(workoutAffectsChallenge(challenge({ metric: 'most_pushups' }), new Set(['diamond_pushup']))).toBe(true)
    expect(workoutAffectsChallenge(challenge({ metric: 'most_lsit' }), new Set(['lsit_tuck']))).toBe(true)
    expect(workoutAffectsChallenge(challenge({ metric: 'most_handstand' }), new Set(['handstand_wall']))).toBe(true)
    expect(workoutAffectsChallenge(challenge({ metric: 'most_handstand' }), new Set(['wide_pullup']))).toBe(false)
  })

  it('never scores custom challenges from a workout', () => {
    expect(workoutAffectsChallenge(challenge({ metric: 'custom' }), new Set(['wide_pullup']))).toBe(false)
  })
})

describe('legacyPrKey', () => {
  it('maps the five PR families and nothing else', () => {
    expect(legacyPrKey('chin_up')).toBe('pr_pullups')
    expect(legacyPrKey('archer_pushup')).toBe('pr_pushups')
    expect(legacyPrKey('l_sit')).toBe('pr_lsit')
    expect(legacyPrKey('pistol_squat')).toBe('pr_pistol')
    expect(legacyPrKey('handstand_hold')).toBe('pr_handstand')
    expect(legacyPrKey('bulgarian_split_squat')).toBeNull()
  })
})

describe('isChallengeLiveOn', () => {
  it('rejects challenges that are not active', () => {
    expect(isChallengeLiveOn(challenge({ status: 'ended' }), '2026-08-10')).toBe(false)
  })

  it('rejects challenges outside their window and accepts the boundaries', () => {
    expect(isChallengeLiveOn(challenge({}), '2026-07-31')).toBe(false)
    expect(isChallengeLiveOn(challenge({}), '2026-08-01')).toBe(true)
    expect(isChallengeLiveOn(challenge({}), '2026-08-31')).toBe(true)
    expect(isChallengeLiveOn(challenge({}), '2026-09-01')).toBe(false)
  })

  it('ignores the PocketBase time component when comparing dates', () => {
    const ch = challenge({ starts_at: '2026-08-10 22:00:00.000Z', ends_at: '2026-08-10 03:00:00.000Z' })
    expect(isChallengeLiveOn(ch, '2026-08-10')).toBe(true)
  })
})

describe('pickAffectedChallenges', () => {
  it('keeps only live challenges the workout can move, preserving order', () => {
    const list = [
      challenge({ id: 'ended', status: 'ended' }),
      challenge({ id: 'custom', metric: 'custom' }),
      challenge({ id: 'future', starts_at: '2026-09-01', ends_at: '2026-09-30' }),
      challenge({ id: 'sessions' }),
      challenge({ id: 'pullups', metric: 'most_pullups' }),
    ]
    const picked = pickAffectedChallenges(list, new Set(['wide_pullup']), '2026-08-10')
    expect(picked.map(c => c.id)).toEqual(['sessions', 'pullups'])
  })

  it('drops missing entries from expands that did not resolve', () => {
    expect(pickAffectedChallenges([null, undefined], new Set(), '2026-08-10')).toEqual([])
  })
})
