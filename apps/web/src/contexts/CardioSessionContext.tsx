import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import i18n from '../lib/i18n'
import { pb } from '@calistenia/core/lib/pocketbase'
import { CARDIO_ACTIVE_KEY as STORAGE_KEY, CARDIO_UNSAVED_KEY as UNSAVED_KEY } from '@calistenia/core/lib/storage-keys'
import { qk } from '@calistenia/core/lib/query-keys'
import {
  calculateElevationGain,
  calculateSplitsAndDistance, calculateMaxPace, calculateMaxSpeed, calculateAvgSpeed,
  type KalmanState,
} from '@calistenia/core/lib/geo'
import { processCardioFix, type CardioFixState, type CardioFixInput } from '@calistenia/core/lib/cardio-fix'
import { estimateCalories } from '@calistenia/core/lib/calories'
import { splitRoute, saveCardioRoute, hydrateCardioRoutes } from '@calistenia/core/lib/cardioRoutes'
import type { GpsPoint, CardioActivityType, CardioSession } from '@calistenia/core/types'

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

// ── localStorage backup key ──────────────────────────────────────────────────

// Discard persisted sessions older than 24 hours — prevents zombie sessions
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000

interface PersistedSession {
  state: 'tracking' | 'paused'
  activityType: CardioActivityType
  startTime: number
  pausedDuration: number
  pauseStart: number | null
  points: GpsPoint[]
  distance: number
  lastSplitKm: number
  lastSplitTime: number
  maxSpeed: number
}

function saveToStorage(data: PersistedSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

function loadFromStorage(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: PersistedSession = JSON.parse(raw)
    // Discard stale sessions (e.g., app closed and reopened days later)
    if (Date.now() - data.startTime > MAX_SESSION_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Unsaved session queue (retry on PocketBase failure) ─────────────────────

const MAX_UNSAVED = 5

function loadUnsaved(): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(UNSAVED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function pushUnsaved(session: Record<string, unknown>) {
  try {
    const queue = loadUnsaved()
    queue.push(session)
    // FIFO: drop oldest if over limit
    while (queue.length > MAX_UNSAVED) queue.shift()
    localStorage.setItem(UNSAVED_KEY, JSON.stringify(queue))
  } catch { /* quota exceeded */ }
}

function clearUnsaved() {
  localStorage.removeItem(UNSAVED_KEY)
}

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
  const [distance, setDistance] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentPace, setCurrentPace] = useState(0)
  const [currentSpeed, setCurrentSpeed] = useState(0)
  const [currentSplit, setCurrentSplit] = useState<{ km: number; elapsed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pointsCount, setPointsCount] = useState(0)
  const [note, setNote] = useState('')
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [programId, setProgramId] = useState<string | null>(null)
  const [programDayKey, setProgramDayKey] = useState<string | null>(null)
  const [unsavedCount, setUnsavedCount] = useState(0)

  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)
  const pauseStartRef = useRef<number>(0)
  const lastSplitKmRef = useRef<number>(0)
  const lastSplitTimeRef = useRef<number>(0)
  const maxSpeedRef = useRef<number>(0)
  const pointsRef = useRef<GpsPoint[]>([])
  const distanceRef = useRef<number>(0)
  const durationRef = useRef<number>(0)
  const currentPaceRef = useRef<number>(0)
  const restoredRef = useRef(false)
  const stateRef = useRef<SessionState>('idle')
  const activityTypeRef = useRef<CardioActivityType>('running')
  const lastGpsTimestampRef = useRef<number>(0)
  const lastGpsRestartRef = useRef<number>(0)
  const startTrackingRef = useRef<() => void>(() => {})
  const kalmanRef = useRef<KalmanState | null>(null)

  // ── Persist to localStorage periodically ────────────────────────────────

  const persistSnapshot = useCallback(() => {
    const s = stateRef.current
    if (s !== 'tracking' && s !== 'paused') return
    saveToStorage({
      state: s,
      activityType: activityTypeRef.current,
      startTime: startTimeRef.current,
      pausedDuration: pausedDurationRef.current,
      pauseStart: s === 'paused' ? pauseStartRef.current : null,
      points: pointsRef.current,
      distance: distanceRef.current,
      lastSplitKm: lastSplitKmRef.current,
      lastSplitTime: lastSplitTimeRef.current,
      maxSpeed: maxSpeedRef.current,
    })
  }, []) // reads from refs only — no stale closure risk

  // Save snapshot every 5 seconds during active session
  useEffect(() => {
    if (state !== 'tracking' && state !== 'paused') return
    const id = setInterval(persistSnapshot, 5000)
    return () => clearInterval(id)
  }, [state, persistSnapshot])

  // ── Pipeline de fixes GPS (compartido con mobile via core) ──────────────

  // Pasa un fix por processCardioFix() de core y aplica nextState + flags a
  // refs/estado. Devuelve true si el fix produjo un punto aceptado.
  const applyFix = useCallback((fix: CardioFixInput): boolean => {
    // Un fix en vuelo puede llegar después de pause()/finish() (clearWatch
    // no es instantáneo): fuera de 'tracking' no debe mutar distancia/puntos.
    if (stateRef.current !== 'tracking') return false

    const pts = pointsRef.current
    const fixState: CardioFixState = {
      lastPoint: pts.length > 0 ? pts[pts.length - 1] : null,
      kalman: kalmanRef.current,
      distanceKm: distanceRef.current,
      lastSplitKm: lastSplitKmRef.current,
      lastSplitTime: lastSplitTimeRef.current,
      startTime: startTimeRef.current,
      maxSpeedKmh: maxSpeedRef.current,
    }

    const result = processCardioFix(fixState, fix, activityTypeRef.current)

    if (result.accuracy != null) setGpsAccuracy(result.accuracy)
    if (!result.accepted || !result.point) return false

    kalmanRef.current = result.nextState.kalman
    distanceRef.current = result.nextState.distanceKm
    lastSplitKmRef.current = result.nextState.lastSplitKm
    lastSplitTimeRef.current = result.nextState.lastSplitTime
    maxSpeedRef.current = result.nextState.maxSpeedKmh

    pts.push(result.point)
    setPointsCount(pts.length)
    setDistance(result.distanceKm)
    if (result.split) setCurrentSplit(result.split)
    if (result.speedKmh > 0 || result.paceMinKm > 0) {
      setCurrentPace(result.paceMinKm)
      setCurrentSpeed(result.speedKmh)
    }
    return true
  }, [])

  // Also persist on visibility change (user switches app / locks screen)
  // Best-effort: grab one last GPS point before the browser suspends JS
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        persistSnapshot()
        // Try to capture a final position before suspension (may not resolve on iOS Safari)
        if (stateRef.current === 'tracking' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude, altitude, speed, accuracy } = pos.coords
              const accepted = applyFix({
                latitude, longitude, altitude, speed, accuracy,
                timestamp: pos.timestamp,
              })
              if (accepted) persistSnapshot()
            },
            () => { /* ignore errors — best effort */ },
            { enableHighAccuracy: true, timeout: 3000 },
          )
        }
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [persistSnapshot, applyFix])

  // Keep refs synced with state for use inside long-lived intervals
  useEffect(() => { durationRef.current = duration }, [duration])
  useEffect(() => { currentPaceRef.current = currentPace }, [currentPace])

  // ── Wake lock ───────────────────────────────────────────────────────────

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch { /* ignore */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && state === 'tracking') {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [state, requestWakeLock])

  // ── GPS tracking ────────────────────────────────────────────────────────

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError(i18n.t('cardioSession.geoNotAvailable'))
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, speed, accuracy } = pos.coords
        const accepted = applyFix({
          latitude, longitude, altitude, speed, accuracy,
          timestamp: pos.timestamp,
        })
        // Solo los fixes aceptados cuentan para el health-check del GPS
        // (mismo criterio que antes de delegar en core).
        if (accepted) lastGpsTimestampRef.current = Date.now()
      },
      (err) => {
        setError(`Error GPS: ${err.message}`)
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    )
  }, [applyFix])

  // Keep ref in sync so startTimer health check can call it without circular deps
  startTrackingRef.current = startTracking

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  // ── Timer helper ────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
      setDuration(elapsed)

      // GPS health check: restart watchPosition if it silently died (with 30s cooldown)
      const now = Date.now()
      if (
        stateRef.current === 'tracking' &&
        document.visibilityState === 'visible' &&
        lastGpsTimestampRef.current > 0 &&
        now - lastGpsTimestampRef.current > 15000 &&
        now - lastGpsRestartRef.current > 30000
      ) {
        lastGpsRestartRef.current = now
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
        }
        startTrackingRef.current()
      }
    }, 1000)
  }, [])

  // ── Session actions ─────────────────────────────────────────────────────

  const start = useCallback((type: CardioActivityType, startProgramId?: string, startProgramDayKey?: string) => {
    setActivityType(type)
    activityTypeRef.current = type
    pointsRef.current = []
    distanceRef.current = 0
    setPointsCount(0)
    setDistance(0)
    setDuration(0)
    setCurrentPace(0)
    setCurrentSpeed(0)
    setCurrentSplit(null)
    setError(null)
    setNote('')
    setGpsAccuracy(null)
    setProgramId(startProgramId || null)
    setProgramDayKey(startProgramDayKey || null)
    pausedDurationRef.current = 0
    startTimeRef.current = Date.now()
    lastSplitKmRef.current = 0
    lastSplitTimeRef.current = Date.now()
    maxSpeedRef.current = 0
    lastGpsTimestampRef.current = 0
    lastGpsRestartRef.current = 0
    kalmanRef.current = null

    setState('tracking')
    stateRef.current = 'tracking'
    startTracking()
    requestWakeLock()
    startTimer()
  }, [startTracking, requestWakeLock, startTimer])

  const pause = useCallback(() => {
    setState('paused')
    stateRef.current = 'paused'
    stopTracking()
    pauseStartRef.current = Date.now()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    persistSnapshot()
  }, [stopTracking, persistSnapshot])

  const resume = useCallback(() => {
    setState('tracking')
    stateRef.current = 'tracking'
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    startTracking()
    requestWakeLock()
    startTimer()
  }, [startTracking, requestWakeLock, startTimer])

  const finish = useCallback(async (note?: string): Promise<CardioSession | null> => {
    stopTracking()
    releaseWakeLock()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setState('finished')
    stateRef.current = 'finished'
    clearStorage()

    // Compute final duration from refs to avoid stale closure
    const finalDuration = stateRef.current === 'finished'
      ? Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
      : 0
    setDuration(finalDuration)

    const points = pointsRef.current
    const { splits, totalDistanceKm: totalDistance } = calculateSplitsAndDistance(points)
    const elevationGain = calculateElevationGain(points)
    const avgPace = finalDuration > 0 && totalDistance > 0 ? (finalDuration / 60) / totalDistance : 0
    const maxPace = calculateMaxPace(points)
    const maxSpeedKmh = calculateMaxSpeed(points)
    const avgSpeedKmh = calculateAvgSpeed(totalDistance, finalDuration)
    const currentActivity = activityTypeRef.current
    const calories = estimateCalories(currentActivity, finalDuration, userWeight)

    const session: CardioSession = {
      activity_type: currentActivity,
      gps_points: points,
      distance_km: Math.round(totalDistance * 100) / 100,
      duration_seconds: finalDuration,
      avg_pace: Math.round(avgPace * 100) / 100,
      elevation_gain: Math.round(elevationGain),
      started_at: new Date(startTimeRef.current).toISOString(),
      finished_at: new Date().toISOString(),
      note,
      calories_burned: calories,
      max_pace: maxPace,
      avg_speed_kmh: avgSpeedKmh,
      max_speed_kmh: maxSpeedKmh,
      splits,
      program: programId || undefined,
      program_day_key: programDayKey || undefined,
    }
    if (programId) {
      session.program = programId
      session.program_day_key = programDayKey || undefined
    }

    if (userId) {
      try {
        const saveData: Record<string, unknown> = {
          user: userId,
          ...session,
        }
        if (programId) saveData.program = programId
        if (programDayKey) saveData.program_day_key = programDayKey
        const { record, points: routePoints } = splitRoute(saveData)
        const saved = await pb.collection('cardio_sessions').create(record)
        session.id = saved.id
        await saveCardioRoute(saved.id, userId, routePoints)
        // Refresh history, stats and recent-activity immediately after save.
        void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
      } catch (e) {
        console.warn('Failed to save cardio session, queuing for retry:', e)
        const saveData: Record<string, unknown> = { user: userId, ...session }
        if (programId) saveData.program = programId
        if (programDayKey) saveData.program_day_key = programDayKey
        pushUnsaved(saveData)
        setUnsavedCount(loadUnsaved().length)
      }
    }

    return session
  }, [stopTracking, releaseWakeLock, userId, userWeight, programId, programDayKey, queryClient])

  const discard = useCallback(() => {
    stopTracking()
    releaseWakeLock()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setState('idle')
    stateRef.current = 'idle'
    clearStorage()
    pointsRef.current = []
    distanceRef.current = 0
    kalmanRef.current = null
    setPointsCount(0)
    setDistance(0)
    setDuration(0)
    setCurrentPace(0)
    setCurrentSpeed(0)
    setCurrentSplit(null)
    setError(null)
    setNote('')
    setGpsAccuracy(null)
    setProgramId(null)
    setProgramDayKey(null)
  }, [stopTracking, releaseWakeLock])

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    if (!userId) return
    try {
      await pb.collection('cardio_sessions').delete(id)
      void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
    } catch (e) {
      console.warn('Failed to delete cardio session:', e)
    }
  }, [userId, queryClient])

  // Persists the note written on the finished-session screen.
  // The session is already saved at this point — this only patches the note field.
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

  // ── Restore session from localStorage on mount ──────────────────────────

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const saved = loadFromStorage()
    if (!saved) return

    // Restore refs
    pointsRef.current = saved.points
    distanceRef.current = saved.distance
    startTimeRef.current = saved.startTime
    lastSplitKmRef.current = saved.lastSplitKm
    lastSplitTimeRef.current = saved.lastSplitTime
    maxSpeedRef.current = saved.maxSpeed

    // Restore state
    setActivityType(saved.activityType)
    activityTypeRef.current = saved.activityType
    setDistance(saved.distance)
    setPointsCount(saved.points.length)

    if (saved.state === 'paused') {
      // Was paused — restore as paused
      pausedDurationRef.current = saved.pausedDuration
      pauseStartRef.current = saved.pauseStart ?? Date.now()
      setState('paused')
      stateRef.current = 'paused'
      // Compute elapsed up to the pause moment
      const elapsed = Math.floor((pauseStartRef.current - saved.startTime - saved.pausedDuration) / 1000)
      setDuration(elapsed)
    } else {
      // Was tracking — account for time spent backgrounded
      pausedDurationRef.current = saved.pausedDuration
      setState('tracking')
      stateRef.current = 'tracking'

      // Recalculate duration including background time
      const elapsed = Math.floor((Date.now() - saved.startTime - saved.pausedDuration) / 1000)
      setDuration(elapsed)

      // Resume GPS + timer
      startTracking()
      requestWakeLock()
      startTimer()
    }
  }, [startTracking, requestWakeLock, startTimer])

  // ── Retry unsaved sessions (mount + online + visibility regained) ────────
  const flushingRef = useRef(false)
  const flushUnsaved = useCallback(async () => {
    if (!userId || flushingRef.current) return
    const queue = loadUnsaved()
    setUnsavedCount(queue.length)
    if (queue.length === 0) return
    flushingRef.current = true
    try {
      const remaining: Record<string, unknown>[] = []
      for (const session of queue) {
        try {
          // La cola sigue guardando la sesión entera, ruta incluida: se parte
          // aquí para que una entrada encolada antes de #299 también funcione.
          const { record, points: routePoints } = splitRoute(session)
          const saved = await pb.collection('cardio_sessions').create(record)
          await saveCardioRoute(saved.id, userId, routePoints)
        } catch {
          remaining.push(session)
        }
      }
      if (remaining.length > 0) {
        try { localStorage.setItem(UNSAVED_KEY, JSON.stringify(remaining)) } catch {}
      } else {
        clearUnsaved()
      }
      setUnsavedCount(remaining.length)
      if (remaining.length < queue.length) {
        void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
      }
    } finally {
      flushingRef.current = false
    }
  }, [userId, queryClient])

  useEffect(() => {
    void flushUnsaved()

    const onOnline = () => void flushUnsaved()
    const onVisible = () => { if (!document.hidden) void flushUnsaved() }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flushUnsaved])

  // ── Cleanup on unmount (e.g., user logs out) ────────────────────────────

  useEffect(() => {
    return () => {
      // Persist one last snapshot before teardown so session can be restored
      persistSnapshot()
      // Stop GPS watch and timer to prevent leaks
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [persistSnapshot])

  const value: CardioSessionContextValue = {
    state, activityType, points: pointsRef, pointsCount, distance, duration,
    currentPace, currentSpeed, currentSplit, error, note, setNote, gpsAccuracy,
    programId, programDayKey,
    start, pause, resume, finish, discard, getHistory, deleteSession, updateSessionNote, unsavedCount,
  }

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
