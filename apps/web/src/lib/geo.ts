import type { GpsPoint, KmSplit } from '../types'

const R = 6371000 // Earth radius in meters

/**
 * 1D Kalman state for GPS lat/lng smoothing. Treats lat/lng independently —
 * good enough at short distances where the local tangent plane is near-euclidean.
 */
export interface KalmanState {
  lat: number
  lng: number
  variance: number // in m²
  timestamp: number
}

// Process noise std dev (m/s). Covers running/cycling; bigger = trust measurement more.
const PROCESS_NOISE_MPS = 4

export function kalmanUpdate(
  prev: KalmanState | null,
  lat: number,
  lng: number,
  accuracy: number,
  timestamp: number,
): KalmanState {
  const measVar = Math.max(accuracy * accuracy, 1)
  if (!prev) return { lat, lng, variance: measVar, timestamp }
  const dt = Math.max(0, (timestamp - prev.timestamp) / 1000)
  const predVar = prev.variance + (PROCESS_NOISE_MPS * dt) ** 2
  const k = predVar / (predVar + measVar)
  return {
    lat: prev.lat + k * (lat - prev.lat),
    lng: prev.lng + k * (lng - prev.lng),
    variance: (1 - k) * predVar,
    timestamp,
  }
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function calculateTotalDistance(points: GpsPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
  }
  return total / 1000 // km
}

export function calculateElevationGain(points: GpsPoint[]): number {
  let gain = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].alt
    const curr = points[i].alt
    if (prev != null && curr != null && curr > prev) {
      gain += curr - prev
    }
  }
  return gain
}

export function formatPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return '--:--'
  let mins = Math.floor(minPerKm)
  let secs = Math.round((minPerKm - mins) * 60)
  if (secs >= 60) { mins++; secs = 0 }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Calculate km splits and total distance from GPS points in a single pass.
 * Returns both to avoid iterating points twice (splits + totalDistance).
 */
export function calculateSplitsAndDistance(points: GpsPoint[]): { splits: KmSplit[]; totalDistanceKm: number } {
  if (points.length < 2) return { splits: [], totalDistanceKm: 0 }

  const splits: KmSplit[] = []
  let accDistance = 0 // meters
  let splitStartTime = points[0].timestamp
  let currentKm = 1

  for (let i = 1; i < points.length; i++) {
    const d = haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
    accDistance += d

    while (accDistance >= currentKm * 1000) {
      const splitTime = (points[i].timestamp - splitStartTime) / 1000
      const pace = splitTime / 60 // min/km
      splits.push({ km: currentKm, time_seconds: Math.round(splitTime), pace: Math.round(pace * 100) / 100 })
      splitStartTime = points[i].timestamp
      currentKm++
    }
  }

  // Partial last split
  const remainderM = accDistance - (currentKm - 1) * 1000
  if (remainderM > 100 && points.length > 1) {
    const splitTime = (points[points.length - 1].timestamp - splitStartTime) / 1000
    const paceForPartial = (splitTime / 60) / (remainderM / 1000) // normalized to min/km
    splits.push({
      km: Math.round((accDistance / 1000) * 100) / 100,
      time_seconds: Math.round(splitTime),
      pace: Math.round(paceForPartial * 100) / 100,
    })
  }

  return { splits, totalDistanceKm: accDistance / 1000 }
}

/** @deprecated Use calculateSplitsAndDistance for better performance */
export function calculateSplits(points: GpsPoint[]): KmSplit[] {
  return calculateSplitsAndDistance(points).splits
}

/**
 * Best pace using a ~200m sliding window over GPS points.
 * O(n) using pre-computed cumulative distances.
 */
export function calculateMaxPace(points: GpsPoint[]): number {
  if (points.length < 3) return 0

  // Pre-compute cumulative distance array — O(n)
  const cumDist = new Float64Array(points.length)
  for (let i = 1; i < points.length; i++) {
    cumDist[i] = cumDist[i - 1] + haversineDistance(
      points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng
    )
  }

  // Sliding window: advance right pointer until >= 200m from left — O(n)
  let bestPace = Infinity
  let right = 1
  for (let left = 0; left < points.length - 1; left++) {
    while (right < points.length && cumDist[right] - cumDist[left] < 200) right++
    if (right >= points.length) break
    const dist = cumDist[right] - cumDist[left]
    const timeSec = (points[right].timestamp - points[left].timestamp) / 1000
    if (timeSec > 0) {
      const pace = (timeSec / 60) / (dist / 1000) // min/km
      if (pace < bestPace && pace > 0) bestPace = pace
    }
  }

  return bestPace === Infinity ? 0 : Math.round(bestPace * 100) / 100
}

/**
 * Max speed using 3-point moving average of GPS speed values.
 */
export function calculateMaxSpeed(points: GpsPoint[]): number {
  if (points.length < 3) return 0
  let maxSpeed = 0

  for (let i = 1; i < points.length - 1; i++) {
    const s0 = points[i - 1].speed ?? 0
    const s1 = points[i].speed ?? 0
    const s2 = points[i + 1].speed ?? 0
    const avg = (s0 + s1 + s2) / 3
    if (avg > maxSpeed) maxSpeed = avg
  }

  return Math.round(maxSpeed * 3.6 * 10) / 10 // m/s → km/h
}

/**
 * Average speed in km/h.
 */
export function calculateAvgSpeed(distanceKm: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || distanceKm <= 0) return 0
  return Math.round((distanceKm / (durationSeconds / 3600)) * 10) / 10
}

/**
 * Format speed as "25.3 km/h"
 */
export function formatSpeed(kmh: number): string {
  if (!isFinite(kmh) || kmh <= 0) return '--'
  return kmh.toFixed(1)
}

export type TrackQualityGrade = 'good' | 'estimated' | 'poor'

export interface TrackQuality {
  grade: TrackQualityGrade
  gapCount: number
  gapDistanceKm: number
}

export function assessTrackQuality(points: GpsPoint[], totalDistanceKm: number): TrackQuality {
  let gapCount = 0
  let gapDistanceM = 0

  for (let i = 1; i < points.length; i++) {
    if (points[i].gap) {
      gapCount++
      gapDistanceM += haversineDistance(
        points[i - 1].lat, points[i - 1].lng,
        points[i].lat, points[i].lng,
      )
    }
  }

  const gapDistanceKm = gapDistanceM / 1000
  const pointDensity = totalDistanceKm > 0 ? points.length / totalDistanceKm : 0
  const gapRatio = totalDistanceKm > 0 ? gapDistanceKm / totalDistanceKm : 0

  let grade: TrackQualityGrade = 'good'
  if (gapCount > 0 || pointDensity < 10) {
    grade = gapRatio > 0.2 || pointDensity < 3 ? 'poor' : 'estimated'
  }

  return { grade, gapCount, gapDistanceKm: Math.round(gapDistanceKm * 100) / 100 }
}

export function pointsToGPX(points: GpsPoint[], activityType: string): string {
  const trkpts = points
    .map(p => {
      const ele = p.alt != null ? `<ele>${p.alt}</ele>` : ''
      const time = `<time>${new Date(p.timestamp).toISOString()}</time>`
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}${time}</trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CalisteniaApp">
  <trk>
    <name>${activityType} - ${new Date().toLocaleDateString()}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}
