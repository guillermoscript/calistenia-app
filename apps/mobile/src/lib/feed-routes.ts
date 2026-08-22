/**
 * Rutas y compartir del muro (nativa).
 *
 * El QUÉ se puede abrir lo decide `feedItemTarget` en core (es una regla de
 * privacidad, igual en las dos apps); aquí solo está el DÓNDE, que es propio de
 * expo-router, más lo que esta app todavía no tiene pantalla para enseñar.
 */
import type { useRouter } from 'expo-router'
import { describeFeedItem, feedItemTarget } from '@calistenia/core/lib/feed-item'
import { WEB_BASE_URL } from '@calistenia/core/lib/app-urls'
import type { FeedItem } from '@calistenia/core/types'
import { shareText } from './share'

// `expo-router` no exporta un tipo `Router` público; se deriva del hook para
// que siga al día si cambia la firma de `push`.
type Router = ReturnType<typeof useRouter>
type FeedHref = Parameters<Router['push']>[0]

/**
 * Destino nativo de una tarjeta, o `null` si no hay a dónde ir.
 *
 * Dos motivos para el `null`, y conviene no confundirlos:
 *  - PRIVACIDAD (lo resuelve core): el circuito de otra persona y la batalla que
 *    no jugaste no se pueden leer.
 *  - PANTALLA QUE NO EXISTE (lo resuelve este fichero): la app nativa no tiene
 *    detalle de circuito por id — solo `/circuit`, que arranca uno nuevo—, así
 *    que ni siquiera el circuito propio tiene destino aquí.
 */
export function feedItemHref(item: FeedItem, isOwnPost: boolean): FeedHref | null {
  const target = feedItemTarget(item, isOwnPost)
  if (!target) return null

  switch (target.kind) {
    case 'workout': return { pathname: '/s/[id]', params: { id: target.id } }
    case 'cardio': return { pathname: '/cardio/[id]', params: { id: target.id } }
    case 'challenge': return { pathname: '/challenges/[id]', params: { id: target.id } }
    case 'race': return { pathname: '/race/[id]', params: { id: target.id } }
    // El historial de batallas vive en su propia pantalla, no hay detalle por id
    // de una batalla ya cerrada.
    case 'battle': return '/battle-history'
    case 'circuit': return null
    default: return null
  }
}

export function openFeedItem(router: Router, item: FeedItem, isOwnPost: boolean): void {
  const href = feedItemHref(item, isOwnPost)
  if (href) router.push(href)
}

/**
 * Enlace público de una actividad, o `''` si no lo tiene.
 *
 * Una sesión de fuerza se comparte por `/s/:id` y NO por
 * `/session/:date/:workoutKey`: esa segunda ruta pinta el progreso del usuario
 * logueado, así que el enlace de tu entreno abría el de quien lo recibía.
 */
function publicUrlFor(item: FeedItem): string {
  switch (item.type) {
    case 'workout': return `${WEB_BASE_URL}/s/${item.id}`
    case 'cardio': return `${WEB_BASE_URL}/cardio/session/${item.id}`
    case 'challenge': return item.challenge ? `${WEB_BASE_URL}/challenges/${item.challenge.challengeId}` : ''
    case 'race': return item.race ? `${WEB_BASE_URL}/race/${item.race.raceId}` : ''
    default: return ''
  }
}

/** Compartir una tarjeta del muro, con el mismo texto que enseña la tarjeta. */
export function shareFeedItem(item: FeedItem): Promise<unknown> {
  const view = describeFeedItem(item)
  const base = `${item.displayName} ${view.action}: ${view.title}`
  // `shareText` solo acepta mensaje y URL; el título del sheet nativo lo pone
  // el sistema a partir del mensaje.
  return shareText({
    message: view.metrics ? `${base} · ${view.metrics}` : base,
    url: publicUrlFor(item),
  }).catch(() => undefined)
}
