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

describe('workout reminder / inactivity push deep link (#695)', () => {
  // El servidor manda `url: '/workout'` para los recordatorios y los pushes
  // de inactividad, pero esa ruta no existe en nativo — antes caía al
  // `default` y aterrizaba en /notifications en vez de arrancar el entreno.
  it('lands a workout reminder push on home with autostart', () => {
    expect(resolveNotifUrl('/workout')).toBe('/(tabs)?autostart=1')
  })

  it('ignores any query string on the workout url — autostart always wins', () => {
    expect(resolveNotifUrl('/workout?x=1')).toBe('/(tabs)?autostart=1')
  })

  // Dos mapeos existentes, sin regresión tras el cambio de arriba.
  it('still lands a referral push on /referrals', () => {
    expect(resolveNotifUrl('/referrals')).toBe('/referrals')
  })

  it('still keeps a challenge detail url intact', () => {
    expect(resolveNotifUrl('/challenges/challenge-123')).toBe('/challenges/challenge-123')
  })
})

describe('program deleted notification (#633)', () => {
  // `referenceId` guarda el id del programa borrado como rastro, pero navegar
  // ahí daría un 404: el registro ya no existe. El catálogo es la acción útil
  // que le queda al usuario.
  it('lands on the catalog, never on the dead program', () => {
    const n = notification({ type: 'program_deleted', referenceId: 'prog-borrado' })
    expect(getNotifRoute(n)).toBe('/programs')
  })

  it('does not fall through to the unknown-type default', () => {
    // El `default` manda a /notifications, que es donde el usuario YA está.
    expect(getNotifRoute(notification({ type: 'program_deleted' }))).not.toBe('/notifications')
  })
})
