/**
 * Composición de una carrera multijugador, compartida por web y móvil (#482).
 *
 * Antes esto vivía duplicado en `apps/web/src/contexts/RaceContext.tsx` y
 * `apps/mobile/src/contexts/RaceContext.tsx` (338 y 335 L, ~89 % idénticas).
 *
 * A diferencia de `useCircuitSessionState` (#482 también, pero con TODAS sus
 * dependencias ya en core salvo storage/lifecycle), la carrera cuelga de
 * cuatro hooks de `hooks/race/` — conexión realtime, errores, fin de carrera y
 * tracker — que a su vez tocan GPS (`navigator.geolocation` en web,
 * `expo-location` en móvil) y snapshot local (`sessionStorage` vs
 * `AsyncStorage`). Esos dos puntos SÍ son de plataforma de verdad y no tienen
 * facade en `platform.ts` todavía (moverlos es aparte del alcance de este
 * hook); los cuatro hooks en sí son, por lo demás, idénticos en las dos apps.
 *
 * Solución: los cuatro hooks se INYECTAN por `options.hooks`, con el mismo
 * nombre y firma en las dos apps (ver el comment que dejó el port móvil en su
 * día). El provider de cada app los importa sin tocarlos y aquí se llaman
 * igual que si vivieran en este archivo — son funciones, y las reglas de
 * hooks sólo exigen que se llamen siempre en el mismo orden, cosa que aquí se
 * cumple. `clearRaceSnapshot` se inyecta suelto por la misma razón (guarda en
 * sessionStorage/AsyncStorage). El wake lock de pantalla (`useWakeLock` /
 * `useKeepAwakeWhile`) se queda en el provider de cada app: tampoco hay
 * facade para eso y no comparte estado con el resto de este hook, sólo lee su
 * valor de retorno.
 *
 * Como con Circuit: **el estado y la lógica bajan a core; el `createContext`
 * se queda en la app** para no depender de que Metro y Vite resuelvan una
 * única copia de React.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { Race, RaceParticipant, RaceGpsPoint } from '../../types/race'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '../../lib/analytics'
import {
  joinRace as apiJoinRace,
  markReady as apiMarkReady,
  startCountdown as apiStartCountdown,
  activateRace,
  cancelRace as apiCancelRace,
  markDnf,
  leaveRace,
} from '../../lib/race/raceApi'
import { measureOffset, serverNow, msUntil } from '../../lib/serverClock'

// ── Tipos que antes vivían en `hooks/race/*` de cada app ───────────────────
//
// Idénticos byte a byte en las dos copias (aparte de imports). Se redeclaran
// aquí en vez de importarse porque core no puede depender de `apps/*`; al ser
// interfaces/uniones estructurales, TypeScript los acepta sin problema cuando
// el provider inyecta los hooks reales de su app.

export type RaceErrorKind = 'auth' | 'push' | 'gps' | 'realtime' | 'load'

export interface RaceErrorState {
  kind: RaceErrorKind
  message: string
}

export interface RaceErrors {
  lastError: RaceErrorState | null
  setError: (kind: RaceErrorKind, message: string) => void
  clearError: () => void
  clearErrorKind: (kind: RaceErrorKind) => void
}

export type RacePhase =
  | 'loading'
  | 'not_found'
  | 'lobby'
  | 'countdown'
  | 'racing'
  | 'finished'
  | 'cancelled'

export interface RaceConnection {
  race: Race | null
  participants: RaceParticipant[]
  phase: RacePhase
  /** Última carrera conocida, para los callbacks de larga vida del tracker. */
  raceRef: MutableRefObject<Race | null>
}

export interface RaceTrackerStats {
  distance_km: number
  duration_seconds: number
  avg_pace: number
  last_lat: number
  last_lng: number
}

export interface RaceTracker {
  start(): void
  stop(): void
  getGpsTrack(): RaceGpsPoint[]
  getStats(): RaceTrackerStats | null
  dispose(): void
}

export type FinishReason = 'time_deadline' | 'target_reached' | 'manual'

export interface RaceFinish {
  hasFinishedSelf: () => boolean
  finishSelf: (reason: FinishReason) => Promise<void>
  endRace: () => Promise<Error | null>
  reset: () => void
}

export interface RaceTrackerResult {
  myStats: RaceTrackerStats | null
}

/** Los cuatro hooks de `hooks/race/` que cada app inyecta sin modificarlos. */
export interface RaceHooks {
  useRaceErrors: () => RaceErrors
  useRaceConnection: (opts: {
    raceId: string
    onError: (kind: RaceErrorKind, message: string) => void
  }) => RaceConnection
  useRaceFinish: (opts: {
    raceId: string
    getRace: () => Race | null
    getMe: () => RaceParticipant | null
    trackerRef: MutableRefObject<RaceTracker | null>
    latestStatsRef: MutableRefObject<RaceTrackerStats | null>
    onError: (kind: RaceErrorKind, message: string) => void
  }) => RaceFinish
  useRaceTracker: (opts: {
    raceId: string
    active: boolean
    meId: string | null
    startsAt: string | null
    trackerRef: MutableRefObject<RaceTracker | null>
    latestStatsRef: MutableRefObject<RaceTrackerStats | null>
    getRace: () => Race | null
    hasFinishedSelf: () => boolean
    onTargetReached: () => void
    onStop: () => void
    onError: (kind: RaceErrorKind, message: string) => void
    onGpsFix: () => void
  }) => RaceTrackerResult
}

export interface UseRaceStateOptions {
  raceId: string
  userId: string | null
  /**
   * Props extra para cada evento de analytics. El móvil manda
   * `{ platform: 'mobile' }`; la web no manda nada.
   */
  analyticsProps?: Record<string, unknown>
  /** Borra el snapshot local de carrera en curso (sessionStorage/AsyncStorage). */
  clearRaceSnapshot: () => void
  hooks: RaceHooks
}

export interface RaceState {
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

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRaceState({
  raceId,
  userId,
  analyticsProps,
  clearRaceSnapshot,
  hooks: { useRaceErrors, useRaceConnection, useRaceFinish, useRaceTracker },
}: UseRaceStateOptions): RaceState {
  const analyticsPropsRef = useRef(analyticsProps)
  analyticsPropsRef.current = analyticsProps

  const track = useCallback((name: string, props: Record<string, unknown>) => {
    op.track(name, { ...props, ...analyticsPropsRef.current })
  }, [])

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
  const {
    hasFinishedSelf, finishSelf, endRace, reset: resetFinish,
  } = useRaceFinish({ raceId, getRace, getMe, trackerRef, latestStatsRef, onError: setError })

  const { myStats } = useRaceTracker({
    raceId,
    active: phase === 'racing' && !!meId,
    meId,
    startsAt,
    trackerRef,
    latestStatsRef,
    getRace,
    hasFinishedSelf,
    onTargetReached: useCallback(() => { void finishSelf('target_reached') }, [finishSelf]),
    onStop: resetFinish,
    onError: setError,
    onGpsFix: useCallback(() => clearErrorKind('gps'), [clearErrorKind]),
  })

  // El wake lock / keep-awake NO vive aquí: cada provider lo llama con el
  // valor de retorno de este hook (`phase`, `race?.starts_at`, `me?.id`), y no
  // hay facade de eso en `platform.ts`.

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
      void finishSelf('time_deadline')
    }
    check()
    const id = setInterval(check, 500)
    return () => clearInterval(id)
  }, [phase, meId, startsAt, raceMode, targetDurationSeconds, finishSelf])

  // Todos han terminado o abandonado: cualquier cliente puede cerrar la carrera.
  useEffect(() => {
    if (phase !== 'racing' || participants.length === 0) return
    if (!participants.every(p => p.status === 'finished' || p.status === 'dnf')) return
    void endRace()
  }, [phase, participants, endRace])

  // Watchdog: cierra las carreras que pasaron de `ends_at`.
  useEffect(() => {
    if (phase !== 'racing' || !endsAt) return
    const check = () => { if (msUntil(endsAt) <= 0) void endRace() }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [phase, endsAt, endRace])

  // ── Ciclo de vida de la carrera ───────────────────────────────────────────

  // El snapshot se descarta en cualquier fase terminal, no sólo para quien pulsó.
  useEffect(() => {
    if (phase === 'finished' || phase === 'cancelled') clearRaceSnapshot()
  }, [phase, clearRaceSnapshot])

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
      track('race_joined', { race_id: raceId })
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.raceJoined, {
        surface: 'race', source: 'race_lobby', race_id: raceId,
        participant_count: participants.length + 1, result: 'joined',
      })
    } catch (err) {
      setError('push', (err as Error).message)
      throw err
    }
  }, [raceId, participants.length, setError, track])

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
      track('race_started', {
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
  }, [raceId, participants.length, raceMode, setError, track])

  const cancelRaceAction = useCallback(async () => {
    try {
      await apiCancelRace(raceId)
      clearRaceSnapshot()
      track('race_cancelled', { race_id: raceId })
    } catch (err) {
      setError('push', (err as Error).message)
    }
  }, [raceId, setError, track, clearRaceSnapshot])

  const finishRaceAction = useCallback(async () => {
    // Congelarse primero con las stats finales y la traza; después cerrar la
    // carrera. Ambos pasos son idempotentes y viven en useRaceFinish.
    await finishSelf('manual')
    const err = await endRace()
    if (err) {
      setError('push', err.message)
      return
    }
    clearRaceSnapshot()
    const stats = latestStatsRef.current
    track('race_finished', {
      race_id: raceId,
      my_distance_km: stats?.distance_km ?? 0,
      my_duration_seconds: Math.floor(stats?.duration_seconds ?? 0),
    })
  }, [raceId, finishSelf, endRace, setError, track, clearRaceSnapshot])

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

  // Memoizado: durante una carrera activa el hook re-renderiza hasta a 2 Hz
  // (myStats cada 500 ms, participants cada 3 s). Sin memo, cada render recrea
  // este objeto y re-renderiza a todos los consumidores de useRaceContext().
  return useMemo<RaceState>(
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
}

/**
 * Cuenta atrás sincronizada con el servidor: segundos hasta el inicio.
 * Derivada de `race.starts_at` más el offset de serverClock. La versión de
 * cada app sigue siendo un hook aparte porque lee `useRaceContext()` (el
 * `createContext` no sale de la app); aquí sólo vive el intervalo de 100 ms.
 */
export function useRaceCountdownState(
  phase: RacePhase,
  startsAt: string | null | undefined,
): { secondsLeft: number; isCounting: boolean } {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (phase !== 'countdown' || !startsAt) {
      setSecondsLeft(0)
      return
    }
    const tick = () => {
      const ms = msUntil(startsAt)
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)))
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [phase, startsAt])

  return { secondsLeft, isCounting: phase === 'countdown' }
}
