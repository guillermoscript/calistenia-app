// Constructor del registro de una sesión de cardio al terminar. Web y móvil
// armaban el mismo literal `CardioSession` (redondeos, velocidades, calorías,
// parciales, puerta de «demasiado corta»); vive aquí para que no diverjan.

import {
  calculateElevationGain, calculateSplitsAndDistance, calculateMaxPace,
  calculateMaxSpeed, calculateAvgSpeed,
} from './geo'
import { estimateCalories } from './calories'
import { isCardioSessionTooShort } from './cardioMinimum'
import type { GpsPoint, CardioActivityType, CardioSession } from '../types'

export interface BuildCardioSessionInput {
  activityType: CardioActivityType
  points: GpsPoint[]
  /** Epoch ms del inicio de la sesión. */
  startTime: number
  /** Epoch ms del cierre (inyectable para tests). */
  now: number
  /** Milisegundos acumulados en pausa. */
  pausedDuration: number
  note?: string
  userWeight?: number
  programId?: string | null
  programDayKey?: string | null
}

export interface BuiltCardioSession {
  session: CardioSession
  /** Duración neta (sin pausas) en segundos, para pintarla en el cronómetro. */
  durationSeconds: number
  /** Start/stop accidental (#562): no se guarda ni se encola. */
  tooShort: boolean
}

export function buildCardioSession(input: BuildCardioSessionInput): BuiltCardioSession {
  const { activityType, points, startTime, now, pausedDuration } = input
  const durationSeconds = Math.floor((now - startTime - pausedDuration) / 1000)
  const { splits, totalDistanceKm } = calculateSplitsAndDistance(points)
  const elevationGain = calculateElevationGain(points)
  const avgPace = durationSeconds > 0 && totalDistanceKm > 0
    ? (durationSeconds / 60) / totalDistanceKm
    : 0

  const session: CardioSession = {
    activity_type: activityType,
    gps_points: points,
    distance_km: Math.round(totalDistanceKm * 100) / 100,
    duration_seconds: durationSeconds,
    avg_pace: Math.round(avgPace * 100) / 100,
    elevation_gain: Math.round(elevationGain),
    started_at: new Date(startTime).toISOString(),
    finished_at: new Date(now).toISOString(),
    note: input.note,
    calories_burned: estimateCalories(activityType, durationSeconds, input.userWeight),
    max_pace: calculateMaxPace(points),
    avg_speed_kmh: calculateAvgSpeed(totalDistanceKm, durationSeconds),
    max_speed_kmh: calculateMaxSpeed(points),
    splits,
    program: input.programId || undefined,
    program_day_key: input.programDayKey || undefined,
  }

  return { session, durationSeconds, tooShort: isCardioSessionTooShort(session) }
}
