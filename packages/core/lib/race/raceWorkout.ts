// «Guardar como entrenamiento» de los resultados de una carrera: el registro de
// `cardio_sessions` que se crea con el recorrido propio. Web y móvil lo armaban
// por su cuenta y la web lo guardaba siempre como `running` y sin calorías.

import { estimateCalories } from '../calories'
import { buildCardioSaveData } from '../cardio-finish'
import type { Race, RaceParticipant, RaceGpsPoint } from '../../types/race'
import type { CardioSession } from '../../types'

/** Sesión de cardio equivalente a lo corrido en la carrera. */
export function buildRaceCardioSession(
  race: Race,
  me: RaceParticipant,
  track: RaceGpsPoint[],
): CardioSession {
  const startMs = race.starts_at ? new Date(race.starts_at).getTime() : Date.now()
  return {
    activity_type: race.activity_type,
    gps_points: track.map((p) => ({ lat: p.lat, lng: p.lng, timestamp: startMs + p.t })),
    distance_km: me.distance_km,
    duration_seconds: me.duration_seconds,
    avg_pace: me.avg_pace,
    elevation_gain: 0,
    started_at: race.starts_at || new Date(startMs).toISOString(),
    finished_at: me.finished_at || race.finished_at || new Date().toISOString(),
    note: `Race: ${race.name}`,
    calories_burned: estimateCalories(race.activity_type, me.duration_seconds),
  }
}

/** Registro listo para `cardio_sessions` (sesión + dueño; la ruta se separa al guardar). */
export function buildRaceWorkoutRecord(
  race: Race,
  me: RaceParticipant,
  track: RaceGpsPoint[],
  userId: string,
): Record<string, unknown> {
  return buildCardioSaveData(userId, buildRaceCardioSession(race, me, track))
}
