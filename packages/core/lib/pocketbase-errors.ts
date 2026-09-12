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

/**
 * `true` si `err` merece un reintento: no hubo respuesta útil del servidor y
 * repetir la misma petición puede darla.
 *
 * Cubre dos casos:
 *   - `status: 0` sin `isAbort` → no hubo respuesta (red caída, DNS, TLS).
 *     Ver [[project-offline-queue-sets-301]]: el SDK usa 0 como «sin respuesta».
 *   - `status >= 500` → el 502/504 de Cloudflare/Traefik cuando el origen tarda
 *     o se está recreando el contenedor en un deploy.
 *
 * Los 4xx NO entran: son determinísticos (auth, validación, 404 por regla de
 * lista) y reintentarlos sólo suma latencia. Misma política que el `retry` del
 * QueryClient compartido.
 */
export function isTransientError(err: unknown): boolean {
  if (isAutoCancelError(err)) return false
  if (typeof err !== 'object' || err === null) return false
  const status = (err as { status?: unknown }).status
  if (typeof status !== 'number') return false
  return status === 0 || status >= 500
}

/**
 * Ejecuta `fn` y la reintenta mientras falle con un error transitorio.
 *
 * Existe porque no todas las lecturas pasan por React Query — el historial de
 * cardio se pide a pelo desde un efecto, así que sin esto un único 504 del
 * gateway pintaba el historial vacío (CALISTENIA-APP-S). El backoff replica el
 * del QueryClient para que la app se comporte igual venga de donde venga.
 *
 * El último error se propaga tal cual: quien llama sigue distinguiendo «falló»
 * de «no hay nada», que es justo lo que arregló #559.
 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  { retries = 2, delayMs = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000) }: {
    retries?: number
    delayMs?: (attempt: number) => number
  } = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (attempt === retries || !isTransientError(e)) throw e
      const wait = delayMs(attempt)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}
