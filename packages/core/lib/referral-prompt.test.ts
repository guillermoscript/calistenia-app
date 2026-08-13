import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../platform'
import {
  isReferralPromptOnCooldown,
  markReferralPromptHandled,
  markReferralPromptViewed,
  resetReferralPromptSession,
  shouldShowReferralPrompt,
} from './referral-prompt'

vi.mock('../platform', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

const NOW = Date.parse('2026-08-09T12:00:00.000Z')

beforeEach(() => {
  resetReferralPromptSession()
  vi.mocked(storage.getItem).mockReset()
  vi.mocked(storage.setItem).mockReset()
})

describe('referral prompt eligibility', () => {
  it('only shows from the third workout for an authenticated user with a code', () => {
    vi.mocked(storage.getItem).mockReturnValue(null)

    expect(shouldShowReferralPrompt({ userId: 'u1', referralCode: 'CODE', totalSessions: 1, now: NOW })).toBe(false)
    expect(shouldShowReferralPrompt({ userId: 'u1', referralCode: 'CODE', totalSessions: 2, now: NOW })).toBe(false)
    expect(shouldShowReferralPrompt({ userId: 'u1', referralCode: 'CODE', totalSessions: 3, now: NOW })).toBe(true)
    expect(shouldShowReferralPrompt({ userId: null, referralCode: 'CODE', totalSessions: 3, now: NOW })).toBe(false)
    expect(shouldShowReferralPrompt({ userId: 'u1', referralCode: null, totalSessions: 3, now: NOW })).toBe(false)
  })

  it('persists a 14-day cooldown after dismissal or completion', () => {
    markReferralPromptHandled('u1', NOW)
    expect(storage.setItem).toHaveBeenCalledWith(
      'calistenia_referral_prompt_shown_u1',
      '2026-08-09T12:00:00.000Z',
    )

    resetReferralPromptSession()
    vi.mocked(storage.getItem).mockReturnValue('2026-08-09T12:00:00.000Z')
    expect(isReferralPromptOnCooldown('u1', NOW + 13 * 24 * 60 * 60 * 1000)).toBe(true)
    expect(isReferralPromptOnCooldown('u1', NOW + 14 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('tolerates legacy and invalid stored values by allowing the prompt', () => {
    vi.mocked(storage.getItem).mockReturnValueOnce('true').mockReturnValueOnce('not-a-date')
    expect(isReferralPromptOnCooldown('u1', NOW)).toBe(false)
    expect(isReferralPromptOnCooldown('u1', NOW)).toBe(false)
  })

  it('suppresses repeated prompts for the same user during one app session', () => {
    vi.mocked(storage.getItem).mockReturnValue(null)
    expect(shouldShowReferralPrompt({ userId: 'u1', referralCode: 'CODE', totalSessions: 3, now: NOW })).toBe(true)
    markReferralPromptViewed('u1')
    expect(shouldShowReferralPrompt({ userId: 'u1', referralCode: 'CODE', totalSessions: 4, now: NOW })).toBe(false)
    expect(shouldShowReferralPrompt({ userId: 'u2', referralCode: 'OTHER', totalSessions: 3, now: NOW })).toBe(true)
  })
})
