import { describe, expect, it } from 'vitest'
import type { AppNotification } from '@calistenia/core/hooks/useNotifications'
import { getNotifRoute, resolveNotifUrl } from '../notification-route'

function notification(over: Partial<AppNotification>): AppNotification {
  return {
    id: 'n1',
    userId: 'me',
    type: 'referral_signup',
    actorId: 'friend-1',
    actorName: 'Ana',
    referenceId: 'friend-1',
    referenceType: 'user',
    read: false,
    created: '2026-08-11 10:00:00.000Z',
    ...over,
  }
}

describe('referral notification deep links', () => {
  // El push de referral_side_effects.pb.js siempre apuntó a /referrals, pero
  // en nativo no existía esa ruta y se desviaba a /friends (issue #354).
  it('lands a referral push on the referrals screen', () => {
    expect(resolveNotifUrl('/referrals')).toBe('/referrals')
  })

  it('lands the in-app referral notifications on the referrals screen', () => {
    expect(getNotifRoute(notification({ type: 'referral_signup' }))).toBe('/referrals')
    expect(getNotifRoute(notification({ type: 'referral_bonus' }))).toBe('/referrals')
  })
})

describe('challenge notification deep links', () => {
  it('preserves a challenge detail URL from a push payload', () => {
    expect(resolveNotifUrl('/challenges/challenge-123')).toBe('/challenges/challenge-123')
  })

  it('keeps challenge query strings intact', () => {
    expect(resolveNotifUrl('/challenges/challenge-123?source=push')).toBe('/challenges/challenge-123?source=push')
  })
})
