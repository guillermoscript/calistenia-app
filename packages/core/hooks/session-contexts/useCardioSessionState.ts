/**
 * Máquina de estados de la sesión de cardio, compartida por web y móvil.
 *
 * Antes vivía duplicada en `apps/{web,mobile}/src/contexts/CardioSessionContext`
 * (~90 % idénticas). Lo que de verdad es de plataforma entra INYECTADO, igual que
 * en `useRaceState`:
 *  - `useTracking`: el hook de GPS de la app (`watchPosition` en web, expo-location
 *    + Foreground Service en móvil). Es un hook y no un valor porque los dos se
 *    suscriben a eventos propios; debe ser siempre el mismo entre renders.
 *  - `useKeepAwake`: pantalla encendida mientras la sesión vive (wake lock /
 *    expo-keep-awake). También un hook constante.
 *  - `events`: ganchos de plataforma (háptica, notificación en vivo, widget).
 *    Se leen por ref, así que pueden ser lambdas nuevas en cada render.
 *
 * Como con Circuit y Race: el estado y la lógica bajan a core; el
 * `createContext` se queda en la app.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { lifecycle } from '../../platform'
import { qk } from '../../lib/query-keys'
import { invalidateAfterWorkout } from '../../lib/workout-cache'
import { buildCardioSession } from '../../lib/cardio-finish'
import {
  buildCardioSaveData, saveCardioSession, deleteCardioSession,
  updateCardioSessionNote, fetchCardioHistory,
} from '../../lib/cardio-session-api'
import { CARDIO_HISTORY_PAGE_SIZE } from '../../lib/cardio-history'
import type { CardioFixInput } from '../../lib/cardio-fix'
import type { GpsPoint, CardioActivityType, CardioSession } from '../../types'
import { useCardioMetrics, type AcceptedFix } from '../cardio/useCardioMetrics'
import { useCardioPersistence, type PersistedCardioSession } from '../cardio/useCardioPersistence'
import { useCardioTimer } from '../cardio/useCardioTimer'
import { useUnsavedCardioQueue } from '../cardio/useUnsavedCardioQueue'
import { useLatest } from '../useLatest'

export type SessionState = 'idle' | 'tracking' | 'paused' | 'finished'

// ── Contratos de plataforma ──────────────────────────────────────────────────

/** Lo que el hook de GPS de la app avisa al estado. */
export interface CardioTrackingHandlers {
  onFix: (fix: CardioFixInput) => void
  /** No hay GPS disponible (navegador sin geolocalización, servicio caído…). */
  onUnavailable: () => void
  /** Error del watch con texto ya legible (sólo web). */
  onError?: (message: string) => void
}

/** Lo que el hook de GPS de la app devuelve al estado. */
export interface CardioTrackingControls {
  start: () => void
  stop: () => void
  /** Relanza el GPS: lo usa el health-check cuando enmudece. */
  restart: () => void
  /** Pide permiso antes de empezar. Si falta, no hay paso de permiso (web). */
  requestPermission?: () => Promise<boolean>
  /** Un único fix best-effort al pasar a segundo plano (web). */
  captureOnce?: (onFix: (fix: CardioFixInput) => void) => void
}

/** Ganchos de plataforma. Todos opcionales. */
export interface CardioSessionEvents {
  /** Fix aceptado por el pipeline (háptica por km, notificación en vivo). */
  onFixAccepted?: (accepted: AcceptedFix) => void
  /** El usuario denegó el permiso de ubicación. */
  onPermissionDenied?: () => void
  /** Ya en 'tracking', antes de arrancar GPS y cronómetro. Si devuelve promesa se espera. */
  onStarting?: (type: CardioActivityType, startTime: number) => void | Promise<void>
  onPaused?: () => void
  /** `liveStartTime`: inicio efectivo (sin pausas) para el cronómetro de la notificación. */
  onResumed?: (liveStartTime: number) => void
  /** Al terminar, antes de calcular/guardar. */
  onFinishing?: () => void
  /** La sesión llegó a PocketBase. */
  onSaved?: (userId: string) => void
  /** PocketBase la rechazó y quedó en la cola de reintento. */
  onSaveQueued?: () => void
  /** La cola de reintento subió al menos una sesión. */
  onQueueFlushed?: (userId: string) => void
  onDiscarded?: () => void
  /** Se restauró una sesión en marcha tras matar el proceso. */
  onRestoredTracking?: (activityType: CardioActivityType, liveStartTime: number) => void
  /** El provider se desmonta (p. ej. al cerrar sesión). */
  onTeardown?: () => void
}

export interface UseCardioSessionStateOptions {
  userId: string | null
  userWeight?: number
  useTracking: (handlers: CardioTrackingHandlers) => CardioTrackingControls
  useKeepAwake: (active: boolean) => void
  /** Texto i18n del error «geolocalización no disponible». */
  geoUnavailableMessage: () => string
  events?: CardioSessionEvents
}

export interface CardioSessionStateValue {
  state: SessionState
  activityType: CardioActivityType
  points: MutableRefObject<GpsPoint[]>
  pointsCount: number
  distance: number
  duration: number
  currentPace: number
  currentSpeed: number
  currentSplit: { km: number; elapsed: number } | null
  error: string | null
  note: string
  setNote: (note: string) => void
  gpsAccuracy: number | null
  programId: string | null
  programDayKey: string | null
  /**
   * Inicio de la sesión en curso (ms), o `null`. Lo usa «Hoy» para saber cuál
   * de las actividades abiertas se empezó la última (`resolveHomeActiveActivity`).
   */
  startedAt: number | null
  /** false si el usuario denegó el permiso de ubicación. */
  start: (type: CardioActivityType, programId?: string, programDayKey?: string) => Promise<boolean>
  pause: () => void
  resume: () => void
  finish: (note?: string) => Promise<CardioSession | null>
  discard: () => void
  getHistory: (limit?: number, page?: number, activity?: CardioActivityType) => Promise<CardioSession[]>
  deleteSession: (id: string) => Promise<void>
  updateSessionNote: (id: string, note: string) => Promise<void>
  unsavedCount: number
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCardioSessionState({
  userId, userWeight, useTracking, useKeepAwake, geoUnavailableMessage, events,
}: UseCardioSessionStateOptions): CardioSessionStateValue {
  const queryClient = useQueryClient()
  const eventsRef = useLatest(events)
  const geoMessageRef = useLatest(geoUnavailableMessage)

  const [state, setState] = useState<SessionState>('idle')
  const [activityType, setActivityType] = useState<CardioActivityType>('running')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [programId, setProgramId] = useState<string | null>(null)
  const [programDayKey, setProgramDayKey] = useState<string | null>(null)
  // Espejo en estado de `startTimeRef`: un ref no se puede leer al renderizar.
  const [startedAt, setStartedAt] = useState<number | null>(null)

  // Espejo en refs de lo que leen los callbacks de larga vida (el watch de GPS
  // y el intervalo del cronómetro): allí un valor capturado por closure llega
  // obsoleto.
  const stateRef = useRef<SessionState>('idle')
  const activityTypeRef = useRef<CardioActivityType>('running')
  const startTimeRef = useRef(0)
  const pausedDurationRef = useRef(0)
  const pauseStartRef = useRef(0)
  const programIdRef = useRef<string | null>(null)
  const programDayKeyRef = useRef<string | null>(null)
  const restoredRef = useRef(false)

  const setSessionState = useCallback((next: SessionState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const setProgram = useCallback((id: string | null, dayKey: string | null) => {
    programIdRef.current = id
    programDayKeyRef.current = dayKey
    setProgramId(id)
    setProgramDayKey(dayKey)
  }, [])

  const isTracking = useCallback(() => stateRef.current === 'tracking', [])
  const getActivityType = useCallback(() => activityTypeRef.current, [])
  const getStartTime = useCallback(() => startTimeRef.current, [])
  const getPausedDuration = useCallback(() => pausedDurationRef.current, [])

  const {
    points, pointsCount, distance, currentPace, currentSpeed, currentSplit, gpsAccuracy,
    applyFix, reset: resetMetrics, restore: restoreMetrics, snapshot: snapshotMetrics,
  } = useCardioMetrics({ isTracking, getActivityType, getStartTime })

  // El health-check del cronómetro relanza el GPS, pero el tracking se declara
  // después (necesita `noteGpsFix`): el ref rompe el ciclo.
  const restartGpsRef = useRef<() => void>(() => {})
  const {
    duration, setDuration, start: startTimer, stop: stopTimer, noteGpsFix, resetGpsHealth,
  } = useCardioTimer({
    getStartTime,
    getPausedDuration,
    // Sólo con la app activa: Android prohíbe arrancar un FGS desde background.
    canRestartGps: useCallback(
      () => stateRef.current === 'tracking' && lifecycle.isForeground(),
      [],
    ),
    onGpsStalled: useCallback(() => restartGpsRef.current(), []),
  })

  const {
    start: startGps, stop: stopGps, restart: restartGps, requestPermission, captureOnce,
  } = useTracking({
    onFix: (fix) => {
      const accepted = applyFix(fix)
      if (!accepted) return
      noteGpsFix()
      eventsRef.current?.onFixAccepted?.(accepted)
    },
    onUnavailable: () => setError(geoMessageRef.current()),
    onError: (message) => setError(message),
  })
  restartGpsRef.current = restartGps

  // ── Copia de seguridad de la sesión ─────────────────────────────────────

  const buildSnapshot = useCallback((): PersistedCardioSession | null => {
    const s = stateRef.current
    if (s !== 'tracking' && s !== 'paused') return null
    const m = snapshotMetrics()
    return {
      state: s,
      activityType: activityTypeRef.current,
      startTime: startTimeRef.current,
      pausedDuration: pausedDurationRef.current,
      pauseStart: s === 'paused' ? pauseStartRef.current : null,
      points: m.points,
      distance: m.distance,
      lastSplitKm: m.lastSplitKm,
      lastSplitTime: m.lastSplitTime,
      maxSpeed: m.maxSpeed,
      programId: programIdRef.current,
      programDayKey: programDayKeyRef.current,
    }
  }, [snapshotMetrics])

  const isLive = state === 'tracking' || state === 'paused'
  const {
    persist, load: loadSnapshot, clear: clearSnapshot,
  } = useCardioPersistence({ active: isLive, buildSnapshot })
  useKeepAwake(isLive)

  const { unsavedCount, enqueue } = useUnsavedCardioQueue({
    userId,
    onFlushed: () => {
      if (!userId) return
      // Se subió al menos una sesión por la cola de reintento: refrescar la
      // caché para que aparezca en actividad reciente e historial sin esperar a
      // un cold load (finish() ya invalida, pero este es el camino del retry).
      void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
      eventsRef.current?.onQueueFlushed?.(userId)
    },
  })

  // Al pasar a segundo plano, un último fix antes de que el navegador congele el
  // JS (si la plataforma sabe pedirlo). Best-effort: en iOS Safari puede no
  // resolver nunca. El snapshot en sí lo guarda useCardioPersistence.
  useEffect(() => {
    if (!captureOnce) return
    return lifecycle.onBackground(() => {
      if (stateRef.current !== 'tracking') return
      captureOnce((fix) => { if (applyFix(fix)) persist() })
    })
  }, [captureOnce, applyFix, persist])

  // ── Acciones de sesión ──────────────────────────────────────────────────

  const start = useCallback(async (
    type: CardioActivityType,
    startProgramId?: string,
    startProgramDayKey?: string,
  ): Promise<boolean> => {
    if (requestPermission) {
      const granted = await requestPermission()
      if (!granted) {
        setError(geoMessageRef.current())
        eventsRef.current?.onPermissionDenied?.()
        return false
      }
    }

    setActivityType(type)
    activityTypeRef.current = type
    resetMetrics()
    setDuration(0)
    resetGpsHealth()
    setError(null)
    setNote('')
    setProgram(startProgramId || null, startProgramDayKey || null)
    pausedDurationRef.current = 0
    startTimeRef.current = Date.now()
    setStartedAt(startTimeRef.current)

    setSessionState('tracking')
    // Sin `await` si el gancho es síncrono: en web el arranque sigue siendo
    // síncrono. En móvil el FGS debe arrancar con la app en foreground y el
    // permiso ya concedido, ANTES de pedir el GPS.
    const starting = eventsRef.current?.onStarting?.(type, startTimeRef.current)
    if (starting) await starting
    startGps()
    startTimer()
    return true
  }, [
    requestPermission, startGps, resetMetrics, setDuration, resetGpsHealth,
    startTimer, setSessionState, setProgram, eventsRef, geoMessageRef,
  ])

  const pause = useCallback(() => {
    setSessionState('paused')
    stopGps()
    pauseStartRef.current = Date.now()
    stopTimer()
    eventsRef.current?.onPaused?.()
    persist()
  }, [stopGps, stopTimer, persist, setSessionState, eventsRef])

  const resume = useCallback(() => {
    setSessionState('tracking')
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    startGps()
    eventsRef.current?.onResumed?.(startTimeRef.current + pausedDurationRef.current)
    startTimer()
  }, [startGps, startTimer, setSessionState, eventsRef])

  const resetSession = useCallback(() => {
    resetMetrics()
    setDuration(0)
    setError(null)
    setNote('')
    setProgram(null, null)
  }, [resetMetrics, setDuration, setProgram])

  const finish = useCallback(async (finishNote?: string): Promise<CardioSession | null> => {
    stopGps()
    stopTimer()
    eventsRef.current?.onFinishing?.()
    setSessionState('finished')
    clearSnapshot()

    const { session, durationSeconds, tooShort } = buildCardioSession({
      activityType: activityTypeRef.current,
      points: points.current,
      startTime: startTimeRef.current,
      now: Date.now(),
      pausedDuration: pausedDurationRef.current,
      note: finishNote,
      userWeight,
      programId: programIdRef.current,
      programDayKey: programDayKeyRef.current,
    })
    setDuration(durationSeconds)

    // Un start/stop accidental (2 s, 0 km) no se guarda ni se encola: tapaba
    // la sesión real en «ÚLTIMA SESIÓN» y sumaba a los totales (#562).
    if (tooShort) {
      setSessionState('idle')
      resetSession()
      return null
    }

    if (userId) {
      const saveData = buildCardioSaveData(userId, session)
      try {
        session.id = await saveCardioSession(saveData)
        eventsRef.current?.onSaved?.(userId)
        // Refresca historial, stats, actividad reciente, racha (#801) y, si el
        // cardio es de un día de programa, el check del día y los totales.
        invalidateAfterWorkout(queryClient, userId, { cardio: true })
      } catch (e) {
        console.warn('Failed to save cardio session, queuing for retry:', e)
        enqueue(saveData)
        eventsRef.current?.onSaveQueued?.()
      }
    }

    return session
  }, [
    stopGps, stopTimer, setDuration, clearSnapshot, points, resetSession,
    setSessionState, userId, userWeight, queryClient, enqueue, eventsRef,
  ])

  const discard = useCallback(() => {
    stopGps()
    stopTimer()
    eventsRef.current?.onDiscarded?.()
    setSessionState('idle')
    clearSnapshot()
    resetSession()
  }, [stopGps, stopTimer, clearSnapshot, resetSession, setSessionState, eventsRef])

  // ── CRUD de sesiones guardadas ──────────────────────────────────────────

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    if (!userId) return
    try {
      await deleteCardioSession(id)
      void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
    } catch (e) {
      console.warn('Failed to delete cardio session:', e)
    }
  }, [userId, queryClient])

  // Persiste la nota escrita en la pantalla de resumen. La sesión ya se guardó
  // al pulsar «parar»: aquí sólo se parchea el campo `note`.
  const updateSessionNote = useCallback(async (id: string, sessionNote: string): Promise<void> => {
    if (!userId || !id) return
    try {
      await updateCardioSessionNote(id, sessionNote)
      void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
    } catch (e) {
      console.warn('Failed to update cardio session note:', e)
    }
  }, [userId, queryClient])

  const getHistory = useCallback(async (
    limit = CARDIO_HISTORY_PAGE_SIZE,
    page = 1,
    activity?: CardioActivityType,
  ): Promise<CardioSession[]> => {
    if (!userId) return []
    return fetchCardioHistory(userId, limit, page, activity)
  }, [userId])

  // ── Restaurar la sesión persistida al montar ────────────────────────────

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const saved = loadSnapshot()
    if (!saved) return

    startTimeRef.current = saved.startTime
    setStartedAt(saved.startTime)
    pausedDurationRef.current = saved.pausedDuration
    // Los snapshots anteriores a que la web guardara el programa no lo traen.
    setProgram(saved.programId ?? null, saved.programDayKey ?? null)
    restoreMetrics(saved)

    setActivityType(saved.activityType)
    activityTypeRef.current = saved.activityType

    if (saved.state === 'paused') {
      pauseStartRef.current = saved.pauseStart ?? Date.now()
      setSessionState('paused')
      // Tiempo transcurrido hasta el momento de la pausa.
      setDuration(Math.floor((pauseStartRef.current - saved.startTime - saved.pausedDuration) / 1000))
    } else {
      // Estaba en marcha: la duración incluye el rato en segundo plano.
      setSessionState('tracking')
      setDuration(Math.floor((Date.now() - saved.startTime - saved.pausedDuration) / 1000))
      eventsRef.current?.onRestoredTracking?.(saved.activityType, saved.startTime + saved.pausedDuration)
      startGps()
      startTimer()
    }
  }, [loadSnapshot, restoreMetrics, setDuration, startTimer, startGps, setSessionState, setProgram, eventsRef])

  // ── Cleanup al desmontar (p. ej. al cerrar sesión) ──────────────────────

  useEffect(() => {
    return () => {
      // Un último snapshot antes del teardown para poder restaurar la sesión.
      persist()
      stopGps()
      eventsRef.current?.onTeardown?.()
      stopTimer()
    }
  }, [persist, stopGps, stopTimer, eventsRef])

  // Memoizado: durante una sesión el hook re-renderiza cada segundo (el
  // cronómetro) y a cada fix de GPS. Sin memo, cada render recrea este objeto y
  // re-renderiza a todos los consumidores del contexto.
  return useMemo<CardioSessionStateValue>(() => ({
    state, activityType, points, pointsCount, distance, duration,
    currentPace, currentSpeed, currentSplit, error, note, setNote, gpsAccuracy,
    programId, programDayKey, startedAt,
    start, pause, resume, finish, discard,
    getHistory, deleteSession, updateSessionNote, unsavedCount,
  }), [
    state, activityType, error, note, programId, programDayKey, startedAt,
    points, pointsCount, distance, currentPace, currentSpeed, currentSplit, gpsAccuracy,
    duration, unsavedCount,
    start, pause, resume, finish, discard, getHistory, deleteSession, updateSessionNote,
  ])
}
