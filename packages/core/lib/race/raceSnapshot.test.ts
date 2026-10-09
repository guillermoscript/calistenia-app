import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initCore, type CoreStorage, type CorePlatform } from '../../platform'
import { saveRaceSnapshot, loadRaceSnapshot, clearRaceSnapshot } from './raceSnapshot'

function memoryStorage(): CoreStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v) },
    removeItem: (k) => { data.delete(k) },
  }
}

function platform(over: Partial<CorePlatform>): CorePlatform {
  return {
    storage: memoryStorage(),
    env: { pbUrl: '', aiApiUrl: '', isDev: true },
    analytics: { track: () => {}, identify: () => {}, clear: () => {} },
    connectivity: { isOnline: () => true, onOnline: () => () => {} },
    ...over,
  }
}

const snap = { raceId: 'r1', participantId: 'p1', startAtMs: 1000, distanceKm: 1.5, gpsTrack: [{ lat: 1, lng: 2, t: 3 }] }

describe('raceSnapshot', () => {
  let local: ReturnType<typeof memoryStorage>
  let session: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    local = memoryStorage()
    session = memoryStorage()
    initCore(platform({ storage: local, sessionStorage: session }))
  })

  it('con almacenamiento de sesión (web) guarda ahí y no en el persistente', () => {
    saveRaceSnapshot(snap)
    expect(session.data.size).toBe(1)
    expect(local.data.size).toBe(0)
    expect(loadRaceSnapshot('r1')?.distanceKm).toBe(1.5)
  })

  it('sin almacenamiento de sesión (móvil) usa el persistente', () => {
    initCore(platform({ storage: local }))
    saveRaceSnapshot(snap)
    expect(local.data.size).toBe(1)
    expect(loadRaceSnapshot('r1')?.gpsTrack).toHaveLength(1)
  })

  it('ignora otra carrera y descarta lo de más de 6 h', () => {
    saveRaceSnapshot(snap)
    expect(loadRaceSnapshot('otra')).toBeNull()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000)
    expect(loadRaceSnapshot('r1')).toBeNull()
    vi.useRealTimers()
    expect(session.data.size).toBe(0)
  })

  it('clearRaceSnapshot lo borra', () => {
    saveRaceSnapshot(snap)
    clearRaceSnapshot()
    expect(loadRaceSnapshot('r1')).toBeNull()
  })
})
