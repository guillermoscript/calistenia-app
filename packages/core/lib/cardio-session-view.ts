// Mapeo de un registro de PocketBase (la view `public_cardio_sessions` o la
// tabla base) a la forma `CardioSession` que pintan las pantallas de detalle.

import type { CardioSession } from '../types'

/**
 * Registro crudo → `CardioSession`. La ruta no viaja en el registro (#299) y
 * llega de `cardio_routes`, así que `gps_points` sale vacío; `hr_avg`, `hr_max`
 * y `calories_actual` sólo existen en la tabla base (owner-only), no en la view.
 */
export function toCardioSession(raw: Record<string, unknown>): CardioSession {
  return {
    id: raw.id as string,
    user: raw.user as string | undefined,
    program: raw.program as string | undefined,
    program_day_key: raw.program_day_key as string | undefined,
    activity_type: (raw.activity_type as CardioSession['activity_type']) ?? 'running',
    gps_points: [],
    distance_km: (raw.distance_km as number) ?? 0,
    duration_seconds: (raw.duration_seconds as number) ?? 0,
    avg_pace: (raw.avg_pace as number) ?? 0,
    elevation_gain: (raw.elevation_gain as number) ?? 0,
    started_at: (raw.started_at as string) ?? '',
    finished_at: (raw.finished_at as string) ?? '',
    note: raw.note as string | undefined,
    calories_burned: raw.calories_burned as number | undefined,
    max_pace: raw.max_pace as number | undefined,
    avg_speed_kmh: raw.avg_speed_kmh as number | undefined,
    max_speed_kmh: raw.max_speed_kmh as number | undefined,
    splits: Array.isArray(raw.splits) ? (raw.splits as CardioSession['splits']) : [],
    hr_avg: raw.hr_avg as number | undefined,
    hr_max: raw.hr_max as number | undefined,
    calories_actual: raw.calories_actual as number | undefined,
  }
}
