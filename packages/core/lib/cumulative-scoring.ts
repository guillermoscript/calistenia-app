/**
 * Puntuación acumulativa de retos (#352): funciones puras sobre filas ya
 * descargadas, para que el fold sea testeable en el entorno node de vitest.
 *
 * Semántica de ventana: la comparte con el leaderboard existente —
 * `localMidnightAsUTC(starts_at)` … `localMidnightAsUTC(ends_at + 1 día)`,
 * es decir, días de calendario en la zona horaria del ESPECTADOR con el día
 * final incluido. Cambiar a la zona del creador exigiría persistir una tz en
 * el reto; queda fuera de alcance y documentado en el issue.
 *
 * Métricas descartadas por ahora (deliberadamente): peso total levantado
 * (`weight_kg` es escaso), ventanas semanales móviles, cacheo de scores en
 * servidor y zona horaria del creador.
 */

import type { ChallengeMetric } from '../types'

export type CumulativeMetric = 'total_workouts' | 'total_exercise' | 'total_distance'

const CUMULATIVE_METRICS: readonly CumulativeMetric[] = ['total_workouts', 'total_exercise', 'total_distance']

export function isCumulativeMetric(metric: ChallengeMetric | string): metric is CumulativeMetric {
  return (CUMULATIVE_METRICS as readonly string[]).includes(metric)
}

// ─── Parser de reps para TOTALES ─────────────────────────────────────────────
//
// `sets_log.reps` es texto libre. `parseRepsForPR` coge el número MAYOR (bien
// para un PR, mal para un total). Aquí cada fila se interpreta así:
//   - segmentos separados por coma o «+» se SUMAN:      "8,10,12" → 30
//   - «NxM» dentro de un segmento multiplica:           "3x10"    → 30
//   - «A-B» es un rango de UNA serie → cuenta el mayor: "8-12"    → 12
//   - sin números ("max", "AMRAP", "") → 0
export function parseRepsTotal(reps: string | null | undefined): number {
  if (!reps) return 0
  let total = 0
  for (const segment of String(reps).split(/[,+]/)) {
    const mult = segment.match(/(\d+)\s*[xX×]\s*(\d+)/)
    if (mult) {
      total += Number(mult[1]) * Number(mult[2])
      continue
    }
    const range = segment.match(/(\d+)\s*[-–]\s*(\d+)/)
    if (range) {
      total += Math.max(Number(range[1]), Number(range[2]))
      continue
    }
    const nums = segment.match(/\d+/g)
    if (nums) total += nums.reduce((acc, n) => acc + Number(n), 0)
  }
  return total
}

// ─── total_exercise ──────────────────────────────────────────────────────────

export interface SetRowForTotal {
  /** id del registro de `sets_log`: la única identidad fiable de una serie. */
  id?: string
  reps?: string | null
  /** Ya no se usan para deduplicar (ver nota abajo); se mantienen por contexto. */
  workout_key?: string
  logged_at?: string
}

/**
 * Suma de reps (o segundos si el ejercicio es de temporizador) de las filas de
 * `sets_log` de UN ejercicio, deduplicadas por **id de registro**: cada fila
 * almacenada cuenta exactamente una vez, así que refrescar es idempotente y
 * editar/borrar se refleja solo.
 *
 * NO se puede deduplicar por (workout_key, logged_at, reps): al registrar un
 * entreno pasado, `logSet` escribe `logged_at = localDateForPB(date)`, es decir
 * MEDIANOCHE idéntica para todas las series de ese día, así que un 3x10
 * legítimo quedaba idéntico en los tres campos y se contaba como una sola serie
 * (30 reps → 10). Verificado en el leaderboard: marcaba 40 donde el usuario
 * había hecho 60.
 *
 * Contrapartida asumida: si alguna vez se llegaran a escribir DOS filas para la
 * misma serie real (reintento/replay), cada una tiene su propio id y sumarían
 * dos veces. Se prefiere ese riesgo —hipotético— a subcontar entrenos reales,
 * que es un fallo observado y visible en la clasificación.
 */
export function sumExerciseTotal(rows: SetRowForTotal[]): number {
  const seen = new Set<string>()
  let total = 0
  rows.forEach((row, index) => {
    // Sin id no hay identidad que deduplicar: la fila cuenta tal cual.
    const key = row.id ?? `__idx_${index}`
    if (seen.has(key)) return
    seen.add(key)
    total += parseRepsTotal(row.reps)
  })
  return total
}

// ─── total_workouts ──────────────────────────────────────────────────────────

export interface SessionRowForTotal {
  workout_key?: string
  completed_at?: string
}

export interface CardioRowForTotal {
  id?: string
  started_at?: string
}

/**
 * Entrenos completados = sesiones de calistenia + sesiones de cardio dentro de
 * la ventana. Las sesiones se deduplican por (workout_key, día local) — un
 * registro doble del mismo entreno el mismo día no infla el total, y dos
 * entrenos distintos el mismo día sí cuentan ambos. El cardio se deduplica por
 * id de registro.
 */
export function countWorkouts(
  sessions: SessionRowForTotal[],
  cardio: CardioRowForTotal[],
  utcToLocalDay: (utc: string) => string,
): number {
  const sessionKeys = new Set<string>()
  for (const s of sessions) {
    if (!s.completed_at) continue
    sessionKeys.add(`${s.workout_key ?? ''}|${utcToLocalDay(s.completed_at)}`)
  }
  const cardioIds = new Set<string>()
  for (const c of cardio) {
    if (c.id) cardioIds.add(c.id)
  }
  return sessionKeys.size + cardioIds.size
}

// ─── total_distance ──────────────────────────────────────────────────────────

export interface DistanceRowForTotal {
  id?: string
  distance_km?: number
}

/** Suma de km de cardio, deduplicada por id y redondeada a 2 decimales. */
export function sumDistanceKm(rows: DistanceRowForTotal[]): number {
  const seen = new Set<string>()
  let total = 0
  for (const row of rows) {
    if (row.id) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
    }
    total += row.distance_km || 0
  }
  return Math.round(total * 100) / 100
}

// ─── Orden determinista del leaderboard ──────────────────────────────────────

export interface RankableEntry {
  value: number
  /** `challenge_participants.created` — quien se unió antes gana el empate. */
  joinedAt?: string
  userId: string
}

/**
 * Valor desc → inscripción más antigua → userId. El orden anterior era
 * `b.value - a.value` a secas: los empates quedaban al azar del fetch. Con
 * esto, refrescos repetidos producen siempre el mismo ranking (para TODAS las
 * métricas, no solo las acumulativas).
 */
export function compareLeaderboardEntries(a: RankableEntry, b: RankableEntry): number {
  if (b.value !== a.value) return b.value - a.value
  const aj = a.joinedAt ?? ''
  const bj = b.joinedAt ?? ''
  if (aj !== bj) return aj < bj ? -1 : 1
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
}
