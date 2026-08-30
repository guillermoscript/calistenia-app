/**
 * Paginación del historial de cardio.
 *
 * La lista completa (`/cardio/history` en móvil) carga de 20 en 20, así que
 * necesita fusionar la página nueva con lo que ya tenía. Vive aquí y no en la
 * pantalla porque es lo único de este flujo que se puede testear: `apps/mobile`
 * no renderiza componentes en los tests.
 */
import type { CardioSession } from '../types'

/** Cuántas sesiones pide cada página del historial. */
export const CARDIO_HISTORY_PAGE_SIZE = 20

/**
 * Añade `next` al final de `prev` descartando las sesiones que ya estaban.
 *
 * El descarte por `id` no es paranoia: entre dos peticiones puede guardarse una
 * sesión nueva, y entonces la página 2 vuelve a traer el último registro de la
 * página 1 desplazado. Sin esto, React avisaría de claves duplicadas y la fila
 * repetida se pintaría dos veces.
 *
 * Las sesiones sin `id` (cola offline sin sincronizar) no se pueden deduplicar,
 * así que pasan tal cual.
 */
export function mergeCardioPages(prev: CardioSession[], next: CardioSession[]): CardioSession[] {
  const seen = new Set(prev.map((s) => s.id).filter(Boolean))
  const added = next.filter((s) => {
    if (!s.id) return true
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
  return added.length === 0 ? prev : [...prev, ...added]
}

/**
 * ¿Quedan más páginas por pedir?
 *
 * Una página incompleta significa que el servidor ya no tiene más. Se mira el
 * tamaño de la respuesta cruda, NO el de la lista fusionada: si la página venía
 * entera pero era toda duplicados, seguir pidiendo es lo correcto.
 */
export function hasMoreCardioPages(pageSize: number, received: number): boolean {
  return received >= pageSize
}
