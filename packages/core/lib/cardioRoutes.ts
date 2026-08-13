// Acceso a `cardio_routes`, la colección owner-only donde vive la ruta GPS
// de cada sesión de cardio (#299).
//
// `cardio_sessions` es legible por cualquier cuenta autenticada porque
// alimenta el muro y las carreras; una regla de PocketBase filtra registros,
// no campos, así que mientras la ruta viajó dentro del mismo registro estuvo
// al alcance de cualquiera que llamase a la API directamente. Al vivir en su
// propia colección, la ruta se rige por sus propias reglas (las cinco
// owner-only) y el muro sigue igual de abierto sin arrastrarla.
//
// El precio es una segunda consulta en las pantallas que dibujan mapas. Solo
// la pagan las vistas propias (historial y detalle); el muro nunca la hace.
//
// Todos los errores se tragan y devuelven vacío a propósito: quedarse sin
// mapa es un degradado aceptable, romper el historial no lo es. Pedir la ruta
// de una sesión ajena devuelve 404 por regla de lista, que aquí es
// simplemente «no hay ruta que dibujar».
import type { GpsPoint } from '../types'
import { pb } from './pocketbase'

const COLLECTION = 'cardio_routes'

// PocketBase resuelve el filtro en SQL; trocear evita un `filter` gigante
// cuando el historial pide muchas sesiones de golpe.
const CHUNK = 40

function toPoints(raw: unknown): GpsPoint[] {
  return Array.isArray(raw) ? (raw as GpsPoint[]) : []
}

/**
 * Parte un cuerpo de guardado en «lo que va a `cardio_sessions`» y «la ruta».
 *
 * Existe porque PocketBase ignora en silencio las claves que no son campos de
 * la colección: mandar `gps_points` en el create no daría error, la ruta
 * simplemente se evaporaría. Quitarla explícitamente deja el reparto a la
 * vista de quien lea el código.
 */
export function splitRoute(data: Record<string, unknown>): {
  record: Record<string, unknown>
  points: GpsPoint[]
} {
  const { gps_points: raw, ...record } = data
  return { record, points: toPoints(raw) }
}

/**
 * Guarda (o reemplaza) la ruta de una sesión. Sin puntos no crea fila: una
 * sesión de cinta o sin permiso de ubicación no necesita registro de ruta.
 *
 * Idempotente por el índice único en `session`: si ya hay fila la actualiza,
 * de modo que reintentar un guardado no duplica ni deja rutas huérfanas.
 */
export async function saveCardioRoute(
  sessionId: string,
  userId: string,
  points: GpsPoint[],
): Promise<void> {
  if (!sessionId || !userId || !points?.length) return
  try {
    const existing = await pb.collection(COLLECTION).getFirstListItem(
      pb.filter('session = {:sessionId}', { sessionId }),
    )
    await pb.collection(COLLECTION).update(existing.id, { points })
  } catch {
    try {
      await pb.collection(COLLECTION).create({ session: sessionId, user: userId, points })
    } catch {
      // La sesión ya está guardada; perder la ruta no debe romper el guardado.
    }
  }
}

/** Ruta de una sesión propia. Vacío si no hay, si es ajena o si falla la red. */
export async function fetchCardioRoute(sessionId: string): Promise<GpsPoint[]> {
  if (!sessionId) return []
  try {
    const rec = await pb.collection(COLLECTION).getFirstListItem(
      pb.filter('session = {:sessionId}', { sessionId }),
    )
    return toPoints(rec.points)
  } catch {
    return []
  }
}

/**
 * Rutas de varias sesiones en una consulta por tanda. Devuelve un mapa
 * sesión → puntos; las sesiones sin ruta simplemente no aparecen.
 */
export async function fetchCardioRoutes(sessionIds: string[]): Promise<Record<string, GpsPoint[]>> {
  const ids = sessionIds.filter(Boolean)
  if (!ids.length) return {}

  const out: Record<string, GpsPoint[]> = {}
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const filter = chunk
      .map((id) => pb.filter('session = {:id}', { id }))
      .join(' || ')
    try {
      const recs = await pb.collection(COLLECTION).getFullList({ filter })
      for (const rec of recs) out[rec.session as string] = toPoints(rec.points)
    } catch {
      // Tanda perdida: el resto de tandas sigue, esas sesiones quedan sin mapa.
    }
  }
  return out
}

/**
 * Vuelca las rutas sobre una lista de sesiones ya cargadas. Azúcar para el
 * historial, que necesita `gps_points` poblado en cada elemento.
 */
export async function hydrateCardioRoutes<T extends { id?: string; gps_points: GpsPoint[] }>(
  sessions: T[],
): Promise<T[]> {
  if (!sessions.length) return sessions
  const routes = await fetchCardioRoutes(sessions.map((s) => s.id || ''))
  for (const s of sessions) {
    if (s.id && routes[s.id]) s.gps_points = routes[s.id]
  }
  return sessions
}
