import { useCallback, useRef, type MutableRefObject } from 'react'
import { finishParticipant, finishRace as apiFinishRace, markDnf } from '../../lib/race/raceApi'
import type { RaceTracker, RaceTrackerStats } from '../../lib/race/raceTracker'
import type { Race, RaceParticipant } from '@calistenia/core/types/race'
import type { RaceErrorKind } from './useRaceErrors'

/**
 * Por qué termina la participación. Es lo único que distingue a los tres
 * caminos que antes construían cada uno su propio payload de
 * `finishParticipant`:
 *
 * - `time_deadline` — el reloj llegó al objetivo en modo tiempo. No depende del
 *   GPS, así que es el único que puede tener que cerrar sin stats ni tracker.
 * - `target_reached` — el tracker vio alcanzado el objetivo de distancia/tiempo.
 * - `manual` — el usuario pulsó "terminar". Es el único que puede acabar en DNF
 *   (si paró antes de llegar) y el único que además cierra la carrera entera.
 */
export type FinishReason = 'time_deadline' | 'target_reached' | 'manual'

interface Options {
  raceId: string
  getRace: () => Race | null
  getMe: () => RaceParticipant | null
  trackerRef: MutableRefObject<RaceTracker | null>
  latestStatsRef: MutableRefObject<RaceTrackerStats | null>
  onError: (kind: RaceErrorKind, message: string) => void
}

export interface RaceFinish {
  /** Este cliente ya congeló su participación. */
  hasFinishedSelf: () => boolean
  /** Congela al participante local. Idempotente: sólo el primer disparo cuenta. */
  finishSelf: (reason: FinishReason) => Promise<void>
  /**
   * Cierra la carrera para todos. Una sola petición por cliente, reintentable.
   * Devuelve el error si la petición falló, o null si quedó registrada (ya sea
   * porque acaba de hacerse o porque otro disparador se adelantó).
   */
  endRace: () => Promise<Error | null>
  /** Olvida los guards al salir de la fase de carrera. */
  reset: () => void
}

/**
 * Único punto de fin de carrera.
 *
 * Antes había seis: el payload de `finishParticipant` se construía en el
 * deadline de modo tiempo, en el `onUpdate` del tracker y en la acción manual,
 * y `apiFinishRace` se llamaba además desde el auto-finish (todos terminaron) y
 * desde el watchdog de `ends_at`. Cada copia decidía por su cuenta qué stats
 * mandar, y el auto-finish llegaba a repetir la petición en cada actualización
 * de participantes.
 */
export function useRaceFinish({
  raceId, getRace, getMe, trackerRef, latestStatsRef, onError,
}: Options): RaceFinish {
  const finishedSelfRef = useRef(false)
  const endRequestedRef = useRef(false)

  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const hasFinishedSelf = useCallback(() => finishedSelfRef.current, [])

  const finishSelf = useCallback(async (reason: FinishReason) => {
    if (finishedSelfRef.current) return

    const me = getMe()
    if (!me) return
    const race = getRace()
    const tracker = trackerRef.current
    const stats = latestStatsRef.current

    // El deadline de tiempo es de reloj puro: tiene que poder cerrar aunque el
    // GPS no haya emitido nunca (en interior, o con el permiso denegado), así
    // que cae a los últimos valores que el servidor ya conoce del participante.
    const finalStats: RaceTrackerStats | null = stats ?? (
      reason === 'time_deadline'
        ? {
            distance_km: me.distance_km ?? 0,
            duration_seconds: race?.target_duration_seconds ?? 0,
            avg_pace: me.avg_pace ?? 0,
            last_lat: me.last_lat ?? 0,
            last_lng: me.last_lng ?? 0,
          }
        : null
    )
    if (!finalStats) return
    // Los otros dos caminos nacen del propio tracker: sin él no hay nada que
    // congelar todavía.
    if (reason !== 'time_deadline' && !tracker) return

    finishedSelfRef.current = true

    // En modo tiempo el objetivo se cumple por reloj, no por lo que haya
    // medido el GPS: se reporta la duración objetivo exacta.
    const durationSeconds = reason === 'time_deadline' && race
      ? race.target_duration_seconds
      : finalStats.duration_seconds

    // Sólo el fin manual puede quedarse corto; los automáticos se disparan
    // justamente porque el objetivo ya se alcanzó.
    const reachedTarget = reason !== 'manual' || !race || (
      race.mode === 'distance'
        ? finalStats.distance_km >= race.target_distance_km
        : finalStats.duration_seconds >= race.target_duration_seconds
    )

    // Los caminos automáticos paran el tracker en el acto; en el manual lo
    // libera el cleanup de la fase cuando la carrera pasa a 'finished'.
    if (reason !== 'manual') tracker?.stop()

    try {
      if (reachedTarget) {
        await finishParticipant(me.id, {
          distance_km: finalStats.distance_km,
          duration_seconds: durationSeconds,
          avg_pace: finalStats.avg_pace,
          last_lat: finalStats.last_lat,
          last_lng: finalStats.last_lng,
          gps_track: tracker ? tracker.getGpsTrack() : [],
        })
      } else {
        await markDnf(me.id)
      }
    } catch (err) {
      onErrorRef.current('push', (err as Error)?.message || 'Finish failed')
    }
  }, [getRace, getMe, trackerRef, latestStatsRef])

  const endRace = useCallback(async (): Promise<Error | null> => {
    if (endRequestedRef.current) return null
    endRequestedRef.current = true
    try {
      // La updateRule de PocketBase hace la escritura idempotente: si otro
      // cliente llegó antes, esto simplemente falla y da igual.
      await apiFinishRace(raceId)
      return null
    } catch (err) {
      // Un fallo aquí también puede ser de red. Se libera el guard para que el
      // watchdog de `ends_at` pueda reintentarlo en su siguiente ciclo en vez
      // de dejar la carrera abierta para siempre.
      endRequestedRef.current = false
      return err as Error
    }
  }, [raceId])

  const reset = useCallback(() => {
    finishedSelfRef.current = false
  }, [])

  return { hasFinishedSelf, finishSelf, endRace, reset }
}
