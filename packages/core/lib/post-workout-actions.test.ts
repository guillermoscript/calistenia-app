import { describe, expect, it } from 'vitest'
import { buildPostWorkoutActions } from './post-workout-actions'

const ids = (input: Parameters<typeof buildPostWorkoutActions>[0]) =>
  buildPostWorkoutActions(input).map(a => a.id)

describe('buildPostWorkoutActions', () => {
  it('always offers share, challenge and progress', () => {
    expect(ids({ canInvite: false, canRepeat: false })).toEqual(['share', 'challenge', 'progress'])
  })

  it('makes share the only primary action', () => {
    const actions = buildPostWorkoutActions({ canInvite: true, canRepeat: true })
    expect(actions.filter(a => a.emphasis === 'primary').map(a => a.id)).toEqual(['share'])
  })

  it('adds invite only when there is a referral code', () => {
    expect(ids({ canInvite: true, canRepeat: false })).toContain('invite')
    expect(ids({ canInvite: false, canRepeat: false })).not.toContain('invite')
  })

  it('adds repeat only when the host can restart the workout', () => {
    expect(ids({ canInvite: false, canRepeat: true })).toContain('repeat')
    expect(ids({ canInvite: false, canRepeat: false })).not.toContain('repeat')
  })

  it('keeps a stable order regardless of which actions are available', () => {
    expect(ids({ canInvite: true, canRepeat: true, affectedChallengeId: 'c1' }))
      .toEqual(['share', 'invite', 'challenge', 'progress', 'repeat'])
  })

  it('offers the challenge action with or without an affected challenge', () => {
    expect(ids({ canInvite: false, canRepeat: false, affectedChallengeId: 'c1' })).toContain('challenge')
    expect(ids({ canInvite: false, canRepeat: false, affectedChallengeId: null })).toContain('challenge')
  })
})
