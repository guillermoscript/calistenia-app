import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import i18n from '../lib/i18n'
import { pb } from '@calistenia/core/lib/pocketbase'
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

  const metrics = useCardioMetrics({ isTracking, getActivityType, getStartTime })

  // El health-check del cronómetro relanza el GPS, pero `geo` se declara
  // después (necesita `timer.noteGpsFix`): el ref rompe el ciclo.
  const restartGpsRef = useRef<() => void>(() => {})
  const timer = useCardioTimer({
    getStartTime,
    getPausedDuration,
    canRestartGps: useCallback(
      () => stateRef.current === 'tracking' && document.visibilityState === 'visible',
      [],
    ),
    onGpsStalled: useCallback(() => restartGpsRef.current(), []),
  })

  const geo = useGeolocationWatch({
    onFix: (fix) => { if (metrics.applyFix(fix)) timer.noteGpsFix() },
    onUnavailable: () => setError(i18n.t('cardioSession.geoNotAvailable')),
    onError: (err) => setError(`Error GPS: ${err.message}`),
  })
  restartGpsRef.current = geo.restart

  // ── Copia de seguridad de la sesión ─────────────────────────────────────

  const buildSnapshot = useCallback((): PersistedCardioSession | null => {
    const s = stateRef.current
    if (s !== 'tracking' && s !== 'paused') return null
    const m = metrics.snapshot()
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
  }, [metrics.snapshot])

  const isLive = state === 'tracking' || state === 'paused'
  const persistence = useCardioPersistence({ active: isLive, buildSnapshot })
  useWakeLock(isLive)

  const queue = useUnsavedCardioQueue({
    userId,
    onFlushed: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
    },
  })

  // Al ocultar la pestaña, un último fix antes de que el navegador congele el
  // JS. Best-effort: en iOS Safari puede no resolver nunca. (El snapshot en sí
  // lo guarda useCardioPersistence, que escucha el mismo evento.)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'hidden' || stateRef.current !== 'tracking') return
      geo.captureOnce((fix) => { if (metrics.applyFix(fix)) persistence.persist() })
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [geo.captureOnce, metrics.applyFix, persistence.persist])

  // ── Acciones de sesión ──────────────────────────────────────────────────

  const start = useCallback((
    type: CardioActivityType,
    startProgramId?: string,
    startProgramDayKey?: string,
  ) => {
    setActivityType(type)
    activityTypeRef.current = type
    metrics.reset()
    timer.setDuration(0)
    timer.resetGpsHealth()
    setError(null)
    setNote('')
    setProgramId(startProgramId || null)
    setProgramDayKey(startProgramDayKey || null)
    pausedDurationRef.current = 0
    startTimeRef.current = Date.now()

    setSessionState('tracking')
    geo.start()
    timer.start()
  }, [metrics.reset, timer.setDuration, timer.resetGpsHealth, timer.start, geo.start, setSessionState])

  const pause = useCallback(() => {
    setSessionState('paused')
    geo.stop()
    pauseStartRef.current = Date.now()
    timer.stop()
    persistence.persist()
  }, [geo.stop, timer.stop, persistence.persist, setSessionState])

  const resume = useCallback(() => {
    setSessionState('tracking')
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    geo.start()
    timer.start()
  }, [geo.start, timer.start, setSessionState])

  const finish = useCallback(async (finishNote?: string): Promise<CardioSession | null> => {
    geo.stop()
    timer.stop()
    setSessionState('finished')
    persistence.clear()

    const finalDuration = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
    timer.setDuration(finalDuration)

    const points = metrics.points.current
    const { splits, totalDistanceKm: totalDistance } = calculateSplitsAndDistance(points)
    const elevationGain = calculateElevationGain(points)
    const avgPace = finalDuration > 0 && totalDistance > 0 ? (finalDuration / 60) / totalDistance : 0
    const currentActivity = activityTypeRef.current

    const session: CardioSession = {
      activity_type: currentActivity,
      gps_points: points,
      distance_km: Math.round(totalDistance * 100) / 100,
      duration_seconds: finalDuration,
      avg_pace: Math.round(avgPace * 100) / 100,
      elevation_gain: Math.round(elevationGain),
      started_at: new Date(startTimeRef.current).toISOString(),
      finished_at: new Date().toISOString(),
      note: finishNote,
      calories_burned: estimateCalories(currentActivity, finalDuration, userWeight),
      max_pace: calculateMaxPace(points),
      avg_speed_kmh: calculateAvgSpeed(totalDistance, finalDuration),
      max_speed_kmh: calculateMaxSpeed(points),
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
        queue.enqueue(saveData)
      }
    }

    return session
  }, [
    geo.stop, timer.stop, timer.setDuration, persistence.clear, metrics.points, setSessionState,
    userId, userWeight, programId, programDayKey, queryClient, queue.enqueue,
  ])

  const discard = useCallback(() => {
    geo.stop()
    timer.stop()
    setSessionState('idle')
    persistence.clear()
    metrics.reset()
    timer.setDuration(0)
    setError(null)
    setNote('')
    setProgramId(null)
    setProgramDayKey(null)
  }, [geo.stop, timer.stop, timer.setDuration, persistence.clear, metrics.reset, setSessionState])

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
    try {
      const res = await pb.collection('cardio_sessions').getList(1, limit, {
        filter: pb.filter('user = {:userId}', { userId }),
        sort: '-started_at',
      })
      // Las rutas viven aparte (#299) y se rellenan en una segunda consulta.
      // Solo se hace aquí, en el historial propio; el muro no las pide.
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
    } catch { return [] }
  }, [userId])

  // ── Restaurar la sesión persistida al montar ────────────────────────────

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const saved = persistence.load()
    if (!saved) return

    startTimeRef.current = saved.startTime
    pausedDurationRef.current = saved.pausedDuration
    metrics.restore(saved)
    setActivityType(saved.activityType)
    activityTypeRef.current = saved.activityType

    if (saved.state === 'paused') {
      pauseStartRef.current = saved.pauseStart ?? Date.now()
      setSessionState('paused')
      // Tiempo transcurrido hasta el momento de la pausa.
      timer.setDuration(Math.floor((pauseStartRef.current - saved.startTime - saved.pausedDuration) / 1000))
    } else {
      // Estaba en marcha: la duración incluye el rato en segundo plano.
      setSessionState('tracking')
      timer.setDuration(Math.floor((Date.now() - saved.startTime - saved.pausedDuration) / 1000))
      geo.start()
      timer.start()
    }
  }, [persistence.load, metrics.restore, timer.setDuration, timer.start, geo.start, setSessionState])

  // ── Cleanup al desmontar (p. ej. al cerrar sesión) ──────────────────────

  useEffect(() => {
    return () => {
      // Un último snapshot antes del teardown para poder restaurar la sesión.
      persistence.persist()
      geo.stop()
      timer.stop()
    }
  }, [persistence.persist, geo.stop, timer.stop])

  // Memoizado: durante una sesión el provider re-renderiza cada segundo (el
  // cronómetro) y a cada fix de GPS. Sin memo, cada render recrea este objeto y
  // re-renderiza a todos los consumidores de useCardioSessionContext().
  const value = useMemo<CardioSessionContextValue>(() => ({
    state,
    activityType,
    points: metrics.points,
    pointsCount: metrics.pointsCount,
    distance: metrics.distance,
    duration: timer.duration,
    currentPace: metrics.currentPace,
    currentSpeed: metrics.currentSpeed,
    currentSplit: metrics.currentSplit,
    error,
    note,
    setNote,
    gpsAccuracy: metrics.gpsAccuracy,
    programId,
    programDayKey,
    start, pause, resume, finish, discard,
    getHistory, deleteSession, updateSessionNote,
    unsavedCount: queue.unsavedCount,
  }), [
    state, activityType, error, note, programId, programDayKey,
    metrics.points, metrics.pointsCount, metrics.distance, metrics.currentPace,
    metrics.currentSpeed, metrics.currentSplit, metrics.gpsAccuracy,
    timer.duration, queue.unsavedCount,
    start, pause, resume, finish, discard, getHistory, deleteSession, updateSessionNote,
  ])

  return (
    <CardioSessionContext.Provider value={value}>
      {children}
    </CardioSessionContext.Provider>
  )
}

export function useCardioSessionContext() {
  const ctx = useContext(CardioSessionContext)
  if (!ctx) throw new Error('useCardioSessionContext must be used within CardioSessionProvider')
  return ctx
}
