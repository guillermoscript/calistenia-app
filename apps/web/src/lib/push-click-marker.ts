/**
 * Marcador en la URL para el click de un push cuando NO hay ninguna pestaña
 * abierta (#822, menor).
 *
 * `notificationclick` en `sw.ts` distingue dos casos: si hay una ventana
 * abierta, le postea `NOTIFICATION_CLICKED` (camino existente, sin cambios).
 * Si NO hay ninguna, abre una con `self.clients.openWindow(targetUrl)` — pero
 * esa promesa puede resolver ANTES de que el script de la página nueva
 * (`main.tsx`) haya terminado de cargar y registrar su listener de
 * `postMessage`: es una carrera con el arranque de la SPA, no un fallo
 * intermitente, así que postear ahí pierde el evento casi siempre. La URL sí
 * llega garantizada con la navegación — por eso el marcador viaja en el query
 * string en vez de por `postMessage`.
 *
 * Solo lleva `campaign` (un slug controlado por el servidor, p.ej.
 * `inactivity_24h`) — nunca el título del push. El título de un push social
 * puede ser el nombre real de OTRO usuario (`pb_hooks/utils/notifications.js`:
 * "<nombre> empezó a entrenar", "<nombre> lleva N días seguidos"), y este
 * marcador viaja por `self.clients.openWindow(url)`: ese nombre asomaría en
 * la barra de direcciones y en el historial local del navegador de quien NO
 * tiene ninguna pestaña abierta. El camino de pestaña ya abierta sigue
 * mandando el título por `postMessage` (nunca toca la URL) — eso no cambia.
 *
 * Vive fuera de `sw.ts` y de `main.tsx` para poder testearse (mismo motivo
 * que `sw-navigation.ts`): ninguna de las dos funciones toca `self`/`window`.
 */

const MARKER_PARAM = 'notif_click'
const CAMPAIGN_PARAM = 'notif_campaign'

// Base falsa: solo nos interesan pathname/search/hash, nunca el origin.
const FAKE_BASE = 'https://push-click-marker.invalid'

export interface NotificationClickMeta {
  campaign?: string
}

/** SW: añade el marcador a la URL de destino sin pisar su query existente. */
export function withNotificationClickMarker(targetUrl: string, meta: NotificationClickMeta): string {
  const url = new URL(targetUrl, FAKE_BASE)
  url.searchParams.set(MARKER_PARAM, '1')
  if (meta.campaign) url.searchParams.set(CAMPAIGN_PARAM, meta.campaign)
  return `${url.pathname}${url.search}${url.hash}`
}

export interface NotificationClickMarker {
  campaign?: string
  /** URL sin los parámetros del marcador — lo que queda en el historial. */
  cleanUrl: string
}

/**
 * main.tsx (boot, antes de montar React): lee el marcador de la URL actual.
 * `null` si no hay marcador (arranque normal, sin push de por medio).
 */
export function readNotificationClickMarker(href: string): NotificationClickMarker | null {
  const url = new URL(href)
  if (url.searchParams.get(MARKER_PARAM) !== '1') return null

  const campaign = url.searchParams.get(CAMPAIGN_PARAM) ?? undefined

  url.searchParams.delete(MARKER_PARAM)
  url.searchParams.delete(CAMPAIGN_PARAM)

  return { campaign, cleanUrl: `${url.pathname}${url.search}${url.hash}` }
}
