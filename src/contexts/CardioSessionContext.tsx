import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { pb } from '../lib/pocketbase'
import {
  haversineDistance, calculateElevationGain,
  calculateSplitsAndDistance, calculateMaxPace, calculateMaxSpeed, calculateAvgSpeed,
} from '../lib/geo'
import { estimateCalories } from '../lib/calories'
import type { GpsPoint, CardioActivityType, CardioSession } from '../types'

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
}

const CardioSessionContext = createContext<CardioSessionContextValue | null>(null)

// ── localStorage backup key ──────────────────────────────────────────────────

const STORAGE_KEY = 'calistenia_cardio_active'
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

// ── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null
  userWeight?: number
  children: ReactNode
}

export function CardioSessionProvider({ userId, userWeight, children }: Props) {
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
  const restoredRef = useRef(false)
  const stateRef = useRef<SessionState>('idle')
  const activityTypeRef = useRef<CardioActivityType>('running')

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

  // Also persist on visibility change (user switches app / locks screen)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') persistSnapshot()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [persistSnapshot])

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
      setError('Geolocalización no disponible')
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, speed, accuracy } = pos.coords
        setGpsAccuracy(accuracy)
        if (accuracy > 30) return

        const point: GpsPoint = {
          lat: latitude,
          lng: longitude,
          alt: altitude ?? undefined,
          timestamp: pos.timestamp,
          speed: speed ?? undefined,
          accuracy,
        }

        const pts = pointsRef.current
        if (pts.length > 0) {
          const last = pts[pts.length - 1]
          const d = haversineDistance(last.lat, last.lng, point.lat, point.lng)
          const timeDiff = (point.timestamp - last.timestamp) / 1000
          if (timeDiff > 0 && d / timeDiff > 14) return

          const newDist = distanceRef.current + d / 1000
          distanceRef.current = newDist
          setDistance(newDist)

          const currentKm = Math.floor(newDist)
          if (currentKm > lastSplitKmRef.current) {
            lastSplitKmRef.current = currentKm
            lastSplitTimeRef.current = point.timestamp
          }
          const splitKm = currentKm + 1
          const splitStartTime = lastSplitTimeRef.current || startTimeRef.current
          const splitElapsed = Math.floor((point.timestamp - splitStartTime) / 1000)
          setCurrentSplit({ km: splitKm, elapsed: splitElapsed })
        }

        pts.push(point)
        setPointsCount(pts.length)

        if (speed != null && speed > 0.5) {
          setCurrentPace(1000 / 60 / speed)
          const speedKmh = speed * 3.6
          setCurrentSpeed(Math.round(speedKmh * 10) / 10)
          if (speedKmh > maxSpeedRef.current) {
            maxSpeedRef.current = speedKmh
          }
        }
      },
      (err) => {
        setError(`Error GPS: ${err.message}`)
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    )
  }, [])

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
        const saved = await pb.collection('cardio_sessions').create(saveData)
        session.id = saved.id
      } catch (e) {
        console.warn('Failed to save cardio session:', e)
      }
    }

    return session
  }, [stopTracking, releaseWakeLock, userId, userWeight, programId, programDayKey])

  const discard = useCallback(() => {
    stopTracking()
    releaseWakeLock()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setState('idle')
    stateRef.current = 'idle'
    clearStorage()
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
    setProgramId(null)
    setProgramDayKey(null)
  }, [stopTracking, releaseWakeLock])

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    if (!userId) return
    try {
      await pb.collection('cardio_sessions').delete(id)
    } catch (e) {
      console.warn('Failed to delete cardio session:', e)
    }
  }, [userId])

  const getHistory = useCallback(async (limit = 20): Promise<CardioSession[]> => {
    if (!userId) return []
    try {
      const res = await pb.collection('cardio_sessions').getList(1, limit, {
        filter: pb.filter('user = {:userId}', { userId }),
        sort: '-started_at',
      })
      return res.items.map((r: any) => ({
        id: r.id,
        user: r.user,
        activity_type: r.activity_type,
        gps_points: r.gps_points || [],
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
      }))
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
    start, pause, resume, finish, discard, getHistory, deleteSession,
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
