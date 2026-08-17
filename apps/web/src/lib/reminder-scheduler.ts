/**
 * Reminder notification scheduler — LEGADO, solo se usa para LIMPIAR.
 *
 * La entrega de recordatorios la hace el servidor
 * (`mcp-server/src/api/reminder-dispatcher.ts` → Web Push): es lo único que
 * llega con la pestaña cerrada, y es donde se aplica la zona horaria del
 * usuario. `RemindersPage` solo llama a `cancelAllScheduled()`.
 *
 * NO reintroduzcas programación local de notificaciones aquí: con el
 * dispatcher activo, cada recordatorio sonaría DOS veces (la notificación
 * local de esta pestaña + el push del servidor). El código que programaba
 * timers locales ya se borró; lo único que queda es la limpieza del service
 * worker, cuyos timers sobreviven a la recarga de la página.
 */

/**
 * Cancel every locally-scheduled reminder that a previous version of the app
 * left behind in the service worker.
 *
 * Los timers de página de versiones antiguas mueren solos con la recarga; los
 * del service worker no, así que se le manda la lista vacía para que limpie
 * sus timers y su interval.
 */
export function cancelAllScheduled(): void {
  navigator.serviceWorker?.ready
    ?.then(reg => {
      reg.active?.postMessage({ type: 'SCHEDULE_REMINDERS', reminders: [] })
    })
    .catch(() => { /* SW no disponible — nada que limpiar */ })
}
