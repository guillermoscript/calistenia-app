import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuthState } from './AuthContext'
import {
  joinRace as apiJoinRace,
  markReady as apiMarkReady,
  startCountdown as apiStartCountdown,
  activateRace,
  cancelRace as apiCancelRace,
  markDnf,
  leaveRace,
} from '../lib/race/raceApi'
import { measureOffset, serverNow, msUntil } from '../lib/race/raceClock'
import type { RaceTracker, RaceTrackerStats } from '../lib/race/raceTracker'
import { clearRaceSnapshot } from '../lib/race/raceSnapshot'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { Race, RaceParticipant } from '@calistenia/core/types/race'

import { useWakeLock } from '../hooks/useWakeLock'
import { useRaceConnection, type RacePhase } from '../hooks/race/useRaceConnection'
import { useRaceErrors, type RaceErrorKind, type RaceErrorState } from '../hooks/race/useRaceErrors'
import { useRaceFinish } from '../hooks/race/useRaceFinish'
import { useRaceTracker } from '../hooks/race/useRaceTracker'

// ── Types ───────────────────────────────────────────────────────────────────

export type { RacePhase, RaceErrorKind, RaceErrorState }

interface RaceContextValue {
  phase: RacePhase
  race: Race | null
  participants: RaceParticipant[]
  me: RaceParticipant | null
  isCreator: boolean
  hasJoined: boolean
  myStats: RaceTrackerStats | null
  lastError: RaceErrorState | null
  clearError: () => void
  actions: {
    join: (displayName: string) => Promise<void>
    markReady: () => Promise<void>
    startCountdown: () => Promise<void>
    cancelRace: () => Promise<void>
    finishRace: () => Promise<void>
    leave: () => Promise<void>
  }
}

const RaceContext = createContext<RaceContextValue | null>(null)

// ── Provider ────────────────────────────────────────────────────────────────

interface RaceProviderProps {
  raceId: string
  children: ReactNode
}

/**
 * Hub de una carrera. Sólo compone: la conexión realtime, el tracker de GPS y
 * el cierre de carrera viven en `hooks/race/`. Aquí quedan los valores
 * derivados, los disparadores de fin y las acciones de usuario.
 */
export function RaceProvider({ raceId, children }: RaceProviderProps) {
  const { userId } = useAuthState()

  const errors = useRaceErrors()
  const { lastError, setError, clearError, clearErrorKind } = errors

  const { race, participants, phase, raceRef } = useRaceConnection({ raceId, onError: setError })

  // ── Valores derivados ─────────────────────────────────────────────────────
  const me = useMemo<RaceParticipant | null>(
    () => participants.find(p => p.user === userId) ?? null,
    [participants, userId],
  )
  const isCreator = !!(race && userId && race.creator === userId)
  const hasJoined = !!me

  // Primitivas estables para las dependencias de los efectos: `race` y `me` son
  // objetos nuevos en cada push de participantes (cada 3 s), y usarlos como
  // dependencia reiniciaría intervalos y timers todo el rato.
  const meId = me?.id ?? null
  const startsAt = race?.starts_at ?? null
  const endsAt = race?.ends_at ?? null
  const raceMode = race?.mode
  const targetDurationSeconds = race?.target_duration_seconds ?? 0

  const meRef = useRef<RaceParticipant | null>(null)
  useEffect(() => { meRef.current = me }, [me])

  // Compartidos entre el tracker (que los llena) y el cierre (que los lee).
  const trackerRef = useRef<RaceTracker | null>(null)
  const latestStatsRef = useRef<RaceTrackerStats | null>(null)

  const getRace = useCallback(() => raceRef.current, [raceRef])
  const getMe = useCallback(() => meRef.current, [])

  // Único punto de fin de carrera: los cinco disparadores de abajo pasan por
  // `finishSelf` o `endRace`, nunca por `finishParticipant`/`finishRace` a pelo.
  const finish = useRaceFinish({ raceId, getRace, getMe, trackerRef, latestStatsRef, onError: setError })

  const { myStats } = useRaceTracker({
    raceId,
    active: phase === 'racing' && !!meId,
    meId,
    startsAt,
    trackerRef,
    latestStatsRef,
    getRace,
    hasFinishedSelf: finish.hasFinishedSelf,
    onTargetReached: useCallback(() => { void finish.finishSelf('target_reached') }, [finish.finishSelf]),
    onStop: finish.reset,
    onError: setError,
    onGpsFix: useCallback(() => clearErrorKind('gps'), [clearErrorKind]),
  })

  useWakeLock(phase === 'racing' && !!meId && !!startsAt)

  // ── Disparadores de fin ───────────────────────────────────────────────────

  // Deadline duro en modo tiempo: reloj puro cada 500 ms, para que cierre
  // aunque el GPS esté atascado o el usuario esté en interior.
  useEffect(() => {
    if (phase !== 'racing' || !meId || !startsAt) return
    if (raceMode !== 'time' || targetDurationSeconds <= 0) return
    const startAtMs = new Date(startsAt).getTime()
    const targetMs = targetDurationSeconds * 1000

    const check = () => {
      if (serverNow() - startAtMs < targetMs) return
      void finish.finishSelf('time_deadline')
    }
    check()
    const id = setInterval(check, 500)
    return () => clearInterval(id)
  }, [phase, meId, startsAt, raceMode, targetDurationSeconds, finish.finishSelf])

  // Todos han terminado o abandonado: cualquier cliente puede cerrar la carrera.
  useEffect(() => {
    if (phase !== 'racing' || participants.length === 0) return
    if (!participants.every(p => p.status === 'finished' || p.status === 'dnf')) return
    void finish.endRace()
  }, [phase, participants, finish.endRace])

  // Watchdog: cierra las carreras que pasaron de `ends_at`.
  useEffect(() => {
    if (phase !== 'racing' || !endsAt) return
    const check = () => { if (msUntil(endsAt) <= 0) void finish.endRace() }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [phase, endsAt, finish.endRace])

  // ── Ciclo de vida de la carrera ───────────────────────────────────────────

  // El snapshot se descarta en cualquier fase terminal, no sólo para quien pulsó.
  useEffect(() => {
    if (phase === 'finished' || phase === 'cancelled') clearRaceSnapshot()
  }, [phase])

  // Un solo `race_completed` por carrera, no uno por cliente: cada participante
  // ejecuta finishRaceAction en su dispositivo, y el auto-finish y el watchdog
  // de ends_at cierran la carrera sin que nadie pulse nada. Por eso el evento
  // cuelga de la fase 'finished' y lo emite el cliente del creador.
  const raceCompletedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'finished' || !isCreator || raceCompletedRef.current) return
    raceCompletedRef.current = true
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.raceCompleted, {
      surface: 'race', source: 'race_results', race_id: raceId,
      participant_count: participants.length, result: 'completed',
    })
  }, [phase, isCreator, raceId, participants.length])

  useEffect(() => {
    measureOffset().catch(() => {})
  }, [])

  // Fin de la cuenta atrás → activar la carrera. Dispara cualquier cliente: la
  // updateRule sólo admite 'countdown'→otro, así que gana el primero y los
  // demás se comen un 400 que se ignora.
  useEffect(() => {
    if (phase !== 'countdown' || !startsAt) return
    const id = setTimeout(() => {
      activateRace(raceId).catch(() => { /* ya activa, ignorar */ })
    }, Math.max(0, msUntil(startsAt)))
    return () => clearTimeout(id)
  }, [phase, startsAt, raceId])

  // ── Acciones ──────────────────────────────────────────────────────────────
  const join = useCallback(async (displayName: string) => {
    try {
      await apiJoinRace(raceId, displayName)
      op.track('race_joined', { race_id: raceId })
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.raceJoined, {
        surface: 'race', source: 'race_lobby', race_id: raceId,
        participant_count: participants.length + 1, result: 'joined',
      })
    } catch (err) {
      setError('push', (err as Error).message)
      throw err
    }
  }, [raceId, participants.length, setError])

  const markReadyAction = useCallback(async () => {
    if (!meId) return
    try {
      await apiMarkReady(meId)
    } catch (err) {
      setError('push', (err as Error).message)
    }
  }, [meId, setError])

  const startCountdownAction = useCallback(async () => {
    try {
      await apiStartCountdown(raceId)
      op.track('race_started', {
        race_id: raceId,
        participants: participants.length,
        mode: raceMode,
      })
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.raceStarted, {
        surface: 'race', source: 'race_lobby', race_id: raceId,
        participant_count: participants.length, result: 'started', mode: raceMode,
      })
    } catch (err) {
      setError('push', (err as Error).message)
      throw err
    }
  }, [raceId, participants.length, raceMode, setError])

  const cancelRaceAction = useCallback(async () => {
    try {
      await apiCancelRace(raceId)
      clearRaceSnapshot()
      op.track('race_cancelled', { race_id: raceId })
    } catch (err) {
      setError('push', (err as Error).message)
    }
  }, [raceId, setError])

  const finishRaceAction = useCallback(async () => {
    // Congelarse primero con las stats finales y la traza; después cerrar la
    // carrera. Ambos pasos son idempotentes y viven en useRaceFinish.
    await finish.finishSelf('manual')
    const err = await finish.endRace()
    if (err) {
      setError('push', err.message)
      return
    }
    clearRaceSnapshot()
    const stats = latestStatsRef.current
    op.track('race_finished', {
      race_id: raceId,
      my_distance_km: stats?.distance_km ?? 0,
      my_duration_seconds: Math.floor(stats?.duration_seconds ?? 0),
    })
  }, [raceId, finish.finishSelf, finish.endRace, setError])

  const leaveAction = useCallback(async () => {
    const current = meRef.current
    if (!current) return
    try {
      // DNF voluntario si ya corre; borrar la fila si sigue en el lobby.
      if (current.status === 'joined' || current.status === 'ready') {
        await leaveRace(current.id)
      } else {
        await markDnf(current.id)
      }
    } catch (err) {
      setError('push', (err as Error).message)
    }
  }, [setError])

  // Memoizado: durante una carrera activa el provider re-renderiza hasta a 2 Hz
  // (myStats cada 500 ms, participants cada 3 s). Sin memo, cada render recrea
  // este objeto y re-renderiza a todos los consumidores de useRaceContext().
  const value = useMemo<RaceContextValue>(
    () => ({
      phase, race, participants, me, isCreator, hasJoined, myStats, lastError, clearError,
      actions: {
        join,
        markReady: markReadyAction,
        startCountdown: startCountdownAction,
        cancelRace: cancelRaceAction,
        finishRace: finishRaceAction,
        leave: leaveAction,
      },
    }),
    [
      phase, race, participants, me, isCreator, hasJoined, myStats, lastError, clearError,
      join, markReadyAction, startCountdownAction, cancelRaceAction, finishRaceAction, leaveAction,
    ],
  )

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceContextValue {
  const ctx = useContext(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used within RaceProvider')
  return ctx
}

/**
 * Cuenta atrás sincronizada con el servidor: segundos hasta el inicio.
 * Derivada de `race.starts_at` más el offset de raceClock.
 */
export function useRaceCountdown(): { secondsLeft: number; isCounting: boolean } {
  const { race, phase } = useRaceContext()
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (phase !== 'countdown' || !race?.starts_at) {
      setSecondsLeft(0)
      return
    }
    const tick = () => {
      const ms = msUntil(race.starts_at)
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)))
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [phase, race?.starts_at])

  return { secondsLeft, isCounting: phase === 'countdown' }
}
