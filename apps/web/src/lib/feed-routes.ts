/**
 * Rutas y compartir del muro (web).
 *
 * El QUÉ se puede abrir lo decide `feedItemTarget` en core (es una regla de
 * privacidad, igual en las dos apps); aquí solo está el DÓNDE, que es propio de
 * react-router.
 */
import i18n from './i18n'
import { describeFeedItem, feedItemTarget, type FeedItemTarget } from '@calistenia/core/lib/feed-item'
import type { FeedItem } from '@calistenia/core/types'
import { WEB_BASE_URL } from '@calistenia/core/lib/app-urls'
import { shareContent } from './share'

/** Ruta interna de un destino del muro. */
export function feedItemPath(target: FeedItemTarget): string {
  switch (target.kind) {
    case 'workout': return `/s/${target.id}`
    case 'cardio': return `/cardio/session/${target.id}`
    case 'circuit': return `/circuit/history/${target.id}`
    case 'challenge': return `/challenges/${target.id}`
    case 'race': return `/race/${target.id}`
    // La batalla no tiene pantalla propia por id fuera de la partida en curso;
    // el historial vive en el progreso del propio usuario.
    case 'battle': return '/progress'
  }
}

/** `null` cuando la tarjeta no debe ser pulsable (ver `feedItemTarget`). */
export function feedItemHref(item: FeedItem, isOwnPost: boolean): string | null {
  const target = feedItemTarget(item, isOwnPost)
  return target ? feedItemPath(target) : null
}

/**
 * Enlace público de una actividad, o `''` si no lo tiene.
 *
 * Una sesión de fuerza se comparte por `/s/:id` y NO por
 * `/session/:date/:workoutKey`: esa segunda ruta pinta el ProgressMap del
 * usuario logueado, así que el enlace que compartías de tu entreno abría el
 * de quien lo recibía —o nada—. `/s/:id` reconstruye la sesión desde PocketBase
 * y funciona para cualquiera.
 */
function publicUrlFor(item: FeedItem): string {
  switch (item.type) {
    case 'workout': return `${WEB_BASE_URL}/s/${item.id}`
    case 'cardio': return `${WEB_BASE_URL}/cardio/session/${item.id}`
    case 'challenge': return item.challenge ? `${WEB_BASE_URL}/challenges/${item.challenge.challengeId}` : ''
    case 'race': return item.race ? `${WEB_BASE_URL}/race/${item.race.raceId}` : ''
    // Circuito y batalla no tienen vista pública: se comparte solo el texto en
    // lugar de un enlace que al receptor le daría un error.
    default: return ''
  }
}

/** Compartir una tarjeta del muro, con el texto que ya usa la propia tarjeta. */
export function shareFeedItem(item: FeedItem): Promise<boolean> {
  const view = describeFeedItem(item)
  const text = `${item.displayName} ${view.action}: ${view.title}`
  return shareContent({
    title: i18n.t('share.sessionTitle', { user: item.displayName, workout: view.title }),
    text: view.metrics ? `${text} · ${view.metrics}` : text,
    url: publicUrlFor(item),
  })
}
