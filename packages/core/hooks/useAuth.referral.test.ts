import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../platform'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '../lib/analytics'
import { pb } from '../lib/pocketbase'
import {
  captureReferralCode,
  completeNewUserRegistration,
  discardCapturedReferralCode,
} from './useAuth'

vi.mock('../platform', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

const { update, getList, create } = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue({}),
  getList: vi.fn().mockResolvedValue({ items: [{ id: 'referrer-1' }] }),
  create: vi.fn().mockResolvedValue({}),
}))

vi.mock('../lib/pocketbase', () => ({
  pb: {
    filter: vi.fn().mockReturnValue('filtered'),
    collection: vi.fn((name: string) => {
      if (name === 'users') return { update, getList }
      if (name === 'referrals') return { create }
      return {}
    }),
    authStore: { onChange: vi.fn(() => vi.fn()) },
  },
  getCurrentUser: vi.fn(() => null),
  loginWithOAuth2: vi.fn(),
  logout: vi.fn(),
  tryRefreshAuth: vi.fn(),
  verifyAuth: vi.fn(),
}))

vi.mock('../lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/analytics')>()
  return {
    ...actual,
    op: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() },
    trackCanonicalEvent: vi.fn(),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('referral attribution lifecycle', () => {
  it('captures and explicitly discards pending attribution', () => {
    captureReferralCode('INVITE-1')
    expect(storage.setItem).toHaveBeenCalledWith('calistenia_referral_code', 'INVITE-1')

    discardCapturedReferralCode()
    expect(storage.removeItem).toHaveBeenCalledWith('calistenia_referral_code')
  })

  it('finalizes Google signup through the same referral and reward path', async () => {
    vi.mocked(storage.getItem).mockReturnValue('INVITE-1')

    await completeNewUserRegistration({
      id: 'new-user',
      email: 'new@example.com',
      display_name: 'Nueva Atleta',
    } as any, 'google')

    expect(op.track).toHaveBeenCalledWith('signup_completed', { method: 'google' })
    expect(update).toHaveBeenCalledWith('new-user', expect.objectContaining({ referral_code: expect.any(String) }))
    expect(storage.removeItem).toHaveBeenCalledWith('calistenia_referral_code')
    expect(create).toHaveBeenCalledWith({
      referrer: 'referrer-1',
      referred: 'new-user',
      source: 'quick_invite',
    })
    expect(trackCanonicalEvent).toHaveBeenCalledWith(
      CANONICAL_ANALYTICS_EVENTS.referralConverted,
      expect.objectContaining({ source: 'quick_invite', result: 'converted' }),
    )
  })
})
