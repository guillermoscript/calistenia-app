import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import { processCardioFix, type CardioFixInput, type CardioFixState } from '@calistenia/core/lib/cardio-fix'
import type { KalmanState } from '@calistenia/core/lib/geo'
import type { CardioActivityType, GpsPoint } from '@calistenia/core/types'

/** Parte del pipeline que viaja en el snapshot persistido. */
export interface CardioMetricsSnapshot {
  points: GpsPoint[]
  distance: number
  lastSplitKm: number
  lastSplitTime: number
  maxSpeed: number
}

/** Lo que el caller necesita saber de un fix aceptado (háptica, notificación…). */
export interface AcceptedFix {
  distanceKm: number
  paceMinKm: number
  speedKmh: number
  /** Se cruzó un km nuevo. */
  splitCompleted: boolean
}

interface Options {
  /** El pipeline sólo muta la ruta mientras la sesión está en 'tracking'. */
  isTracking: () => boolean
  getActivityType: () => CardioActivityType
  getStartTime: () => number
}

export interface CardioMetrics {
  /** Ruta acumulada. Se expone como ref: crece a cada fix y copiarla sería caro. */
  points: MutableRefObject<GpsPoint[]>
  pointsCount: number
  distance: number
  currentPace: number
  currentSpeed: number
  currentSplit: { km: number; elapsed: number } | null
  gpsAccuracy: number | null
  /** Pasa un fix por el pipeline. Devuelve null si se ignoró o se rechazó. */
  applyFix: (fix: CardioFixInput) => AcceptedFix | null
  reset: () => void
  restore: (snapshot: CardioMetricsSnapshot) => void
  snapshot: () => CardioMetricsSnapshot
}

/**
 * Estado derivado del GPS de una sesión de cardio: envuelve el pipeline puro
 * `processCardioFix` de core y guarda su estado entre fixes.
 *
 * Todo lo que el pipeline necesita de un fix al siguiente vive en refs, no en
 * estado: durante una sesión entran fixes a ~1 Hz y un `useState` por variable
 * arrastraría un render por cada uno antes de poder leer el valor siguiente.
 */
export function useCardioMetrics({ isTracking, getActivityType, getStartTime }: Options): CardioMetrics {
  const [pointsCount, setPointsCount] = useState(0)
  const [distance, setDistance] = useState(0)
  const [currentPace, setCurrentPace] = useState(0)
  const [currentSpeed, setCurrentSpeed] = useState(0)
  const [currentSplit, setCurrentSplit] = useState<{ km: number; elapsed: number } | null>(null)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)

  const pointsRef = useRef<GpsPoint[]>([])
  const distanceRef = useRef(0)
  const kalmanRef = useRef<KalmanState | null>(null)
  const lastSplitKmRef = useRef(0)
  const lastSplitTimeRef = useRef(0)
  const maxSpeedRef = useRef(0)

  const applyFix = useCallback((fix: CardioFixInput): AcceptedFix | null => {
    // Un fix en vuelo puede llegar después de pause()/finish() (parar el GPS no
    // es instantáneo): fuera de 'tracking' no debe mutar distancia ni ruta.
    if (!isTracking()) return null

    const pts = pointsRef.current
    const fixState: CardioFixState = {
      lastPoint: pts.length > 0 ? pts[pts.length - 1] : null,
      kalman: kalmanRef.current,
      distanceKm: distanceRef.current,
      lastSplitKm: lastSplitKmRef.current,
      lastSplitTime: lastSplitTimeRef.current,
      startTime: getStartTime(),
      maxSpeedKmh: maxSpeedRef.current,
    }

    const result = processCardioFix(fixState, fix, getActivityType())

    if (result.accuracy != null) setGpsAccuracy(result.accuracy)
    if (!result.accepted || !result.point) return null

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

    return {
      distanceKm: result.distanceKm,
      paceMinKm: result.paceMinKm,
      speedKmh: result.speedKmh,
      splitCompleted: result.splitCompleted,
    }
  }, [isTracking, getActivityType, getStartTime])

  const reset = useCallback(() => {
    pointsRef.current = []
    distanceRef.current = 0
    kalmanRef.current = null
    lastSplitKmRef.current = 0
    lastSplitTimeRef.current = Date.now()
    maxSpeedRef.current = 0
    setPointsCount(0)
    setDistance(0)
    setCurrentPace(0)
    setCurrentSpeed(0)
    setCurrentSplit(null)
    setGpsAccuracy(null)
  }, [])

  const restore = useCallback((saved: CardioMetricsSnapshot) => {
    pointsRef.current = saved.points
    distanceRef.current = saved.distance
    lastSplitKmRef.current = saved.lastSplitKm
    lastSplitTimeRef.current = saved.lastSplitTime
    maxSpeedRef.current = saved.maxSpeed
    kalmanRef.current = null
    setPointsCount(saved.points.length)
    setDistance(saved.distance)
  }, [])

  const snapshot = useCallback((): CardioMetricsSnapshot => ({
    points: pointsRef.current,
    distance: distanceRef.current,
    lastSplitKm: lastSplitKmRef.current,
    lastSplitTime: lastSplitTimeRef.current,
    maxSpeed: maxSpeedRef.current,
  }), [])

  return {
    points: pointsRef,
    pointsCount,
    distance,
    currentPace,
    currentSpeed,
    currentSplit,
    gpsAccuracy,
    applyFix,
    reset,
    restore,
    snapshot,
  }
}
