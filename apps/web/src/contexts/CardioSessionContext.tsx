import { createContext, useCallback, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import i18n from '../lib/i18n'
import { pb } from '@calistenia/core/lib/pocketbase'
import { lifecycle } from '@calistenia/core/platform'
import { qk } from '@calistenia/core/lib/query-keys'
import {
  calculateElevationGain,
  calculateSplitsAndDistance, calculateMaxPace, calculateMaxSpeed, calculateAvgSpeed,
} from '@calistenia/core/lib/geo'
import { estimateCalories } from '@calistenia/core/lib/calories'
import { splitRoute, saveCardioRoute, hydrateCardioRoutes } from '@calistenia/core/lib/cardioRoutes'
import type { GpsPoint, CardioActivityType, CardioSession } from '@calistenia/core/types'

import { useWakeLock } from '../hooks/useWakeLock'
import { useCardioMetrics } from '../hooks/cardio/useCardioMetrics'
import { useCardioPersistence, type PersistedCardioSession } from '../hooks/cardio/useCardioPersistence'
import { useCardioTimer } from '../hooks/cardio/useCardioTimer'
import { useGeolocationWatch } from '../hooks/cardio/useGeolocationWatch'
import { useUnsavedCardioQueue } from '../hooks/cardio/useUnsavedCardioQueue'

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionState = 'idle' | 'tracking' | 'paused' | 'finished'

interface CardioSessionContextValue {
  state: SessionState
  activityType: CardioActivityType
  points: React.MutableRefObject<GpsPoint[]>
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
  start: (type: CardioActivityType, programId?: string, programDayKey?: string) => void
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

/**
 * Hub de la sesión de cardio. Sólo compone: el GPS, el cronómetro, la copia de
 * seguridad, la cola de reintento y el wake lock viven en `hooks/cardio/`.
 * Aquí queda la máquina de estados de la sesión y el CRUD de PocketBase.
 */
export function CardioSessionProvider({ userId, userWeight, children }: Props) {
  const queryClient = useQueryClient()

  const [state, setState] = useState<SessionState>('idle')
  const [activityType, setActivityType] = useState<CardioActivityType>('running')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [programId, setProgramId] = useState<string | null>(null)
  const [programDayKey, setProgramDayKey] = useState<string | null>(null)

  // Espejo en refs de lo que leen los callbacks de larga vida (el watch de GPS
  // y el intervalo del cronómetro): allí un valor capturado por closure llega
  // obsoleto.
  const stateRef = useRef<SessionState>('idle')
  const activityTypeRef = useRef<CardioActivityType>('running')
  const startTimeRef = useRef(0)
  const pausedDurationRef = useRef(0)
  const pauseStartRef = useRef(0)
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

  // El health-check del cronómetro relanza el GPS, pero el watch se declara
  // después (necesita `noteGpsFix`): el ref rompe el ciclo.
  const restartGpsRef = useRef<() => void>(() => {})
  const {
    duration, setDuration, start: startTimer, stop: stopTimer, noteGpsFix, resetGpsHealth,
  } = useCardioTimer({
    getStartTime,
    getPausedDuration,
    canRestartGps: useCallback(
      () => stateRef.current === 'tracking' && lifecycle.isForeground(),
      [],
    ),
    onGpsStalled: useCallback(() => restartGpsRef.current(), []),
  })

  const {
    start: startGps, stop: stopGps, restart: restartGps, captureOnce,
  } = useGeolocationWatch({
    onFix: (fix) => { if (applyFix(fix)) noteGpsFix() },
    onUnavailable: () => setError(i18n.t('cardioSession.geoNotAvailable')),
    onError: (err) => setError(`Error GPS: ${err.message}`),
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
    }
  }, [snapshotMetrics])

  const isLive = state === 'tracking' || state === 'paused'
  const {
    persist, load: loadSnapshot, clear: clearSnapshot,
  } = useCardioPersistence({ active: isLive, buildSnapshot })
  useWakeLock(isLive)

  const { unsavedCount, enqueue } = useUnsavedCardioQueue({
    userId,
    onFlushed: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
    },
  })

  // Al ocultar la pestaña, un último fix antes de que el navegador congele el
  // JS. Best-effort: en iOS Safari puede no resolver nunca. (El snapshot en sí
  // lo guarda useCardioPersistence, que escucha el mismo evento.)
  useEffect(() => lifecycle.onBackground(() => {
    if (stateRef.current !== 'tracking') return
    captureOnce((fix) => { if (applyFix(fix)) persist() })
  }), [captureOnce, applyFix, persist])

  // ── Acciones de sesión ──────────────────────────────────────────────────

  const start = useCallback((
    type: CardioActivityType,
    startProgramId?: string,
    startProgramDayKey?: string,
  ) => {
    setActivityType(type)
    activityTypeRef.current = type
    resetMetrics()
    setDuration(0)
    resetGpsHealth()
    setError(null)
    setNote('')
    setProgramId(startProgramId || null)
    setProgramDayKey(startProgramDayKey || null)
    pausedDurationRef.current = 0
    startTimeRef.current = Date.now()

    setSessionState('tracking')
    startGps()
    startTimer()
  }, [resetMetrics, setDuration, resetGpsHealth, startTimer, startGps, setSessionState])

  const pause = useCallback(() => {
    setSessionState('paused')
    stopGps()
    pauseStartRef.current = Date.now()
    stopTimer()
    persist()
  }, [stopGps, stopTimer, persist, setSessionState])

  const resume = useCallback(() => {
    setSessionState('tracking')
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    startGps()
    startTimer()
  }, [startGps, startTimer, setSessionState])

  const finish = useCallback(async (finishNote?: string): Promise<CardioSession | null> => {
    stopGps()
    stopTimer()
    setSessionState('finished')
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
      program: programId || undefined,
      program_day_key: programDayKey || undefined,
    }

    if (userId) {
      const saveData: Record<string, unknown> = { user: userId, ...session }
      if (programId) saveData.program = programId
      if (programDayKey) saveData.program_day_key = programDayKey
      try {
        // La ruta va a `cardio_routes`, owner-only (#299).
        const { record, points: routePoints } = splitRoute(saveData)
        const saved = await pb.collection('cardio_sessions').create(record)
        session.id = saved.id
        await saveCardioRoute(saved.id, userId, routePoints)
        // Refresca historial, stats y actividad reciente de inmediato.
        void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
      } catch (e) {
        console.warn('Failed to save cardio session, queuing for retry:', e)
        enqueue(saveData)
      }
    }

    return session
  }, [
    stopGps, stopTimer, setDuration, clearSnapshot, points, setSessionState,
    userId, userWeight, programId, programDayKey, queryClient, enqueue,
  ])

  const discard = useCallback(() => {
    stopGps()
    stopTimer()
    setSessionState('idle')
    clearSnapshot()
    resetMetrics()
    setDuration(0)
    setError(null)
    setNote('')
    setProgramId(null)
    setProgramDayKey(null)
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

  // Persiste la nota escrita en la pantalla de sesión terminada. La sesión ya
  // está guardada a estas alturas: esto sólo parchea el campo `note`.
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
    const res = await pb.collection('cardio_sessions').getList(1, limit, {
      filter: pb.filter('user = {:userId}', { userId }),
      sort: '-started_at',
      // Sin auto-cancelación: chocaba con el getFullList de stats sobre la misma
      // colección — en web de forma determinista al montar la página (#559).
      requestKey: null,
    })
    // Las rutas viven aparte (#299) y se rellenan en una segunda consulta.
    // Solo se hace aquí, en el historial propio; el muro no las pide.
    return hydrateCardioRoutes(res.items.map(r => ({
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
      startGps()
      startTimer()
    }
  }, [loadSnapshot, restoreMetrics, setDuration, startTimer, startGps, setSessionState])

  // ── Cleanup al desmontar (p. ej. al cerrar sesión) ──────────────────────

  useEffect(() => {
    return () => {
      // Un último snapshot antes del teardown para poder restaurar la sesión.
      persist()
      stopGps()
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
