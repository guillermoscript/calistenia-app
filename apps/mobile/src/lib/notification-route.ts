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
 * `/challenges`, `/challenges/[id]`, `/friends`, `/history`, `/profile`,
 * `/nutrition`, `/notifications`, `/referrals`, `/cardio/[id]`, `/program/[id]`.
 * Aún NO existe una vista de post individual, así que ese caso cae al feed
 * (ver comentario en `reaction`/`comment`/`comment_reply`).
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
    case 'follow_request':
    case 'follow_accepted':
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
      return n.referenceId ? `/challenges/${n.referenceId}` : '/challenges'

    case 'achievement':
      return '/profile'

    case 'streak':
      // No hay /progress en nativo; historial es el equivalente más cercano.
      return '/history'

    case 'referral_signup':
    case 'referral_bonus':
      return '/referrals'

    case 'friend_streak':
    case 'friend_achievement':
    case 'friend_workout':
    case 'friend_joined':
      return n.actorId ? `/u/${n.actorId}` : '/social'

    case 'program_deleted':
      // `referenceId` lleva el id del programa borrado como rastro, pero NO se
      // navega a él: el registro ya no existe y `/program/[id]` daría un 404.
      // El catálogo es la acción útil que le queda al usuario: buscarse otro.
      return '/programs'

    case 'inactivity_24h':
    case 'inactivity_72h':
      // La acción útil es entrenar: Home arranca el entreno de hoy (#695).
      return '/(tabs)?autostart=1'

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
  // Recordatorio de entreno / push de inactividad (#695): el servidor manda
  // `/workout` sin saber que en nativo no existe esa ruta. Abrimos Home con
  // `autostart=1`: (tabs)/index.tsx arranca el entreno de hoy en cuanto carga
  // en vez de dejar al usuario en la lista de notificaciones.
  if (path === '/workout') return '/(tabs)?autostart=1'
  if (path === '/progress' || path === '/history') return '/history'
  if (path === '/profile') return '/profile'
  if (path === '/notifications') return '/notifications'
  if (path.startsWith('/challenges/')) return `${path}${query}`
  if (path === '/challenges') return '/challenges'
  if (path === '/referrals') return '/referrals'
  if (path.startsWith('/nutrition')) return '/nutrition'

  return '/notifications'
}
