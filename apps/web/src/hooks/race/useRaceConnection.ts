import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { loadRace } from '../../lib/race/raceApi'
import { subscribeRace } from '../../lib/race/raceRealtime'
import { RaceNotFoundError } from '../../lib/race/errors'
import type { Race, RaceParticipant } from '@calistenia/core/types/race'
import type { RaceErrorKind } from './useRaceErrors'

export type RacePhase =
  | 'loading'
  | 'not_found'
  | 'lobby'
  | 'countdown'
  | 'racing'
  | 'finished'
  | 'cancelled'

/** La fase es una vista del `status` del servidor, nunca un estado propio del cliente. */
export function computePhase(race: Race | null): RacePhase {
  if (!race) return 'loading'
  switch (race.status) {
    case 'waiting':   return 'lobby'
    case 'countdown': return 'countdown'
    case 'active':    return 'racing'
    case 'finished':  return 'finished'
    case 'cancelled': return 'cancelled'
    default:          return 'loading'
  }
}

interface Options {
  raceId: string
  onError: (kind: RaceErrorKind, message: string) => void
}

export interface RaceConnection {
  race: Race | null
  participants: RaceParticipant[]
  phase: RacePhase
  /** Última carrera conocida, para los callbacks de larga vida del tracker. */
  raceRef: MutableRefObject<Race | null>
}

/** Carga inicial de la carrera y suscripción realtime a sus cambios. */
export function useRaceConnection({ raceId, onError }: Options): RaceConnection {
  const [race, setRace] = useState<Race | null>(null)
  const [participants, setParticipants] = useState<RaceParticipant[]>([])
  const [phase, setPhase] = useState<RacePhase>('loading')

  const raceRef = useRef<Race | null>(null)
  useEffect(() => { raceRef.current = race }, [race])

  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false
    setPhase('loading')

    loadRace(raceId)
      .then(data => {
        if (cancelled) return
        setRace(data.race)
        setParticipants(data.participants)
        setPhase(computePhase(data.race))
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof RaceNotFoundError) {
          setPhase('not_found')
        } else {
          onErrorRef.current('load', err?.message || 'Load error')
        }
      })

    const unsub = subscribeRace(raceId, {
      onRace: updated => {
        if (cancelled) return
        setRace(updated)
        setPhase(computePhase(updated))
      },
      onParticipants: next => {
        if (cancelled) return
        setParticipants(next)
      },
      onError: err => {
        if (cancelled) return
        onErrorRef.current('realtime', err.message)
      },
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [raceId])

  return { race, participants, phase, raceRef }
}
