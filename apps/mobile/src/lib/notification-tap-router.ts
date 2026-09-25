/**
 * Núcleo puro del enrutado de taps de notificación (#822).
 *
 * `Notifications.getLastNotificationResponseAsync()` de expo-notifications
 * cachea a nivel NATIVO la última respuesta de notificación hasta que se
 * limpia explícitamente. Sin llamar a `clearLastNotificationResponseAsync()`
 * tras consumirla, CADA arranque en frío (icono, no notificación) la ve como
 * "nueva" y re-trackea `notification_clicked` + re-navega — en
 * `/(tabs)?autostart=1` esto arranca un entreno sin que el usuario lo pida.
 *
 * El tap EN CALIENTE (`addNotificationResponseReceivedListener`, con la app
 * en segundo plano) deja esa misma respuesta como "la última" a nivel nativo
 * (mismo valor que lee `getLastNotificationResponseAsync`): si no se limpia
 * también ahí, el SIGUIENTE arranque en frío la repetiría igual.
 *
 * `handledRequestIds` dedupea por `notification.request.identifier`: si el
 * cold-start read y el listener llegan a reportar la MISMA respuesta (carrera
 * posible si el evento nativo se emite después de que el listener ya está
 * registrado), se trackea/navega una sola vez — pero se limpia igual para no
 * dejar el valor nativo sucio.
 *
 * Extraído a un módulo puro porque el vitest de mobile no puede renderizar
 * componentes ni cargar módulos nativos (ver CLAUDE.md de `apps/mobile`):
 * este archivo no importa `expo-notifications` ni `expo-router`, solo recibe
 * sus funciones como dependencias inyectadas.
 */

/** Forma mínima de `Notifications.NotificationResponse` que necesitamos. */
export interface NotificationResponseLike {
  notification: {
    request: {
      identifier: string
      content: {
        title?: string | null
        data?: Record<string, unknown> | null
      }
    }
  }
}

export type NotificationTapSource = 'cold_start' | 'tap'

export interface NotificationTapRouterDeps<TResponse extends NotificationResponseLike> {
  /** `Notifications.getLastNotificationResponseAsync` (o equivalente fake). */
  getLastNotificationResponseAsync: () => Promise<TResponse | null>
  /** `Notifications.addNotificationResponseReceivedListener`. */
  addNotificationResponseReceivedListener: (
    listener: (response: TResponse) => void
  ) => { remove: () => void }
  /**
   * `Notifications.clearLastNotificationResponseAsync` (no la variante sync
   * `clearLastNotificationResponse`: en SDK 57 la sync es la vigente y la
   * async un alias marcado @deprecated, pero en SDK 58 se invierte — la
   * async pasa a ser la vigente. Ambas existen y hacen lo mismo en las dos
   * versiones, así que usar la async es lo que no se rompe en el bump de
   * dependabot #785; ver expo-notifications/build/NotificationsEmitter.js
   * instalado). Se llama en fire-and-forget: el dedupe de este módulo ya
   * evita el doble track sin esperar a que la nativa confirme.
   */
  clearLastNotificationResponse: () => void
  /** `resolveNotifUrl` de `@/lib/notification-route`. */
  resolveNotifUrl: (url: string | undefined) => string | null
  /** `routerRef.current.push`, ya con el cast de ruta aplicado por el caller. */
  push: (route: string) => void
  /** El `trackTap` existente (evento canónico `notification_clicked`). */
  track: (response: TResponse, source: NotificationTapSource) => void
}

/**
 * Registra el manejo de cold-start + taps en caliente. Devuelve la función de
 * limpieza (equivalente a `sub.remove()`) para el `useEffect` que la llama.
 */
export function setupNotificationTapRouting<TResponse extends NotificationResponseLike>(
  deps: NotificationTapRouterDeps<TResponse>
): () => void {
  const handledRequestIds = new Set<string>()

  const handle = (response: TResponse, source: NotificationTapSource) => {
    const id = response.notification.request.identifier
    if (!handledRequestIds.has(id)) {
      handledRequestIds.add(id)
      deps.track(response, source)
      const url = response.notification.request.content.data?.url as string | undefined
      const route = deps.resolveNotifUrl(url)
      if (route) deps.push(route)
    }
    // Limpiar SIEMPRE tras consumir (se procese o se dedupe): un cold start
    // posterior no debe volver a ver esta respuesta. Limpiar solo DESPUÉS de
    // trackear/navegar — el primer tap real tiene que seguir haciendo ambas
    // cosas exactamente una vez.
    deps.clearLastNotificationResponse()
  }

  // COLD START: si la app se abrió tocando una notificación (o si la última
  // respuesta quedó sin limpiar de una sesión anterior — el motivo de #822).
  deps
    .getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return
      handle(response, 'cold_start')
    })
    .catch(() => {
      /* ignore */
    })

  // FOREGROUND / BACKGROUND TAP: listener para taps mientras la app sigue viva.
  const sub = deps.addNotificationResponseReceivedListener((response) => handle(response, 'tap'))

  return () => sub.remove()
}
