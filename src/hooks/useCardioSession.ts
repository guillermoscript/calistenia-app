import { useState, useRef, useCallback, useEffect } from 'react'
import { pb } from '../lib/pocketbase'
import {
  haversineDistance, calculateElevationGain,
  calculateSplitsAndDistance, calculateMaxPace, calculateMaxSpeed, calculateAvgSpeed,
} from '../lib/geo'
import { estimateCalories } from '../lib/calories'
import type { GpsPoint, CardioActivityType, CardioSession } from '../types'

type SessionState = 'idle' | 'tracking' | 'paused' | 'finished'

export function useCardioSession(userId: string | null, userWeight?: number) {
  const [state, setState] = useState<SessionState>('idle')
  const [activityType, setActivityType] = useState<CardioActivityType>('running')
  const [distance, setDistance] = useState(0) // km
  const [duration, setDuration] = useState(0) // seconds
  const [currentPace, setCurrentPace] = useState(0) // min/km
  const [currentSpeed, setCurrentSpeed] = useState(0) // km/h
  const [currentSplit, setCurrentSplit] = useState<{ km: number; elapsed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Expose points length for UI conditionals without re-rendering on every point
  const [pointsCount, setPointsCount] = useState(0)

  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)
  const pauseStartRef = useRef<number>(0)
  const lastSplitKmRef = useRef<number>(0)
  const lastSplitTimeRef = useRef<number>(0)
  const maxSpeedRef = useRef<number>(0)
  // Store GPS points in a ref to avoid re-renders on every point addition
  const pointsRef = useRef<GpsPoint[]>([])
  const distanceRef = useRef<number>(0)

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

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocalización no disponible')
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, speed, accuracy } = pos.coords
        // Filter noisy points
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
          // Filter teleportation (> 50 km/h = ~14 m/s)
          const timeDiff = (point.timestamp - last.timestamp) / 1000
          if (timeDiff > 0 && d / timeDiff > 14) return // discard point

          const newDist = distanceRef.current + d / 1000
          distanceRef.current = newDist
          setDistance(newDist)

          // Track split crossings
          const currentKm = Math.floor(newDist)
          if (currentKm > lastSplitKmRef.current) {
            lastSplitKmRef.current = currentKm
            lastSplitTimeRef.current = point.timestamp
          }
          // Update current split indicator
          const splitKm = currentKm + 1
          const splitStartTime = lastSplitTimeRef.current || startTimeRef.current
          const splitElapsed = Math.floor((point.timestamp - splitStartTime) / 1000)
          setCurrentSplit({ km: splitKm, elapsed: splitElapsed })
        }

        // Mutate array directly (ref, not state) — avoids O(n) copy per point
        pts.push(point)
        setPointsCount(pts.length)

        // Update pace and speed from GPS speed
        if (speed != null && speed > 0.5) {
          setCurrentPace(1000 / 60 / speed) // min/km
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

  const start = useCallback((type: CardioActivityType) => {
    setActivityType(type)
    pointsRef.current = []
    distanceRef.current = 0
    setPointsCount(0)
    setDistance(0)
    setDuration(0)
    setCurrentPace(0)
    setCurrentSpeed(0)
    setCurrentSplit(null)
    setError(null)
    pausedDurationRef.current = 0
    startTimeRef.current = Date.now()
    lastSplitKmRef.current = 0
    lastSplitTimeRef.current = Date.now()
    maxSpeedRef.current = 0

    setState('tracking')
    startTracking()
    requestWakeLock()

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
      setDuration(elapsed)
    }, 1000)
  }, [startTracking, requestWakeLock])

  const pause = useCallback(() => {
    setState('paused')
    stopTracking()
    pauseStartRef.current = Date.now()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [stopTracking])

  const resume = useCallback(() => {
    setState('tracking')
    pausedDurationRef.current += Date.now() - pauseStartRef.current
    startTracking()
    requestWakeLock()

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000)
      setDuration(elapsed)
    }, 1000)
  }, [startTracking, requestWakeLock])

  const finish = useCallback(async (note?: string): Promise<CardioSession | null> => {
    stopTracking()
    releaseWakeLock()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setState('finished')

    const points = pointsRef.current
    // Single pass for splits + total distance (avoids iterating points twice)
    const { splits, totalDistanceKm: totalDistance } = calculateSplitsAndDistance(points)
    const elevationGain = calculateElevationGain(points)
    const avgPace = duration > 0 && totalDistance > 0 ? (duration / 60) / totalDistance : 0
    const maxPace = calculateMaxPace(points)
    const maxSpeedKmh = calculateMaxSpeed(points)
    const avgSpeedKmh = calculateAvgSpeed(totalDistance, duration)
    const calories = estimateCalories(activityType, duration, userWeight)

    const session: CardioSession = {
      activity_type: activityType,
      gps_points: points,
      distance_km: Math.round(totalDistance * 100) / 100,
      duration_seconds: duration,
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
    }

    if (userId) {
      try {
        const saved = await pb.collection('cardio_sessions').create({
          user: userId,
          ...session,
        })
        session.id = saved.id
      } catch (e) {
        console.warn('Failed to save cardio session:', e)
      }
    }

    return session
  }, [stopTracking, releaseWakeLock, duration, activityType, userId, userWeight])

  const discard = useCallback(() => {
    stopTracking()
    releaseWakeLock()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setState('idle')
    pointsRef.current = []
    distanceRef.current = 0
    setPointsCount(0)
    setDistance(0)
    setDuration(0)
    setCurrentPace(0)
    setCurrentSpeed(0)
    setCurrentSplit(null)
    setError(null)
  }, [stopTracking, releaseWakeLock])

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking()
      releaseWakeLock()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [stopTracking, releaseWakeLock])

  return {
    state, activityType, points: pointsRef, pointsCount, distance, duration,
    currentPace, currentSpeed, currentSplit, error,
    start, pause, resume, finish, discard, getHistory,
  }
}
