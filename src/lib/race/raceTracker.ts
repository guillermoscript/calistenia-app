import { haversineDistance } from '../geo'
import { serverNow } from './raceClock'
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

export interface RaceTracker {
  start(): void
  stop(): void
  getGpsTrack(): RaceGpsPoint[]
  getStats(): RaceTrackerStats | null
  dispose(): void
}

const DEFAULT_MIN_ACCURACY_M = 30

/**
 * Dedicated GPS tracker for races. Does not share state with
 * CardioSessionContext. Tick-derives duration from the server-synced clock
 * so the stats bar keeps moving even when GPS is stuck or paused.
 */
export function createRaceTracker(opts: RaceTrackerOptions): RaceTracker {
  const minAccuracy = opts.minAccuracyM ?? DEFAULT_MIN_ACCURACY_M
  let watchId: number | null = null
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

  const onPosition = (pos: GeolocationPosition) => {
    if (disposed) return
    if (pos.coords.accuracy > minAccuracy) return
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    if (hasPosition) {
      const dM = haversineDistance(lastLat, lastLng, lat, lng)
      // Filter zero jitter and absurd teleport (> 100m in < 1s)
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

  const onPositionError = (err: GeolocationPositionError) => {
    opts.onError?.(new Error(`GPS error: ${err.message}`))
  }

  const start = () => {
    if (disposed) return
    if (watchId !== null) return
    if (!navigator.geolocation) {
      opts.onError?.(new Error('Geolocation not supported'))
      return
    }
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    })
    // Keep ticking duration every second so UI stats update even with no GPS
    if (!tickInterval) {
      tickInterval = setInterval(() => {
        if (hasPosition) emit()
      }, 1000)
    }
  }

  const stop = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    if (tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
  }

  return {
    start,
    stop,
    getGpsTrack: () => [...track],
    getStats: () => hasPosition ? computeStats() : null,
    dispose() {
      disposed = true
      stop()
      track = []
    },
  }
}
