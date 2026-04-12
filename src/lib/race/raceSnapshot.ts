import type { RaceGpsPoint } from '../../types/race'

/**
 * Mid-race snapshot persisted to sessionStorage so a page refresh during an
 * active race rehydrates the tracker state (distance, gps_track, startAtMs)
 * instead of restarting from zero and overwriting the server with 0 km.
 *
 * sessionStorage (not localStorage) because a race is a single-session thing:
 * closing the tab is a legitimate quit, but F5 is not.
 */

const KEY = 'calistenia_race_snapshot'
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6h — hard floor on stale rehydrate

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
    sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch { /* quota / private mode — ignore */ }
}

export function loadRaceSnapshot(raceId: string): RaceSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const snap: RaceSnapshot = JSON.parse(raw)
    if (snap.raceId !== raceId) return null
    if (Date.now() - snap.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY)
      return null
    }
    return snap
  } catch {
    return null
  }
}

export function clearRaceSnapshot(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
