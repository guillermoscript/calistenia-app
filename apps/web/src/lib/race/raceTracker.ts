import {
  acceptRaceFix, computeRaceStats, createRaceTrackState, DEFAULT_RACE_MIN_ACCURACY_M,
  type RaceTracker, type RaceTrackerOptions, type RaceTrackerStats,
} from '@calistenia/core/lib/race/raceTrack'
import { serverNow } from './raceClock'

export type { RaceTracker, RaceTrackerOptions, RaceTrackerStats }

/**
 * Tracker GPS dedicado para carreras (navigator.geolocation). No comparte
 * estado con CardioSessionContext. La duración sale del reloj sincronizado con
 * el servidor para que la barra de stats avance aunque el GPS se atasque. Qué
 * fixes se aceptan y cómo se suma la distancia vive en core (`raceTrack`).
 */
export function createRaceTracker(opts: RaceTrackerOptions): RaceTracker {
  const minAccuracy = opts.minAccuracyM ?? DEFAULT_RACE_MIN_ACCURACY_M
  let watchId: number | null = null
  let tickInterval: ReturnType<typeof setInterval> | null = null
  let trackState = createRaceTrackState(opts.initialGpsTrack, opts.initialDistanceKm)
  let disposed = false

  const computeStats = (): RaceTrackerStats =>
    computeRaceStats(trackState, (serverNow() - opts.startAtMs) / 1000)

  const emit = () => {
    if (!trackState.hasPosition) return
    opts.onUpdate(computeStats())
  }

  const onPosition = (pos: GeolocationPosition) => {
    if (disposed) return
    const next = acceptRaceFix(
      trackState,
      pos.coords,
      serverNow() - opts.startAtMs,
      minAccuracy,
    )
    if (!next) return
    trackState = next
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
        if (trackState.hasPosition) emit()
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
    getGpsTrack: () => [...trackState.track],
    getStats: () => (trackState.hasPosition ? computeStats() : null),
    dispose() {
      disposed = true
      stop()
      trackState = createRaceTrackState()
    },
  }
}
