/**
 * Rutas y compartir del muro (web).
 *
 * El QUÉ se puede abrir lo decide `feedItemTarget` en core (es una regla de
 * privacidad, igual en las dos apps); aquí solo está el DÓNDE, que es propio de
 * react-router.
 */
import i18n from './i18n'
import { describeFeedItem, feedItemTarget, feedPublicPath, type FeedItemTarget } from '@calistenia/core/lib/feed-item'
import type { FeedItem } from '@calistenia/core/types'
import { localizedWebUrl } from '@calistenia/core/lib/app-urls'
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
 * Enlace público de una actividad, o `''` si no lo tiene. La tabla de rutas es
 * de core (`feedPublicPath`); `localizedWebUrl` solo antepone el origen y deja
 * estas rutas SIN `/es|/en` (solo marketing lo lleva).
 */
function publicUrlFor(item: FeedItem): string {
  const path = feedPublicPath(item)
  return path ? localizedWebUrl(path, i18n.language) : ''
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
