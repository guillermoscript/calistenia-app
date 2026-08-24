/**
 * Hub de la sesión de cardio nativa. Port del de apps/web; los hooks de
 * `hooks/cardio/` llevan el mismo nombre y la misma firma en las dos apps, y
 * sólo cambia el sustrato de plataforma:
 *  - navigator.geolocation.watchPosition → cardio-tracker (expo-location + FGS)
 *  - localStorage → syncStorage (caché síncrona sobre AsyncStorage)
 *  - wake lock → expo-keep-awake
 *  - lifecycle (foreground/background) → `platform.lifecycle` de core (#482)
 * La lógica de filtrado (accuracy, jitter, gaps, Kalman) es la de core.
 */
import {
  createContext, useCallback, use, useEffect, useMemo, useRef, useState,
  type ReactNode, type MutableRefObject,
} from 'react'
import i18n from 'i18next'
import { lifecycle } from '@calistenia/core/platform'
import { useQueryClient } from '@tanstack/react-query'
import { pb } from '@calistenia/core/lib/pocketbase'
import { qk } from '@calistenia/core/lib/query-keys'
import {
  calculateElevationGain,
  calculateSplitsAndDistance, calculateMaxPace, calculateMaxSpeed, calculateAvgSpeed,
} from '@calistenia/core/lib/geo'
import { estimateCalories } from '@calistenia/core/lib/calories'
import { splitRoute, saveCardioRoute, hydrateCardioRoutes } from '@calistenia/core/lib/cardioRoutes'
import { isCardioSessionTooShort } from '@calistenia/core/lib/cardioMinimum'
import { retryTransient } from '@calistenia/core/lib/pocketbase-errors'
import type { GpsPoint, CardioActivityType, CardioSession } from '@calistenia/core/types'

import { haptics } from '@/lib/haptics'
import {
  startCardioLive, updateCardioLive, pauseCardioLive, resumeCardioLive,
  endCardioLive, setCardioLiveActionHandler,
} from '@/lib/cardio-live'
import { syncCardioWidget } from '@/lib/sync-cardio-widget'
import { useKeepAwakeWhile } from '@/hooks/useKeepAwakeWhile'
import { useCardioMetrics } from '@/hooks/cardio/useCardioMetrics'
import { useCardioPersistence, type PersistedCardioSession } from '@/hooks/cardio/useCardioPersistence'
import { useCardioTimer } from '@/hooks/cardio/useCardioTimer'
import { useCardioTracking } from '@/hooks/cardio/useCardioTracking'
import { useUnsavedCardioQueue } from '@/hooks/cardio/useUnsavedCardioQueue'

const KEEP_AWAKE_TAG = 'cardio-session'

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionState = 'idle' | 'tracking' | 'paused' | 'finished'

interface CardioSessionContextValue {
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
  /** false si el usuario denegó el permiso de ubicación. */
  start: (type: CardioActivityType, programId?: string, programDayKey?: string) => Promise<boolean>
  pause: () => void
  resume: () => void
  finish: (note?: string) => Promise<CardioSession | null>
  discard: () => void
  getHistory: (limit?: number) => Promise<CardioSession[]>
  deleteSession: (id: string) => Promise<void>
  updateSessionNote: (id: string, note: string) => Promise<void>
  unsavedCount: number
}

const CardioSessionContext = createContext<CardioSessionContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null
  userWeight?: number
  children: ReactNode
}

export function CardioSessionProvider({ userId, userWeight, children }: Props) {
  const queryClient = useQueryClient()

  const [state, setState] = useState<SessionState>('idle')
  const [activityType, setActivityType] = useState<CardioActivityType>('running')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [programId, setProgramId] = useState<string | null>(null)
  const [programDayKey, setProgramDayKey] = useState<string | null>(null)

  // Espejo en refs de lo que leen los callbacks de larga vida (el listener de
  // fixes del FGS y el intervalo del cronómetro): allí un valor capturado por
  // closure llega obsoleto.
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
    requestPermission, start: startGps, stop: stopGps, restart: restartGps,
  } = useCardioTracking({
    onFix: (fix) => {
      const accepted = applyFix(fix)
      if (!accepted) return
      noteGpsFix()
      if (accepted.splitCompleted) {
        // Km completado — vibración estilo Strava (el teléfono suele ir en el
        // bolsillo o el brazalete: la háptica es el único feedback que llega).
        void haptics.success()
      }
      // Notificación en vivo (el throttle vive dentro del módulo).
      updateCardioLive({
        distanceKm: accepted.distanceKm,
        paceMinKm: accepted.paceMinKm,
        speedKmh: accepted.speedKmh,
      })
    },
    onUnavailable: () => setError(i18n.t('cardioSession.geoNotAvailable')),
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
  useKeepAwakeWhile(isLive, KEEP_AWAKE_TAG)

  const { unsavedCount, enqueue } = useUnsavedCardioQueue({
    userId,
    onFlushed: () => {
      if (!userId) return
      // Se subió al menos una sesión por la cola de reintento: refrescar la
      // caché para que aparezca en actividad reciente e historial sin esperar a
      // un cold load (finish() ya invalida, pero este es el camino del retry).
      void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
      void syncCardioWidget(userId)
    },
  })

  useEffect(() => { void syncCardioWidget(userId) }, [userId])

  // ── Acciones de sesión ──────────────────────────────────────────────────

  const start = useCallback(async (
    type: CardioActivityType,
    startProgramId?: string,
    startProgramDayKey?: string,
  ): Promise<boolean> => {
    const granted = await requestPermission()
    if (!granted) {
      setError(i18n.t('cardioSession.geoNotAvailable'))
      void haptics.error()
      return false
    }

    setActivityType(type)
    activityTypeRef.current = type
    resetMetrics()
    setDuration(0)
    resetGpsHealth()
    setError(null)
    setNote('')
    setProgramId(startProgramId || null)
    setProgramDayKey(startProgramDayKey || null)
    programIdRef.current = startProgramId || null
    programDayKeyRef.current = startProgramDayKey || null
    pausedDurationRef.current = 0
    startTimeRef.current = Date.now()

    setSessionState('tracking')
    void haptics.medium()
    // El FGS (notificación) debe arrancar con la app en foreground y el permiso
    // ya concedido — es lo que mantiene el GPS vivo con la pantalla bloqueada.
    await startCardioLive(type, startTimeRef.current)
    startGps()
    startTimer()
    return true
  }, [
    requestPermission, startGps, resetMetrics,
    setDuration, resetGpsHealth, startTimer, setSessionState,
  ])

  const pause = useCallback(() => {
    setSessionState('paused')
    // En el contexto y no en el botón, para que también vibre al pausar desde
    // la notificación con el teléfono bloqueado.
    void haptics.medium()
    stopGps()
    pauseStartRef.current = Date.now()
    stopTimer()
    void pauseCardioLive()
    persist()
  }, [stopGps, stopTimer, persist, setSessionState])

  const resume = useCallback(() => {
    setSessionState('tracking')
    void haptics.medium()
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    startGps()
    void resumeCardioLive(startTimeRef.current + pausedDurationRef.current)
    startTimer()
  }, [startGps, startTimer, setSessionState])

  // Botones de la notificación → pausar/reanudar la sesión.
  const pauseRef = useRef(pause)
  const resumeRef = useRef(resume)
  pauseRef.current = pause
  resumeRef.current = resume
  useEffect(() => {
    setCardioLiveActionHandler((action) => {
      if (action === 'pause') pauseRef.current()
      else resumeRef.current()
    })
    return () => setCardioLiveActionHandler(null)
  }, [])

  const finish = useCallback(async (finishNote?: string): Promise<CardioSession | null> => {
    stopGps()
    void endCardioLive()
    stopTimer()
    setSessionState('finished')
    void haptics.success()
    clearSnapshot()

    const finalDuration = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
    setDuration(finalDuration)

    const finalPoints = points.current
    const { splits, totalDistanceKm: totalDistance } = calculateSplitsAndDistance(finalPoints)
    const elevationGain = calculateElevationGain(finalPoints)
    const avgPace = finalDuration > 0 && totalDistance > 0 ? (finalDuration / 60) / totalDistance : 0
    const currentActivity = activityTypeRef.current

    const session: CardioSession = {
      activity_type: currentActivity,
      gps_points: finalPoints,
      distance_km: Math.round(totalDistance * 100) / 100,
      duration_seconds: finalDuration,
      avg_pace: Math.round(avgPace * 100) / 100,
      elevation_gain: Math.round(elevationGain),
      started_at: new Date(startTimeRef.current).toISOString(),
      finished_at: new Date().toISOString(),
      note: finishNote,
      calories_burned: estimateCalories(currentActivity, finalDuration, userWeight),
      max_pace: calculateMaxPace(finalPoints),
      avg_speed_kmh: calculateAvgSpeed(totalDistance, finalDuration),
      max_speed_kmh: calculateMaxSpeed(finalPoints),
      splits,
      program: programIdRef.current || undefined,
      program_day_key: programDayKeyRef.current || undefined,
    }

    // Un start/stop accidental (2 s, 0 km) no se guarda ni se encola: tapaba
    // la sesión real en «ÚLTIMA SESIÓN» y sumaba a los totales (#562).
    if (isCardioSessionTooShort(session)) {
      setSessionState('idle')
      resetMetrics()
      setDuration(0)
      setError(null)
      setNote('')
      setProgramId(null)
      setProgramDayKey(null)
      programIdRef.current = null
      programDayKeyRef.current = null
      return null
    }

    if (userId) {
      const saveData: Record<string, unknown> = { user: userId, ...session }
      try {
        // La ruta va a `cardio_routes`, owner-only (#299).
        const { record, points: routePoints } = splitRoute(saveData)
        const saved = await pb.collection('cardio_sessions').create(record)
        session.id = saved.id
        await saveCardioRoute(saved.id, userId, routePoints)
        void syncCardioWidget(userId)
        // Refresca historial cardio, stats y actividad reciente de inmediato.
        void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
      } catch (e) {
        console.warn('Failed to save cardio session, queuing for retry:', e)
        enqueue(saveData)
        void haptics.warning()
      }
    }

    return session
  }, [
    stopGps, stopTimer, setDuration, clearSnapshot, points, resetMetrics,
    setSessionState, userId, userWeight, queryClient, enqueue,
  ])

  const discard = useCallback(() => {
    stopGps()
    void endCardioLive()
    stopTimer()
    setSessionState('idle')
    clearSnapshot()
    resetMetrics()
    setDuration(0)
    setError(null)
    setNote('')
    setProgramId(null)
    setProgramDayKey(null)
    programIdRef.current = null
    programDayKeyRef.current = null
  }, [stopGps, stopTimer, setDuration, clearSnapshot, resetMetrics, setSessionState])

  // ── CRUD de sesiones guardadas ──────────────────────────────────────────

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    if (!userId) return
    try {
      await pb.collection('cardio_sessions').delete(id)
      void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
    } catch (e) {
      console.warn('Failed to delete cardio session:', e)
    }
  }, [userId, queryClient])

  // Persiste la nota escrita en la pantalla de resumen (la sesión ya se guardó
  // al pulsar "parar", así que aquí sólo se actualiza el registro existente).
  const updateSessionNote = useCallback(async (id: string, sessionNote: string): Promise<void> => {
    if (!userId || !id) return
    try {
      await pb.collection('cardio_sessions').update(id, { note: sessionNote })
      void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
    } catch (e) {
      console.warn('Failed to update cardio session note:', e)
    }
  }, [userId, queryClient])

  const getHistory = useCallback(async (limit = 20): Promise<CardioSession[]> => {
    if (!userId) return []
    // Sin try/catch: un fallo aqui NO es «no hay sesiones» — debe llegar al
    // caller, que distingue y reporta (#559). Antes cualquier abort/fallo
    // devolvia [] y se pintaba el estado vacio aunque hubiera datos.
    // Reintento ante 5xx/sin-respuesta: un solo 504 del gateway pintaba el
    // historial vacío (CALISTENIA-APP-S). Los 4xx no se reintentan.
    const res = await retryTransient(() => pb.collection('cardio_sessions').getList(1, limit, {
      filter: pb.filter('user = {:userId}', { userId }),
      sort: '-started_at',
      // Sin auto-cancelación: chocaba con el getFullList de stats y el getList
      // del widget sobre la misma colección (#559).
      requestKey: null,
    }))
    // Las rutas viven aparte (#299): segunda consulta, sólo en el historial
    // propio. El muro nunca las pide.
    return hydrateCardioRoutes(res.items.map((r: any) => ({
      id: r.id,
      user: r.user,
      activity_type: r.activity_type,
      gps_points: [] as GpsPoint[],
      distance_km: r.distance_km,
      duration_seconds: r.duration_seconds,
      avg_pace: r.avg_pace,
      elevation_gain: r.elevation_gain,
      started_at: r.started_at,
      finished_at: r.finished_at,
      note: r.note,
      calories_burned: r.calories_burned,
      max_pace: r.max_pace,
      avg_speed_kmh: r.avg_speed_kmh,
      max_speed_kmh: r.max_speed_kmh,
      splits: r.splits,
    })))
  }, [userId])

  // ── Restaurar la sesión persistida al montar ────────────────────────────

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const saved = loadSnapshot()
    if (!saved) return

    startTimeRef.current = saved.startTime
    pausedDurationRef.current = saved.pausedDuration
    programIdRef.current = saved.programId
    programDayKeyRef.current = saved.programDayKey
    restoreMetrics(saved)

    setActivityType(saved.activityType)
    activityTypeRef.current = saved.activityType
    setProgramId(saved.programId)
    setProgramDayKey(saved.programDayKey)

    if (saved.state === 'paused') {
      pauseStartRef.current = saved.pauseStart ?? Date.now()
      setSessionState('paused')
      setDuration(Math.floor((pauseStartRef.current - saved.startTime - saved.pausedDuration) / 1000))
    } else {
      setSessionState('tracking')
      setDuration(Math.floor((Date.now() - saved.startTime - saved.pausedDuration) / 1000))
      void startCardioLive(saved.activityType, saved.startTime + saved.pausedDuration)
      startGps()
      startTimer()
    }
  }, [loadSnapshot, restoreMetrics, setDuration, startTimer, startGps, setSessionState])

  // ── Cleanup al desmontar (cerrar sesión) ────────────────────────────────

  useEffect(() => {
    return () => {
      persist()
      stopGps()
      void endCardioLive()
      stopTimer()
    }
  }, [persist, stopGps, stopTimer])

  // Memoizado: durante una sesión el provider re-renderiza cada segundo (el
  // cronómetro) y a cada fix de GPS. Sin memo, cada render recrea este objeto y
  // re-renderiza a todos los consumidores de useCardioSessionContext().
  const value = useMemo<CardioSessionContextValue>(() => ({
    state,
    activityType,
    points,
    pointsCount,
    distance,
    duration,
    currentPace,
    currentSpeed,
    currentSplit,
    error,
    note,
    setNote,
    gpsAccuracy,
    programId,
    programDayKey,
    start, pause, resume, finish, discard,
    getHistory, deleteSession, updateSessionNote,
    unsavedCount,
  }), [
    state, activityType, error, note, programId, programDayKey,
    points, pointsCount, distance, currentPace, currentSpeed, currentSplit, gpsAccuracy,
    duration, unsavedCount,
    start, pause, resume, finish, discard, getHistory, deleteSession, updateSessionNote,
  ])

  return (
    <CardioSessionContext.Provider value={value}>
      {children}
    </CardioSessionContext.Provider>
  )
}

export function useCardioSessionContext() {
  const ctx = use(CardioSessionContext)
  if (!ctx) throw new Error('useCardioSessionContext must be used within CardioSessionProvider')
  return ctx
}
