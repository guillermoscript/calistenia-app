/**
 * Port del CardioSessionContext de apps/web a React Native.
 * Cambios respecto a la web:
 *  - navigator.geolocation.watchPosition → cardio-tracker (expo-location + FGS Android)
 *  - localStorage → syncStorage (caché síncrona sobre AsyncStorage)
 *  - wake lock → expo-keep-awake
 *  - visibilitychange → AppState
 * La lógica de filtrado (accuracy, jitter, gaps, Kalman) es idéntica a la web.
 */
import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode, type MutableRefObject } from 'react'
import { AppState } from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import i18n from 'i18next'
import { useQueryClient } from '@tanstack/react-query'
import { pb } from '@calistenia/core/lib/pocketbase'
import { qk } from '@calistenia/core/lib/query-keys'
import {
  haversineDistance, calculateElevationGain,
  calculateSplitsAndDistance, calculateMaxPace, calculateMaxSpeed, calculateAvgSpeed,
  kalmanUpdate, type KalmanState,
} from '@calistenia/core/lib/geo'
import { estimateCalories } from '@calistenia/core/lib/calories'
import type { GpsPoint, CardioActivityType, CardioSession } from '@calistenia/core/types'

import { syncStorage } from '@/lib/storage'
import { onOnline } from '@/lib/connectivity'
import { haptics } from '@/lib/haptics'
import {
  setCardioFixListener, startCardioTracking, stopCardioTracking,
  requestCardioPermission, type CardioFix,
} from '@/lib/cardio-tracker'
import {
  startCardioLive, updateCardioLive, pauseCardioLive, resumeCardioLive,
  endCardioLive, setCardioLiveActionHandler,
} from '@/lib/cardio-live'
import { syncCardioWidget } from '@/lib/sync-cardio-widget'

// ── Precision tuning (idéntico a web) ───────────────────────────────────────
const MAX_ACCURACY_M = 20
const MIN_POINT_DISTANCE_M = 3

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

// ── Snapshot persistido (restaurar sesión tras matar la app) ────────────────

const STORAGE_KEY = 'calistenia_cardio_active'
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
  programId: string | null
  programDayKey: string | null
}

function saveToStorage(data: PersistedSession) {
  try {
    syncStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

function loadFromStorage(): PersistedSession | null {
  try {
    const raw = syncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: PersistedSession = JSON.parse(raw)
    if (Date.now() - data.startTime > MAX_SESSION_AGE_MS) {
      syncStorage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    syncStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function clearStorage() {
  syncStorage.removeItem(STORAGE_KEY)
}

// ── Cola de sesiones sin guardar (reintento si PB falla) ────────────────────

const UNSAVED_KEY = 'calistenia_cardio_unsaved'
const MAX_UNSAVED = 5

function loadUnsaved(): Record<string, unknown>[] {
  try {
    const raw = syncStorage.getItem(UNSAVED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function pushUnsaved(session: Record<string, unknown>) {
  try {
    const queue = loadUnsaved()
    queue.push(session)
    while (queue.length > MAX_UNSAVED) queue.shift()
    syncStorage.setItem(UNSAVED_KEY, JSON.stringify(queue))
  } catch { /* ignore */ }
}

function clearUnsaved() {
  syncStorage.removeItem(UNSAVED_KEY)
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
  const [unsavedCount, setUnsavedCount] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
  const lastGpsTimestampRef = useRef<number>(0)
  const lastGpsRestartRef = useRef<number>(0)
  const kalmanRef = useRef<KalmanState | null>(null)
  const programIdRef = useRef<string | null>(null)
  const programDayKeyRef = useRef<string | null>(null)
  // programDayKey expuesto como estado para la UI, ref para snapshots
  const [programDayKey, setProgramDayKey] = useState<string | null>(null)

  // ── Snapshot periódico ───────────────────────────────────────────────────

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
      programId: programIdRef.current,
      programDayKey: programDayKeyRef.current,
    })
  }, [])

  useEffect(() => {
    if (state !== 'tracking' && state !== 'paused') return
    const id = setInterval(persistSnapshot, 5000)
    return () => clearInterval(id)
  }, [state, persistSnapshot])

  // Persistir al pasar a background (el FGS sigue trackeando, pero si Android
  // mata el proceso el snapshot permite restaurar)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') persistSnapshot()
    })
    return () => sub.remove()
  }, [persistSnapshot])

  // ── Procesado de fixes GPS (mismo pipeline que la web) ──────────────────

  const processFix = useCallback((fix: CardioFix) => {
    if (stateRef.current !== 'tracking') return
    const { latitude, longitude, altitude, speed, accuracy } = fix
    if (accuracy == null) return
    setGpsAccuracy(accuracy)
    if (accuracy > MAX_ACCURACY_M) return

    const pts = pointsRef.current
    const prevPt = pts.length > 0 ? pts[pts.length - 1] : null
    const timeDiff = prevPt ? (fix.timestamp - prevPt.timestamp) / 1000 : 0
    const isGap = prevPt !== null && timeDiff > 30

    // Reset del Kalman en gaps — la varianza predicha sería enorme y sesgaría
    // el suavizado hacia la posición pre-gap.
    if (isGap) kalmanRef.current = null

    const smoothed = kalmanUpdate(kalmanRef.current, latitude, longitude, accuracy, fix.timestamp)
    kalmanRef.current = smoothed

    const point: GpsPoint = {
      lat: smoothed.lat,
      lng: smoothed.lng,
      alt: altitude ?? undefined,
      timestamp: fix.timestamp,
      speed: speed ?? undefined,
      accuracy,
    }

    if (prevPt) {
      const d = haversineDistance(prevPt.lat, prevPt.lng, point.lat, point.lng)

      if (isGap) {
        const maxSpeed: Record<CardioActivityType, number> = {
          running: 6, walking: 3, cycling: 14,
        }
        const limit = maxSpeed[activityTypeRef.current] ?? 6
        const plausible = timeDiff > 0 && (d / timeDiff) <= limit

        point.gap = true
        if (plausible) {
          const newDist = distanceRef.current + d / 1000
          distanceRef.current = newDist
          setDistance(newDist)
        }
      } else {
        // Filtro de jitter — parado, el GPS rebota dentro del radio de accuracy
        if (d < MIN_POINT_DISTANCE_M) return
        if (timeDiff > 0 && d / timeDiff > 14) return

        const newDist = distanceRef.current + d / 1000
        distanceRef.current = newDist
        setDistance(newDist)
      }

      const currentKm = Math.floor(distanceRef.current)
      if (currentKm > lastSplitKmRef.current) {
        lastSplitKmRef.current = currentKm
        lastSplitTimeRef.current = point.timestamp
        // Km completado — vibración estilo Strava (el teléfono suele ir en el
        // bolsillo/brazalete: la háptica es el único feedback que llega)
        void haptics.success()
      }
      const splitKm = currentKm + 1
      const splitStartTime = lastSplitTimeRef.current || startTimeRef.current
      const splitElapsed = Math.floor((point.timestamp - splitStartTime) / 1000)
      setCurrentSplit({ km: splitKm, elapsed: splitElapsed })
    }

    pts.push(point)
    setPointsCount(pts.length)
    lastGpsTimestampRef.current = Date.now()

    let paceMinKm = 0
    let speedKmh = 0
    if (speed != null && speed > 0.5) {
      paceMinKm = 1000 / 60 / speed
      speedKmh = Math.round(speed * 3.6 * 10) / 10
      setCurrentPace(paceMinKm)
      setCurrentSpeed(speedKmh)
      if (speedKmh > maxSpeedRef.current) {
        maxSpeedRef.current = speedKmh
      }
    }

    // Notificación en vivo: distancia + ritmo (throttled dentro del módulo)
    updateCardioLive({ distanceKm: distanceRef.current, paceMinKm, speedKmh })
  }, [])

  // Listener de módulo registrado una sola vez — procesa lotes del FGS/watch
  useEffect(() => {
    setCardioFixListener((fixes) => {
      for (const f of fixes) processFix(f)
    })
    return () => setCardioFixListener(null)
  }, [processFix])

  const startTracking = useCallback(() => {
    startCardioTracking().catch(() => {
      setError(i18n.t('cardioSession.geoNotAvailable'))
    })
  }, [])

  const stopTracking = useCallback(() => {
    void stopCardioTracking()
  }, [])

  // ── Timer ────────────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
      setDuration(elapsed)

      // Health check: relanzar tracking si murió en silencio (cooldown 30s).
      // Solo con la app activa — Android prohíbe arrancar un FGS desde background.
      const now = Date.now()
      if (
        stateRef.current === 'tracking' &&
        AppState.currentState === 'active' &&
        lastGpsTimestampRef.current > 0 &&
        now - lastGpsTimestampRef.current > 15000 &&
        now - lastGpsRestartRef.current > 30000
      ) {
        lastGpsRestartRef.current = now
        startCardioTracking().catch(() => {})
      }
    }, 1000)
  }, [])

  // ── Acciones de sesión ───────────────────────────────────────────────────

  const start = useCallback(async (type: CardioActivityType, startProgramId?: string, startProgramDayKey?: string): Promise<boolean> => {
    const granted = await requestCardioPermission()
    if (!granted) {
      setError(i18n.t('cardioSession.geoNotAvailable'))
      void haptics.error()
      return false
    }

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
    programIdRef.current = startProgramId || null
    programDayKeyRef.current = startProgramDayKey || null
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
    void haptics.medium()
    // El FGS (notificación) debe arrancar con la app en foreground y permiso
    // ya concedido — mantiene el GPS vivo al bloquear la pantalla
    await startCardioLive(type, startTimeRef.current)
    startTracking()
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
    startTimer()
    return true
  }, [startTracking, startTimer])

  const pause = useCallback(() => {
    setState('paused')
    stateRef.current = 'paused'
    // En el contexto (no en el botón) para que también vibre al pausar desde
    // la notificación con el teléfono bloqueado
    void haptics.medium()
    stopTracking()
    pauseStartRef.current = Date.now()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    void pauseCardioLive()
    persistSnapshot()
  }, [stopTracking, persistSnapshot])

  const resume = useCallback(() => {
    setState('tracking')
    stateRef.current = 'tracking'
    void haptics.medium()
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    startTracking()
    void resumeCardioLive(startTimeRef.current + pausedDurationRef.current)
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
    startTimer()
  }, [startTracking, startTimer])

  // Botones de la notificación → pausar/reanudar la sesión
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
    stopTracking()
    void endCardioLive()
    deactivateKeepAwake(KEEP_AWAKE_TAG)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setState('finished')
    stateRef.current = 'finished'
    void haptics.success()
    clearStorage()

    const finalDuration = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
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
      note: finishNote,
      calories_burned: calories,
      max_pace: maxPace,
      avg_speed_kmh: avgSpeedKmh,
      max_speed_kmh: maxSpeedKmh,
      splits,
      program: programIdRef.current || undefined,
      program_day_key: programDayKeyRef.current || undefined,
    }

    if (userId) {
      const saveData: Record<string, unknown> = { user: userId, ...session }
      try {
        const saved = await pb.collection('cardio_sessions').create(saveData)
        session.id = saved.id
        void syncCardioWidget(userId)
        // Refresca historial cardio, stats y actividad reciente de inmediato.
        void queryClient.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
      } catch (e) {
        console.warn('Failed to save cardio session, queuing for retry:', e)
        pushUnsaved(saveData)
        setUnsavedCount(loadUnsaved().length)
        void haptics.warning()
      }
    }

    return session
  }, [stopTracking, userId, userWeight, queryClient])

  const discard = useCallback(() => {
    stopTracking()
    void endCardioLive()
    deactivateKeepAwake(KEEP_AWAKE_TAG)
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
    programIdRef.current = null
    programDayKeyRef.current = null
  }, [stopTracking])

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
  // al pulsar "parar", así que aquí solo actualizamos el registro existente).
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

  // ── Restaurar sesión persistida al montar ────────────────────────────────

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const saved = loadFromStorage()
    if (!saved) return

    pointsRef.current = saved.points
    distanceRef.current = saved.distance
    startTimeRef.current = saved.startTime
    lastSplitKmRef.current = saved.lastSplitKm
    lastSplitTimeRef.current = saved.lastSplitTime
    maxSpeedRef.current = saved.maxSpeed
    programIdRef.current = saved.programId
    programDayKeyRef.current = saved.programDayKey

    setActivityType(saved.activityType)
    activityTypeRef.current = saved.activityType
    setDistance(saved.distance)
    setPointsCount(saved.points.length)
    setProgramId(saved.programId)
    setProgramDayKey(saved.programDayKey)

    if (saved.state === 'paused') {
      pausedDurationRef.current = saved.pausedDuration
      pauseStartRef.current = saved.pauseStart ?? Date.now()
      setState('paused')
      stateRef.current = 'paused'
      const elapsed = Math.floor((pauseStartRef.current - saved.startTime - saved.pausedDuration) / 1000)
      setDuration(elapsed)
    } else {
      pausedDurationRef.current = saved.pausedDuration
      setState('tracking')
      stateRef.current = 'tracking'
      const elapsed = Math.floor((Date.now() - saved.startTime - saved.pausedDuration) / 1000)
      setDuration(elapsed)
      void startCardioLive(saved.activityType, saved.startTime + saved.pausedDuration)
      startTracking()
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
      startTimer()
    }
  }, [startTracking, startTimer])

  // ── Reintentar sesiones sin guardar ──────────────────────────────────────
  // Triggers: montar, volver a foreground y recuperar conexión. NetInfo no
  // detecta que el PB de dev (adb reverse) se cae al desenchufar el USB, así
  // que el reintento al volver a foreground es el que salva ese caso.
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
          await pb.collection('cardio_sessions').create(session)
        } catch {
          remaining.push(session)
        }
      }
      if (remaining.length > 0) {
        try { syncStorage.setItem(UNSAVED_KEY, JSON.stringify(remaining)) } catch {}
      } else {
        clearUnsaved()
      }
      setUnsavedCount(remaining.length)
      if (remaining.length < queue.length) void syncCardioWidget(userId)
    } finally {
      flushingRef.current = false
    }
  }, [userId])

  useEffect(() => {
    void flushUnsaved()
    void syncCardioWidget(userId)
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void flushUnsaved()
    })
    const offOnline = onOnline(() => void flushUnsaved())
    return () => {
      appStateSub.remove()
      offOnline()
    }
  }, [flushUnsaved, userId])

  // ── Cleanup al desmontar (logout) ────────────────────────────────────────

  useEffect(() => {
    return () => {
      persistSnapshot()
      void stopCardioTracking()
      void endCardioLive()
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      deactivateKeepAwake(KEEP_AWAKE_TAG)
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
