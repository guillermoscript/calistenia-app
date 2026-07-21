/**
 * Enrutado de notificaciones → deep-link.
 *
 * Un único mapeo compartido por:
 *  - La campana / lista de notificaciones (`app/notifications.tsx`), que recibe
 *    un `AppNotification` con `referenceId` (el id de la entidad concreta).
 *  - Los taps de push (`app/_layout.tsx`), que reciben una `url` estilo web en
 *    el payload (`data.url`).
 *
 * Objetivo: que tocar una notificación lleve a la entidad concreta (el post y
 * sus comentarios, el perfil del actor, el reto…) en vez de a una pestaña
 * genérica. Espeja `getNotificationRoute` de la web
 * (`apps/web/src/pages/NotificationsPage.tsx`), adaptado a las rutas nativas.
 *
 * Rutas nativas existentes (expo-router): `/` (home), `/social`, `/u/[id]`,
 * `/challenges`, `/friends`, `/history`, `/profile`, `/nutrition`,
 * `/notifications`, `/cardio/[id]`, `/program/[id]`.
 * Aún NO existen `/challenges/[id]` ni una vista de post individual, así que esos
 * casos caen a la lista/feed correspondiente (ver TODOs).
 */
import type { AppNotification } from '@calistenia/core/hooks/useNotifications'

/** Ruta para `router.push`. String porque construimos paths dinámicos (`/u/<id>`). */
export type NotifRoute = string

/**
 * Mapea una notificación in-app (campana) a su ruta de destino.
 * Usa `referenceId` para aterrizar en la entidad concreta.
 */
export function getNotifRoute(n: AppNotification): NotifRoute {
  switch (n.type) {
    case 'follow':
      return n.actorId ? `/u/${n.actorId}` : '/social'

    case 'reaction':
    case 'comment':
    case 'comment_reply': {
      // referenceId = id de la sesión (el post). Abrimos ese post y su hoja de
      // comentarios directamente (social.tsx lee ?session=). Si la notificación
      // apunta a un comentario concreto (comentario/respuesta/reacción a comentario),
      // pasamos también ?comment= para resaltarlo dentro del sheet.
      if (!n.referenceId) return '/social'
      const commentId = n.data?.commentId
      const commentQs = commentId ? `&comment=${commentId}` : ''
      return `/social?session=${n.referenceId}${commentQs}`
    }

    case 'challenge_join':
    case 'challenge_complete':
      // TODO: cuando exista /challenges/[id], usar `/challenges/${n.referenceId}`.
      return '/challenges'

    case 'achievement':
      return '/profile'

    case 'streak':
      // No hay /progress en nativo; historial es el equivalente más cercano.
      return '/history'

    case 'referral_signup':
    case 'referral_bonus':
      // No hay /referrals en nativo; amigos es lo más cercano.
      return '/friends'

    case 'friend_streak':
    case 'friend_achievement':
    case 'friend_workout':
    case 'friend_joined':
      return n.actorId ? `/u/${n.actorId}` : '/social'

    default:
      // Tipo desconocido: al menos abrir la lista en vez de no hacer nada.
      return '/notifications'
  }
}

/**
 * Mapea la `url` estilo web de un payload de push a la ruta nativa equivalente.
 * Conserva el query string (`?session=…`) para que un push de comentario/reacción
 * pueda abrir el post concreto si el servidor lo incluye.
 */
export function resolveNotifUrl(url: string | undefined | null): NotifRoute | null {
  if (!url) return null

  const [rawPath, rawQuery] = url.split('?')
  const path = rawPath.replace(/\/$/, '') // sin barra final
  const query = rawQuery ? `?${rawQuery}` : ''

  if (path === '' || path === '/') return '/'
  if (path === '/feed' || path === '/social') return `/social${query}`
  if (path.startsWith('/u/')) return path // /u/<id> pasa tal cual
  if (path === '/progress' || path === '/history') return '/history'
  if (path === '/profile') return '/profile'
  if (path === '/notifications') return '/notifications'
  if (path.startsWith('/challenges')) return '/challenges'
  if (path === '/referrals') return '/friends'
  if (path.startsWith('/nutrition')) return '/nutrition'

  return '/notifications'
}
