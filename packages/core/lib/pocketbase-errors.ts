/**
 * Predicados sobre los errores que lanza el SDK de PocketBase.
 *
 * El SDK auto-cancela una petición en vuelo cuando se registra otra con la
 * misma clave (por defecto `MÉTODO + ruta`, sin query string) y la abortada
 * rechaza con `isAbort: true` y `status: 0`. Ver #536, #559 y #565.
 */

/** `true` si `err` es el rechazo de una petición que el SDK auto-canceló. */
export function isAutoCancelError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { isAbort?: unknown }).isAbort === true
}
