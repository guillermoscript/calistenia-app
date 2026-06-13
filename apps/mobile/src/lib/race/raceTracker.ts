/**
 * Tracker GPS dedicado para races — port del raceTracker web con expo-location
 * en lugar de navigator.geolocation. No comparte estado con
 * CardioSessionContext. La duración se deriva del reloj sincronizado con el
 * servidor para que la barra de stats avance aunque el GPS se atasque.
 */
import * as Location from 'expo-location'
import { haversineDistance } from '@calistenia/core/lib/geo'
import { serverNow } from './raceClock'
import type { RaceGpsPoint } from '@calistenia/core/types/race'

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

export interface RaceTracker {
  start(): void
  stop(): void
  getGpsTrack(): RaceGpsPoint[]
  getStats(): RaceTrackerStats | null
  dispose(): void
}

const DEFAULT_MIN_ACCURACY_M = 30

export function createRaceTracker(opts: RaceTrackerOptions): RaceTracker {
  const minAccuracy = opts.minAccuracyM ?? DEFAULT_MIN_ACCURACY_M
  let subscription: Location.LocationSubscription | null = null
  let starting = false
  let tickInterval: ReturnType<typeof setInterval> | null = null
  let track: RaceGpsPoint[] = opts.initialGpsTrack ? [...opts.initialGpsTrack] : []
  let distanceKm = opts.initialDistanceKm ?? 0
  const lastFromTrack = track.length > 0 ? track[track.length - 1] : null
  let lastLat = lastFromTrack?.lat ?? 0
  let lastLng = lastFromTrack?.lng ?? 0
  let hasPosition = lastFromTrack != null
  let disposed = false

  const computeStats = (): RaceTrackerStats => {
    const durationSeconds = Math.max(0, (serverNow() - opts.startAtMs) / 1000)
    const avgPace = distanceKm > 0 && durationSeconds > 0
      ? (durationSeconds / 60) / distanceKm
      : 0
    return {
      distance_km: distanceKm,
      duration_seconds: durationSeconds,
      avg_pace: avgPace,
      last_lat: lastLat,
      last_lng: lastLng,
    }
  }

  const emit = () => {
    if (!hasPosition) return
    opts.onUpdate(computeStats())
  }

  const onPosition = (pos: Location.LocationObject) => {
    if (disposed) return
    if (pos.coords.accuracy == null || pos.coords.accuracy > minAccuracy) return
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    if (hasPosition) {
      const dM = haversineDistance(lastLat, lastLng, lat, lng)
      // Filtra jitter cero y teleports absurdos (mismo criterio que la web)
      if (dM > 0 && dM < 500) {
        distanceKm += dM / 1000
      }
    }
    lastLat = lat
    lastLng = lng
    hasPosition = true
    const tRel = Math.max(0, serverNow() - opts.startAtMs)
    track.push({ lat, lng, t: tRel })
    emit()
  }

  const start = () => {
    if (disposed || subscription || starting) return
    starting = true
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      onPosition,
    )
      .then((sub) => {
        starting = false
        if (disposed) { sub.remove(); return }
        subscription = sub
      })
      .catch((err) => {
        starting = false
        opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      })
    // La duración sigue avanzando cada segundo aunque no entren fixes
    if (!tickInterval) {
      tickInterval = setInterval(() => {
        if (hasPosition) emit()
      }, 1000)
    }
  }

  const stop = () => {
    subscription?.remove()
    subscription = null
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
  }

  return {
    start,
    stop,
    getGpsTrack: () => [...track],
    getStats: () => (hasPosition ? computeStats() : null),
    dispose() {
      disposed = true
      stop()
      track = []
    },
  }
}
