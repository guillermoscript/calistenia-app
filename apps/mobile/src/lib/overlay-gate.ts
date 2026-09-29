/**
 * Turno de los modales automáticos (#858). Tres modales saltaban solos sobre
 * el inicio sin saber unos de otros: `WhatsNewModal`, `StreakMilestone` y
 * `DiscoverySurvey` (este vive en el layout raíz, fuera del inicio). Aquí:
 *
 * - Cada modal automático se apunta mientras está visible (`setOverlayOpen`),
 *   y la encuesta no sale mientras haya otro (`isAnyOverlayOpen`).
 * - El inicio publica si la cuenta ya tiene algún entreno
 *   (`setAccountHasTrained`): ni la encuesta ni las novedades salen antes del
 *   primer entreno.
 *
 * Estado de módulo a propósito: la encuesta ya reintenta cada 15 s
 * (`DISCOVERY_SURVEY_RETRY_MS`), así que le basta con leer, sin suscribirse.
 * Sin imports con `@/`: lo prueba el Vitest del móvil.
 */

const open = new Set<string>()
let accountHasTrained = false

export function setOverlayOpen(id: string, isOpen: boolean): void {
  if (isOpen) open.add(id)
  else open.delete(id)
}

export function isAnyOverlayOpen(): boolean {
  return open.size > 0
}

export function setAccountHasTrained(value: boolean): void {
  accountHasTrained = value
}

export function hasAccountTrained(): boolean {
  return accountHasTrained
}

/** Solo para tests. */
export function resetOverlayGate(): void {
  open.clear()
  accountHasTrained = false
}
