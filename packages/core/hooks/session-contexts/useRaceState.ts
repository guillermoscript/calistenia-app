/**
 * Composición de una carrera multijugador, compartida por web y móvil (#482).
 *
 * Antes esto vivía duplicado en `apps/web/src/contexts/RaceContext.tsx` y
 * `apps/mobile/src/contexts/RaceContext.tsx` (338 y 335 L, ~89 % idénticas).
 *
 * Los cuatro hooks de `hooks/race/` (conexión realtime, errores, fin de carrera
 * y tracker) viven ya en core y se llaman aquí directamente. Lo único de
 * plataforma que queda es el GPS del tracker (`navigator.geolocation` en web,
 * `expo-location` en móvil), que entra por `options.createTracker`; el
 * snapshot local usa el almacenamiento de `platform.ts`. El wake lock de
 * pantalla (`useWakeLock` / `useKeepAwakeWhile`) se queda en el provider de
 * cada app: no comparte estado con el resto de este hook, sólo lee su valor de
 * retorno.
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
import { clearRaceSnapshot } from '../../lib/race/raceSnapshot'
import type { RaceTracker, RaceTrackerOptions, RaceTrackerStats } from '../../lib/race/raceTrack'
import { useRaceErrors, type RaceErrorKind, type RaceErrorState } from '../race/useRaceErrors'
import { useRaceConnection, type RacePhase } from '../race/useRaceConnection'
import { useRaceFinish } from '../race/useRaceFinish'
import { useRaceTracker } from '../race/useRaceTracker'

export type { RaceErrorKind, RaceErrorState, RacePhase, RaceTracker, RaceTrackerStats }

export interface UseRaceStateOptions {
  raceId: string
  userId: string | null
  /**
   * Props extra para cada evento de analytics. El móvil manda
   * `{ platform: 'mobile' }`; la web no manda nada.
   */
  analyticsProps?: Record<string, unknown>
  /**
   * Crea el tracker con el GPS de la plataforma. Debe ser una función estable
   * (de módulo): cambiarla reiniciaría el tracker.
   */
  createTracker: (opts: RaceTrackerOptions) => RaceTracker
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
  createTracker,
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
    createTracker,
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
      // Un solo envío. Hasta el #636 había además un `track('race_joined')`
      // legacy al lado de esta llamada: mismo nombre de evento, mismo clic, dos
      // envíos, así que TODO conteo de carreras unidas estaba x2 desde el #356.
      // La legacy no llevaba nada que no esté ya aquí.
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
      // Igual que en `join`: el `track('race_started')` legacy que iba aquí
      // duplicaba el evento (#636). Sus dos propiedades exclusivas ya viajan en
      // la canónica — `participants` como `participant_count`, y `mode` igual.
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
      track('race_cancelled', { race_id: raceId })
    } catch (err) {
      setError('push', (err as Error).message)
    }
  }, [raceId, setError, track])

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
    // UN corredor terminó: uno por participante. El cierre de la CARRERA es
    // `race_completed`, que emite solo el creador una vez. Se llamaba
    // `race_finished`, nombre que ningún informe podía distinguir del otro
    // (#636); renombrarlo es una ruptura deliberada y documentada.
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.raceParticipantFinished, {
      surface: 'race', source: 'race_active', race_id: raceId, result: 'finished',
      distance_km: stats?.distance_km ?? 0,
      duration_seconds: Math.floor(stats?.duration_seconds ?? 0),
    })
  }, [raceId, finishSelf, endRace, setError])

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
