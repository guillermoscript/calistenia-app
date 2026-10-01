import { describe, expect, it } from 'vitest'
import type { AppNotification, NotificationType } from '@calistenia/core/hooks/useNotifications'
import { getNotifRoute, resolveNotifUrl } from '../notification-route'

declare global {
  interface ImportMeta {
    /** Lo expande Vite (vitest) al compilar el test. */
    glob(pattern: string): Record<string, () => Promise<unknown>>
  }
}

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

describe('five tabs and redirects (#859)', () => {
  // Historial pasó a ser la pestaña Progreso: los push ya enviados con
  // `/history` y los de racha tienen que aterrizar en ella.
  it('opens Progreso for an old /history push and for /progress', () => {
    expect(resolveNotifUrl('/history')).toBe('/progress')
    expect(resolveNotifUrl('/progress')).toBe('/progress')
  })

  it('lands a streak notification on Progreso', () => {
    expect(getNotifRoute(notification({ type: 'streak' }))).toBe('/progress')
  })

  it('keeps /profile working now that Perfil is a stack screen', () => {
    expect(resolveNotifUrl('/profile')).toBe('/profile')
    expect(getNotifRoute(notification({ type: 'achievement' }))).toBe('/profile')
  })

  it('opens the achievements screen for an early achievement (#802)', () => {
    expect(getNotifRoute(notification({ type: 'achievement', data: { achievementKey: 'first_workout' } }))).toBe('/achievements')
  })
})

describe('every notification route exists in the app (#859)', () => {
  // Al mover pestañas a la pila es fácil dejar un push apuntando a una ruta
  // que ya no existe: expo-router no falla, enseña «Unmatched route».
  // Vitest lista los ficheros de rutas sin importarlos (glob perezoso). El
  // tsc de la app no tiene los tipos de Node ni los de Vite.
  const routeFiles = new Set(
    Object.keys(import.meta.glob('../../app/**/*.tsx')).map(f => f.replace('../../app/', '')),
  )

  function routeExists(route: string): boolean {
    const path = route.split('?')[0]
    if (path === '/' || path === '/(tabs)') return true
    const first = path.split('/')[1]
    return [`${first}.tsx`, `${first}/index.tsx`, `${first}/[id].tsx`, `(tabs)/${first}.tsx`]
      .some(candidate => routeFiles.has(candidate))
  }

  const types: NotificationType[] = [
    'follow', 'follow_request', 'follow_accepted', 'reaction', 'comment', 'comment_reply',
    'challenge_join', 'challenge_complete', 'achievement', 'streak', 'referral_signup',
    'referral_bonus', 'friend_streak', 'friend_achievement', 'friend_workout', 'friend_joined',
    'program_deleted', 'inactivity_24h', 'inactivity_72h', 'inactivity_7d', 'inactivity_14d',
    'inactivity_new_start',
  ]

  it.each(types)('in-app %s notification opens an existing route', type => {
    expect(routeExists(getNotifRoute(notification({ type, referenceId: 'x' })))).toBe(true)
  })

  it.each([
    '/', '/feed', '/social', '/u/abc', '/workout', '/progress', '/history', '/profile',
    '/notifications', '/challenges', '/challenges/abc', '/referrals', '/nutrition', '/unknown',
  ])('push url %s opens an existing route', url => {
    expect(routeExists(resolveNotifUrl(url) ?? '/')).toBe(true)
  })

  it('detects a route that does not exist', () => {
    expect(routeExists('/no-such-screen')).toBe(false)
  })
})
