import { kalmanUpdate, haversineDistance, type KalmanState } from './geo'
import type { GpsPoint, CardioActivityType } from '../types'

// ── Precision tuning (idéntico a la web y al CardioSessionContext) ──────────
export const MAX_ACCURACY_M = 20
export const MIN_POINT_DISTANCE_M = 3
const GAP_THRESHOLD_S = 30
const JITTER_MAX_SPEED_MPS = 14
const MIN_SPEED_FOR_PACE_MPS = 0.5
const DEFAULT_MAX_SPEED_MPS = 6

// Velocidad máxima plausible (m/s) por actividad, para validar reentradas tras
// un gap de GPS en background.
const MAX_SPEED_BY_ACTIVITY: Record<CardioActivityType, number> = {
  running: 6,
  walking: 3,
  cycling: 14,
}

/** Estado mutable mínimo que el pipeline necesita entre fixes. */
export interface CardioFixState {
  /** Último punto aceptado (para distancia/jitter/gap). null al inicio. */
  lastPoint: GpsPoint | null
  /** Estado del filtro de Kalman; null fuerza reinicio. */
  kalman: KalmanState | null
  /** Distancia acumulada en km. */
  distanceKm: number
  /** Último km cuyo split ya se cerró. */
  lastSplitKm: number
  /** Timestamp (ms) en que empezó el split en curso. */
  lastSplitTime: number
  /** Timestamp (ms) de inicio de la sesión (fallback de split). */
  startTime: number
  /** Velocidad máxima registrada (km/h). */
  maxSpeedKmh: number
}

/** Fix de GPS de entrada (misma forma que CardioFix de cardio-tracker). */
export interface CardioFixInput {
  latitude: number
  longitude: number
  altitude: number | null
  accuracy: number | null
  speed: number | null
  timestamp: number
}

export interface CardioFixResult {
  /** Nuevo estado a aplicar (siempre presente, salvo fixes ignorados). */
  nextState: CardioFixState
  /** El punto suavizado a añadir, o null si el fix se rechazó. */
  point: GpsPoint | null
  /** El fix produjo un punto válido que debe añadirse a la traza. */
  accepted: boolean
  /** Accuracy del fix (para que el caller actualice su indicador de GPS). */
  accuracy: number | null
  /** Distancia acumulada tras este fix (km). */
  distanceKm: number
  /** Split en curso, o null cuando no hay punto previo. */
  split: { km: number; elapsed: number } | null
  /** Se cruzó un km nuevo: el caller debe disparar la háptica. */
  splitCompleted: boolean
  /** Ritmo actual (min/km); 0 si speed insuficiente. */
  paceMinKm: number
  /** Velocidad actual (km/h); 0 si speed insuficiente. */
  speedKmh: number
}

/**
 * Pipeline puro por-fix (mismo que el CardioSessionContext de mobile y la web):
 * reinicio de Kalman en gaps, filtro de jitter, plausibilidad por velocidad
 * máxima de actividad, detección de splits de km y acumulación de distancia.
 * Sin React, sin efectos: el caller aplica nextState y dispara setState/háptica
 * a partir de los flags devueltos.
 *
 * Devuelve `accepted: false` y `point: null` cuando el fix se ignora/rechaza;
 * en ese caso `nextState` puede igualar el estado de entrada (no se añade nada).
 */
export function processCardioFix(
  state: CardioFixState,
  fix: CardioFixInput,
  activityType: CardioActivityType,
): CardioFixResult {
  const rejected = (next: CardioFixState): CardioFixResult => ({
    nextState: next,
    point: null,
    accepted: false,
    accuracy: fix.accuracy,
    distanceKm: next.distanceKm,
    split: null,
    splitCompleted: false,
    paceMinKm: 0,
    speedKmh: 0,
  })

  const { latitude, longitude, altitude, speed, accuracy } = fix

  // Sin accuracy no se puede confiar en el fix.
  if (accuracy == null) return rejected(state)
  // Fix demasiado impreciso. (El caller ya puede mostrar accuracy desde el
  // resultado: rejected() la propaga.)
  if (accuracy > MAX_ACCURACY_M) return rejected(state)

  const prevPt = state.lastPoint
  const timeDiff = prevPt ? (fix.timestamp - prevPt.timestamp) / 1000 : 0
  const isGap = prevPt !== null && timeDiff > GAP_THRESHOLD_S

  // Reset del Kalman en gaps — la varianza predicha sería enorme y sesgaría el
  // suavizado hacia la posición pre-gap.
  const kalmanIn = isGap ? null : state.kalman
  const smoothed = kalmanUpdate(kalmanIn, latitude, longitude, accuracy, fix.timestamp)

  const point: GpsPoint = {
    lat: smoothed.lat,
    lng: smoothed.lng,
    alt: altitude ?? undefined,
    timestamp: fix.timestamp,
    speed: speed ?? undefined,
    accuracy,
  }

  let distanceKm = state.distanceKm
  let lastSplitKm = state.lastSplitKm
  let lastSplitTime = state.lastSplitTime
  let split: { km: number; elapsed: number } | null = null
  let splitCompleted = false

  if (prevPt) {
    const d = haversineDistance(prevPt.lat, prevPt.lng, point.lat, point.lng)

    if (isGap) {
      const limit = MAX_SPEED_BY_ACTIVITY[activityType] ?? DEFAULT_MAX_SPEED_MPS
      const plausible = timeDiff > 0 && d / timeDiff <= limit
      point.gap = true
      if (plausible) distanceKm = state.distanceKm + d / 1000
    } else {
      // Filtro de jitter — parado, el GPS rebota dentro del radio de accuracy.
      // El fix se rechaza: NO se añade el punto y el Kalman NO avanza.
      if (d < MIN_POINT_DISTANCE_M) return rejected(state)
      if (timeDiff > 0 && d / timeDiff > JITTER_MAX_SPEED_MPS) return rejected(state)
      distanceKm = state.distanceKm + d / 1000
    }

    const currentKm = Math.floor(distanceKm)
    if (currentKm > lastSplitKm) {
      lastSplitKm = currentKm
      lastSplitTime = point.timestamp
      splitCompleted = true
    }
    const splitKm = currentKm + 1
    const splitStartTime = lastSplitTime || state.startTime
    const splitElapsed = Math.floor((point.timestamp - splitStartTime) / 1000)
    split = { km: splitKm, elapsed: splitElapsed }
  }

  let paceMinKm = 0
  let speedKmh = 0
  let maxSpeedKmh = state.maxSpeedKmh
  if (speed != null && speed > MIN_SPEED_FOR_PACE_MPS) {
    paceMinKm = 1000 / 60 / speed
    speedKmh = Math.round(speed * 3.6 * 10) / 10
    if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh
  }

  const nextState: CardioFixState = {
    lastPoint: point,
    kalman: smoothed,
    distanceKm,
    lastSplitKm,
    lastSplitTime,
    startTime: state.startTime,
    maxSpeedKmh,
  }

  return {
    nextState,
    point,
    accepted: true,
    accuracy,
    distanceKm,
    split,
    splitCompleted,
    paceMinKm,
    speedKmh,
  }
}
