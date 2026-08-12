// Acceso a `race_routes`, la colección owner-only donde vive el recorrido GPS
// de cada participación en una carrera (#316).
//
// Gemela de `cardioRoutes.ts` (#299) y por el mismo motivo: `race_participants`
// es legible por cualquier cuenta autenticada porque la carrera en vivo
// necesita que cada corredor vea al resto, y una regla de PocketBase filtra
// registros, no campos. Mientras el recorrido viajó dentro de la fila estuvo al
// alcance de cualquiera —incluso sin llamar a la API a mano: el `update` que
// marca `finished` se difunde por realtime con el registro entero a todos los
// suscriptores de la carrera.
//
// Al vivir en su propia colección, el recorrido se rige por sus propias reglas
// (las cinco owner-only) y la carrera en vivo sigue igual de abierta sin
// arrastrarlo.
//
// Ojo al formato: aquí los puntos son `{lat, lng, t}` con `t` relativo al
// inicio de la carrera, no los `{lat, lng, timestamp}` absolutos de
// `cardio_routes`. La conversión la hace quien guarda la carrera como sesión de
// cardio.
//
// Todos los errores se tragan y devuelven vacío a propósito: quedarse sin
// recorrido es un degradado aceptable, romper la pantalla de resultados no lo
// es. Pedir el recorrido de una participación ajena devuelve 404 por regla de
// lista, que aquí es simplemente «no hay recorrido que dibujar».
import type { RaceGpsPoint } from '../types/race'
import { pb } from './pocketbase'

const COLLECTION = 'race_routes'

function toPoints(raw: unknown): RaceGpsPoint[] {
  return Array.isArray(raw) ? (raw as RaceGpsPoint[]) : []
}

/**
 * Guarda (o reemplaza) el recorrido de una participación. Sin puntos no crea
 * fila: quien abandona antes de moverse o corre sin permiso de ubicación no
 * necesita registro de recorrido.
 *
 * Idempotente por el índice único en `participant`: si ya hay fila la
 * actualiza, de modo que reintentar el fin de carrera no duplica ni deja
 * recorridos huérfanos.
 */
export async function saveRaceRoute(
  participantId: string,
  userId: string,
  points: RaceGpsPoint[],
): Promise<void> {
  if (!participantId || !userId || !points?.length) return
  try {
    const existing = await pb.collection(COLLECTION).getFirstListItem(
      pb.filter('participant = {:participantId}', { participantId }),
    )
    await pb.collection(COLLECTION).update(existing.id, { points })
  } catch {
    try {
      await pb.collection(COLLECTION).create({ participant: participantId, user: userId, points })
    } catch {
      // La participación ya está cerrada; perder el recorrido no debe impedir
      // que la carrera termine.
    }
  }
}

/**
 * Recorrido de una participación propia. Vacío si no hay, si es ajena o si
 * falla la red.
 */
export async function fetchRaceRoute(participantId: string): Promise<RaceGpsPoint[]> {
  if (!participantId) return []
  try {
    const rec = await pb.collection(COLLECTION).getFirstListItem(
      pb.filter('participant = {:participantId}', { participantId }),
    )
    return toPoints(rec.points)
  } catch {
    return []
  }
}
