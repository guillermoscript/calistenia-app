/**
 * Snapshot de carrera en curso para rehidratar el tracker si la app se
 * reinicia a mitad de race (distancia, gps_track, startAtMs) en vez de
 * arrancar de cero y pisar el servidor con 0 km.
 * Port del raceSnapshot web: sessionStorage → syncStorage (AsyncStorage).
 */
import { syncStorage } from '@/lib/storage'
import type { RaceGpsPoint } from '@calistenia/core/types/race'

const KEY = 'calistenia_race_snapshot'
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6h — techo duro de rehidratación

export interface RaceSnapshot {
  raceId: string
  participantId: string
  startAtMs: number
  distanceKm: number
  gpsTrack: RaceGpsPoint[]
  savedAt: number
}

export function saveRaceSnapshot(snap: Omit<RaceSnapshot, 'savedAt'>): void {
  try {
    const payload: RaceSnapshot = { ...snap, savedAt: Date.now() }
    syncStorage.setItem(KEY, JSON.stringify(payload))
  } catch { /* ignore */ }
}

export function loadRaceSnapshot(raceId: string): RaceSnapshot | null {
  try {
    const raw = syncStorage.getItem(KEY)
    if (!raw) return null
    const snap: RaceSnapshot = JSON.parse(raw)
    if (snap.raceId !== raceId) return null
    if (Date.now() - snap.savedAt > MAX_AGE_MS) {
      syncStorage.removeItem(KEY)
      return null
    }
    return snap
  } catch {
    return null
  }
}

export function clearRaceSnapshot(): void {
  try { syncStorage.removeItem(KEY) } catch { /* ignore */ }
}
