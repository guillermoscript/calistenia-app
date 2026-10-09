// Escrituras y lecturas de `cardio_sessions` en PocketBase, compartidas por web
// y móvil. La ruta GPS va aparte, a `cardio_routes` (owner-only, #299).

import { pb } from './pocketbase'
import { retryTransient } from './pocketbase-errors'
import { splitRoute, saveCardioRoute, hydrateCardioRoutes } from './cardioRoutes'
import { CARDIO_HISTORY_PAGE_SIZE } from './cardio-history'
import type { CardioActivityType, CardioSession, GpsPoint } from '../types'

/**
 * Crea la sesión y su ruta. Devuelve el id del registro. Lanza si PocketBase
 * rechaza la sesión o la ruta: quien llama decide si encolarla para reintento.
 */
export async function saveCardioSession(saveData: Record<string, unknown>): Promise<string> {
  const userId = saveData.user as string
  const { record, points } = splitRoute(saveData)
  const saved = await pb.collection('cardio_sessions').create(record)
  await saveCardioRoute(saved.id, userId, points)
  return saved.id
}

export async function deleteCardioSession(id: string): Promise<void> {
  await pb.collection('cardio_sessions').delete(id)
}

/** Parchea sólo la nota: la sesión ya se guardó al terminar. */
export async function updateCardioSessionNote(id: string, note: string): Promise<void> {
  await pb.collection('cardio_sessions').update(id, { note })
}

/**
 * Historial propio paginado. Sin try/catch a propósito: un fallo aquí NO es «no
 * hay sesiones» — debe llegar al caller, que distingue y reporta (#559).
 * Reintento ante 5xx/sin-respuesta: un solo 504 del gateway pintaba el
 * historial vacío (CALISTENIA-APP-S). Los 4xx no se reintentan.
 * El filtro por actividad va al servidor, no al array ya cargado: con la lista
 * paginada, filtrar en cliente diría «no hay ciclismo» cuando lo que falta es
 * pedir la siguiente página.
 */
export async function fetchCardioHistory(
  userId: string,
  limit = CARDIO_HISTORY_PAGE_SIZE,
  page = 1,
  activity?: CardioActivityType,
): Promise<CardioSession[]> {
  const filter = activity
    ? pb.filter('user = {:userId} && activity_type = {:activity}', { userId, activity })
    : pb.filter('user = {:userId}', { userId })
  const res = await retryTransient(() => pb.collection('cardio_sessions').getList(page, limit, {
    filter,
    sort: '-started_at',
    // Sin auto-cancelación: chocaba con el getFullList de stats (y el getList
    // del widget en móvil) sobre la misma colección (#559).
    requestKey: null,
  }))
  // Las rutas viven aparte (#299): segunda consulta, sólo en el historial
  // propio. El muro nunca las pide.
  return hydrateCardioRoutes(res.items.map((r: any) => ({
    id: r.id,
    user: r.user,
    activity_type: r.activity_type,
    gps_points: [] as GpsPoint[],
    distance_km: r.distance_km,
    duration_seconds: r.duration_seconds,
    avg_pace: r.avg_pace,
    elevation_gain: r.elevation_gain,
    started_at: r.started_at,
    finished_at: r.finished_at,
    note: r.note,
    calories_burned: r.calories_burned,
    max_pace: r.max_pace,
    avg_speed_kmh: r.avg_speed_kmh,
    max_speed_kmh: r.max_speed_kmh,
    splits: r.splits,
  })))
}
