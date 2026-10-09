import { sessionScopedStorage as store } from '../../platform'
import type { RaceGpsPoint } from '../../types/race'

/**
 * Snapshot de la carrera en curso, para rehidratar el tracker si la página se
 * recarga o la app se reinicia a mitad de carrera (distancia, gps_track,
 * startAtMs) en vez de arrancar de cero y pisar el servidor con 0 km.
 *
 * Usa el almacenamiento con alcance de sesión de la plataforma (web:
 * `sessionStorage`, porque una carrera es de una sola sesión: cerrar la
 * pestaña es abandonar, pero F5 no lo es; móvil: el almacenamiento normal).
 */

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
    store.setItem(KEY, JSON.stringify(payload))
  } catch { /* cuota / modo privado — ignorar */ }
}

export function loadRaceSnapshot(raceId: string): RaceSnapshot | null {
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const snap: RaceSnapshot = JSON.parse(raw)
    if (snap.raceId !== raceId) return null
    if (Date.now() - snap.savedAt > MAX_AGE_MS) {
      store.removeItem(KEY)
      return null
    }
    return snap
  } catch {
    return null
  }
}

export function clearRaceSnapshot(): void {
  try { store.removeItem(KEY) } catch { /* ignore */ }
}
