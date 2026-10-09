// Lógica pura del tracker GPS de una carrera: qué fixes se aceptan, cómo suma
// distancia y cómo se derivan las estadísticas. Web (navigator.geolocation) y
// móvil (expo-location) sólo se ocupan de vigilar el GPS y llamar a esto.

import { haversineDistance } from '../geo'
import type { RaceGpsPoint } from '../../types/race'

export interface RaceTrackerStats {
  distance_km: number
  duration_seconds: number
  avg_pace: number
  last_lat: number
  last_lng: number
}

export interface RaceTrackerOptions {
  startAtMs: number
  minAccuracyM?: number
  initialDistanceKm?: number
  initialGpsTrack?: RaceGpsPoint[]
  onUpdate: (stats: RaceTrackerStats) => void
  onError?: (e: Error) => void
}

/** Contrato del tracker de carrera; cada app lo implementa con su GPS. */
export interface RaceTracker {
  start(): void
  stop(): void
  getGpsTrack(): RaceGpsPoint[]
  getStats(): RaceTrackerStats | null
  dispose(): void
}

/** Estado acumulado del recorrido. Inmutable: `acceptRaceFix` devuelve uno nuevo. */
export interface RaceTrackState {
  track: RaceGpsPoint[]
  distanceKm: number
  lastLat: number
  lastLng: number
  hasPosition: boolean
}

/** Fix mínimo que entiende el tracker, igual para web y móvil. */
export interface RaceFix {
  latitude: number
  longitude: number
  /** Precisión en metros; `null`/`undefined` = desconocida (se rechaza). */
  accuracy: number | null | undefined
}

export const DEFAULT_RACE_MIN_ACCURACY_M = 30

/** Un salto mayor es un teleport (cambio de antena, fix erróneo), no distancia recorrida. */
const MAX_FIX_JUMP_M = 500

export function createRaceTrackState(
  initialGpsTrack?: RaceGpsPoint[],
  initialDistanceKm = 0,
): RaceTrackState {
  const track = initialGpsTrack ? [...initialGpsTrack] : []
  const last = track.length > 0 ? track[track.length - 1] : null
  return {
    track,
    distanceKm: initialDistanceKm,
    lastLat: last?.lat ?? 0,
    lastLng: last?.lng ?? 0,
    hasPosition: last != null,
  }
}

/**
 * Procesa un fix. Devuelve el estado nuevo, o `null` si el fix se descarta
 * (precisión desconocida o peor que `minAccuracyM`).
 *
 * `relativeMs` = milisegundos desde la salida (reloj del servidor).
 */
export function acceptRaceFix(
  state: RaceTrackState,
  fix: RaceFix,
  relativeMs: number,
  minAccuracyM: number = DEFAULT_RACE_MIN_ACCURACY_M,
): RaceTrackState | null {
  if (fix.accuracy == null || fix.accuracy > minAccuracyM) return null
  let distanceKm = state.distanceKm
  if (state.hasPosition) {
    const dM = haversineDistance(state.lastLat, state.lastLng, fix.latitude, fix.longitude)
    // Filtra el jitter cero y los teleports absurdos.
    if (dM > 0 && dM < MAX_FIX_JUMP_M) distanceKm += dM / 1000
  }
  return {
    track: [...state.track, { lat: fix.latitude, lng: fix.longitude, t: Math.max(0, relativeMs) }],
    distanceKm,
    lastLat: fix.latitude,
    lastLng: fix.longitude,
    hasPosition: true,
  }
}

/** Estadísticas a partir del estado y el reloj (la duración avanza aunque el GPS esté mudo). */
export function computeRaceStats(state: RaceTrackState, durationSeconds: number): RaceTrackerStats {
  const duration = Math.max(0, durationSeconds)
  const avgPace = state.distanceKm > 0 && duration > 0
    ? (duration / 60) / state.distanceKm
    : 0
  return {
    distance_km: state.distanceKm,
    duration_seconds: duration,
    avg_pace: avgPace,
    last_lat: state.lastLat,
    last_lng: state.lastLng,
  }
}
