import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../platform'
import { trackCanonicalEvent } from './analytics'
import {
  INVITED_PROGRAM_KEY,
  pickInvitedProgramId,
  saveInvitedProgram,
  takeInvitedProgram,
  trackReferralProgramMatched,
} from './invited-program'

vi.mock('../platform', () => ({
  storage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock('./analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./analytics')>()
  return { ...actual, trackCanonicalEvent: vi.fn() }
})

const NOW = 1_800_000_000_000

beforeEach(() => {
  vi.mocked(storage.getItem).mockReset()
  vi.mocked(storage.setItem).mockReset()
  vi.mocked(storage.removeItem).mockReset()
  vi.mocked(trackCanonicalEvent).mockReset()
})

describe('invited program handoff', () => {
  it('saves the referrer program for the new user', () => {
    saveInvitedProgram('new', 'ref', 'prog-1', NOW)
    expect(storage.setItem).toHaveBeenCalledWith(
      INVITED_PROGRAM_KEY,
      JSON.stringify({ userId: 'new', referrerId: 'ref', programId: 'prog-1', createdAt: NOW }),
    )
  })

  it('takes it once for the same user', () => {
    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ userId: 'new', referrerId: 'ref', programId: 'p', createdAt: NOW }))
    expect(takeInvitedProgram('new', NOW + 1000)).toMatchObject({ programId: 'p', referrerId: 'ref' })
    expect(storage.removeItem).toHaveBeenCalledWith(INVITED_PROGRAM_KEY)
  })

  it('ignores another user, an expired value and garbage', () => {
    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ userId: 'other', referrerId: 'r', programId: 'p', createdAt: NOW }))
    expect(takeInvitedProgram('new', NOW)).toBeNull()
    expect(storage.removeItem).not.toHaveBeenCalled()

    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ userId: 'new', referrerId: 'r', programId: 'p', createdAt: NOW }))
    expect(takeInvitedProgram('new', NOW + 25 * 60 * 60 * 1000)).toBeNull()

    vi.mocked(storage.getItem).mockReturnValue('{nope')
    expect(takeInvitedProgram('new', NOW)).toBeNull()
    expect(takeInvitedProgram(null, NOW)).toBeNull()
  })

  it('only preselects a program the invitee can see', () => {
    const programs = [{ id: 'a' }, { id: 'b' }]
    expect(pickInvitedProgramId({ programId: 'b' }, programs)).toBe('b')
    expect(pickInvitedProgramId({ programId: 'private' }, programs)).toBeNull()
    expect(pickInvitedProgramId(null, programs)).toBeNull()
  })

  it('emits referral_program_matched with the matched flag', () => {
    trackReferralProgramMatched({ referrerId: 'ref', programId: 'p', matched: true, stage: 'onboarding' })
    expect(trackCanonicalEvent).toHaveBeenCalledWith('referral_program_matched', expect.objectContaining({
      referrer_id: 'ref', program_id: 'p', matched: true, result: 'matched',
    }))
    trackReferralProgramMatched({ referrerId: 'ref', programId: null, matched: false, stage: 'registration' })
    expect(trackCanonicalEvent).toHaveBeenLastCalledWith('referral_program_matched', expect.objectContaining({
      referrer_id: 'ref', matched: false, result: 'unmatched',
    }))
  })
})
