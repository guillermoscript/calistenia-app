import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { updateProgress, type ProgressUpdate } from '../../lib/race/raceApi'
import { createRaceTracker, type RaceTracker, type RaceTrackerStats } from '../../lib/race/raceTracker'
import { loadRaceSnapshot, saveRaceSnapshot } from '../../lib/race/raceSnapshot'
import { RaceAuthError } from '../../lib/race/errors'
import type { Race } from '@calistenia/core/types/race'
import type { RaceErrorKind } from './useRaceErrors'

const PUSH_INTERVAL_MS = 3000
const PUSH_RETRY_BACKOFF_MS = [1000, 3000, 9000]

interface Options {
  raceId: string
  /** La carrera está corriendo y este cliente participa. */
  active: boolean
  meId: string | null
  startsAt: string | null
  trackerRef: MutableRefObject<RaceTracker | null>
  latestStatsRef: MutableRefObject<RaceTrackerStats | null>
  getRace: () => Race | null
  hasFinishedSelf: () => boolean
  /** El tracker alcanzó el objetivo de la carrera. */
  onTargetReached: () => void
  /** Se abandona la fase de carrera: hay que olvidar los guards de fin. */
  onStop: () => void
  onError: (kind: RaceErrorKind, message: string) => void
  /** Entró un fix: limpiar un banner de GPS ya obsoleto. */
  onGpsFix: () => void
}

/**
 * Ciclo de vida del tracker de la carrera: GPS, empuje periódico del progreso
 * al servidor con backoff, y snapshot local para sobrevivir a una recarga.
 */
export function useRaceTracker({
  raceId, active, meId, startsAt, trackerRef, latestStatsRef,
  getRace, hasFinishedSelf, onTargetReached, onStop, onError, onGpsFix,
}: Options): { myStats: RaceTrackerStats | null } {
  const [myStats, setMyStats] = useState<RaceTrackerStats | null>(null)

  useEffect(() => { latestStatsRef.current = myStats }, [myStats, latestStatsRef])

  // Los callbacks se releen por ref: el tracker vive toda la carrera y no debe
  // recrearse porque el provider haya re-renderizado (lo hace a 2 Hz).
  const cbRef = useRef({ getRace, hasFinishedSelf, onTargetReached, onStop, onError, onGpsFix })
  cbRef.current = { getRace, hasFinishedSelf, onTargetReached, onStop, onError, onGpsFix }

  const pushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)

  useEffect(() => {
    if (!active || !meId || !startsAt) return

    const startAtMs = new Date(startsAt).getTime()

    // Rehidratar desde el snapshot si esto es una recarga a mitad de carrera.
    const snap = loadRaceSnapshot(raceId)
    const rehydrate = snap && snap.participantId === meId ? snap : null

    const tracker = createRaceTracker({
      startAtMs,
      initialDistanceKm: rehydrate?.distanceKm,
      initialGpsTrack: rehydrate?.gpsTrack,
      onUpdate: (stats) => {
        setMyStats(stats)
        cbRef.current.onGpsFix()

        // La decisión de "objetivo alcanzado" vive aquí, que es donde están los
        // datos; quién y cómo cierra es cosa de useRaceFinish.
        const race = cbRef.current.getRace()
        if (!race || cbRef.current.hasFinishedSelf()) return
        const reached =
          (race.mode === 'distance' && race.target_distance_km > 0 && stats.distance_km >= race.target_distance_km) ||
          (race.mode === 'time' && race.target_duration_seconds > 0 && stats.duration_seconds >= race.target_duration_seconds)
        if (reached) cbRef.current.onTargetReached()
      },
      onError: (err) => cbRef.current.onError('gps', err.message),
    })
    trackerRef.current = tracker
    tracker.start()

    pushTimerRef.current = setInterval(async () => {
      const stats = latestStatsRef.current
      if (!stats || cbRef.current.hasFinishedSelf()) return

      // Snapshot barato en cada tick de empuje.
      saveRaceSnapshot({
        raceId,
        participantId: meId,
        startAtMs,
        distanceKm: stats.distance_km,
        gpsTrack: tracker.getGpsTrack(),
      })

      const payload: ProgressUpdate = {
        distance_km: stats.distance_km,
        duration_seconds: stats.duration_seconds,
        avg_pace: stats.avg_pace,
        last_lat: stats.last_lat,
        last_lng: stats.last_lng,
      }
      try {
        await updateProgress(meId, payload)
        retryCountRef.current = 0
      } catch (err) {
        if (err instanceof RaceAuthError) {
          // Cadena cruda: este contexto no traduce; lo hace el consumidor.
          cbRef.current.onError('auth', 'race.sessionExpired')
          return
        }
        const count = retryCountRef.current + 1
        retryCountRef.current = count
        const backoff = PUSH_RETRY_BACKOFF_MS[Math.min(count - 1, PUSH_RETRY_BACKOFF_MS.length - 1)]
        setTimeout(() => {
          updateProgress(meId, payload).catch(() => {})
        }, backoff)
        if (count >= 3) {
          cbRef.current.onError('push', (err as Error)?.message || 'Push failed repeatedly')
        }
      }
    }, PUSH_INTERVAL_MS)

    return () => {
      tracker.stop()
      tracker.dispose()
      trackerRef.current = null
      if (pushTimerRef.current) clearInterval(pushTimerRef.current)
      pushTimerRef.current = null
      setMyStats(null)
      cbRef.current.onStop()
    }
  }, [active, meId, startsAt, raceId, trackerRef, latestStatsRef])

  // Cleanup duro al desmontar: el efecto de arriba ya libera en su camino
  // normal, pero si el provider muere a mitad de carrera hay que soltar el GPS.
  useEffect(() => {
    return () => {
      trackerRef.current?.dispose()
      trackerRef.current = null
      if (pushTimerRef.current) clearInterval(pushTimerRef.current)
    }
  }, [trackerRef])

  return { myStats }
}
