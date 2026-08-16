import { storage } from '../platform'
import { enqueue, getQueue, newClientId } from './offlineQueue'

/**
 * Cola offline de las sesiones de circuito (#464).
 *
 * Antes de #464 los circuitos tenían su propia cola casera en
 * `calistenia_circuit_unsaved`, duplicada literalmente en web y mobile, que
 * reintentaba el `create` ante CUALQUIER error y sin `client_id`: un `status: 0`
 * («no hubo respuesta», no «no llegó») acababa creando una sesión duplicada.
 * Ahora los circuitos van por `offlineQueue` como las series y las sesiones.
 *
 * Este módulo es lo poco que es específico de circuitos, y vive en core para que
 * los dos contexts (`apps/web` y `apps/mobile`, clones 1:1) compartan una sola
 * implementación en vez de volver a divergir.
 */

export const CIRCUIT_COLLECTION = 'circuit_sessions'

/** Clave de la cola casera anterior a #464. Solo se lee, para trasvasarla. */
export const LEGACY_CIRCUIT_UNSAVED_KEY = 'calistenia_circuit_unsaved'

/** Cuántas sesiones de circuito siguen pendientes de subir. */
export function countQueuedCircuitSessions(): number {
  return getQueue().filter(a => a.collection === CIRCUIT_COLLECTION).length
}

/**
 * Trasvasa a la cola común lo que quedara en la cola casera de una versión
 * anterior, y borra la clave vieja. Sin esto, quien actualice con circuitos
 * pendientes los perdería: nadie volvería a leer esa clave.
 *
 * A cada sesión trasvasada se le pone un `client_id` si no lo trae (las de la
 * cola vieja nunca lo tienen), que es justo lo que impide que el reintento
 * duplique una sesión que en realidad sí había llegado al servidor.
 *
 * Devuelve cuántas migró.
 */
export function migrateLegacyCircuitQueue(): number {
  let queued: Record<string, unknown>[]
  try {
    const raw = storage.getItem(LEGACY_CIRCUIT_UNSAVED_KEY)
    if (!raw) return 0
    queued = JSON.parse(raw)
    if (!Array.isArray(queued)) queued = []
  } catch {
    // Contenido corrupto: no hay nada recuperable, pero sí hay que limpiar la
    // clave para no reintentar el parseo en cada arranque.
    storage.removeItem(LEGACY_CIRCUIT_UNSAVED_KEY)
    return 0
  }

  for (const session of queued) {
    if (!session || typeof session !== 'object') continue
    enqueue({
      collection: CIRCUIT_COLLECTION,
      action: 'create',
      data: { ...session, client_id: session.client_id || newClientId() },
    })
  }

  storage.removeItem(LEGACY_CIRCUIT_UNSAVED_KEY)
  return queued.length
}
