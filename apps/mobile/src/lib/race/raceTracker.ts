/**
 * Tracker GPS dedicado para races (expo-location). No comparte estado con
 * CardioSessionContext. La duración se deriva del reloj sincronizado con el
 * servidor para que la barra de stats avance aunque el GPS se atasque. Qué
 * fixes se aceptan y cómo se suma la distancia vive en core (`raceTrack`),
 * compartido con la web.
 */
import * as Location from 'expo-location'
import {
  acceptRaceFix, computeRaceStats, createRaceTrackState, DEFAULT_RACE_MIN_ACCURACY_M,
  type RaceTracker, type RaceTrackerOptions, type RaceTrackerStats,
} from '@calistenia/core/lib/race/raceTrack'
import { serverNow } from './raceClock'

export type { RaceTracker, RaceTrackerOptions, RaceTrackerStats }

export function createRaceTracker(opts: RaceTrackerOptions): RaceTracker {
  const minAccuracy = opts.minAccuracyM ?? DEFAULT_RACE_MIN_ACCURACY_M
  let subscription: Location.LocationSubscription | null = null
  let starting = false
  let tickInterval: ReturnType<typeof setInterval> | null = null
  let trackState = createRaceTrackState(opts.initialGpsTrack, opts.initialDistanceKm)
  let disposed = false

  const computeStats = (): RaceTrackerStats =>
    computeRaceStats(trackState, (serverNow() - opts.startAtMs) / 1000)

  const emit = () => {
    if (!trackState.hasPosition) return
    opts.onUpdate(computeStats())
  }

  const onPosition = (pos: Location.LocationObject) => {
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
        if (trackState.hasPosition) emit()
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
    getGpsTrack: () => [...trackState.track],
    getStats: () => (trackState.hasPosition ? computeStats() : null),
    dispose() {
      disposed = true
      stop()
      trackState = createRaceTrackState()
    },
  }
}
