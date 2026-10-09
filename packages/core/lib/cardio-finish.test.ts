import { describe, it, expect } from 'vitest'
import { buildCardioSession } from './cardio-finish'
import type { GpsPoint } from '../types'

const t0 = 1_770_000_000_000

// ~1,11 km hacia el norte en 10 minutos (0,01 grados de latitud).
const route: GpsPoint[] = Array.from({ length: 11 }, (_, i) => ({
  lat: 40 + i * 0.001,
  lng: -3,
  timestamp: t0 + i * 60_000,
  accuracy: 5,
}))

describe('buildCardioSession', () => {
  it('resta la pausa a la duración y redondea los campos', () => {
    const { session, durationSeconds, tooShort } = buildCardioSession({
      activityType: 'running',
      points: route,
      startTime: t0,
      now: t0 + 700_000,
      pausedDuration: 100_000,
      note: 'ok',
      userWeight: 70,
    })
    expect(durationSeconds).toBe(600)
    expect(session.duration_seconds).toBe(600)
    expect(session.distance_km).toBeGreaterThan(1)
    expect(session.avg_pace).toBeCloseTo(Math.round((10 / session.distance_km!) * 100) / 100, 1)
    expect(session.started_at).toBe(new Date(t0).toISOString())
    expect(session.finished_at).toBe(new Date(t0 + 700_000).toISOString())
    expect(session.note).toBe('ok')
    expect(session.calories_burned).toBeGreaterThan(0)
    expect(session.splits?.length).toBeGreaterThanOrEqual(1)
    expect(tooShort).toBe(false)
  })

  it('un start/stop accidental queda marcado como demasiado corto', () => {
    const { tooShort, session } = buildCardioSession({
      activityType: 'walking',
      points: [],
      startTime: t0,
      now: t0 + 2_000,
      pausedDuration: 0,
    })
    expect(tooShort).toBe(true)
    expect(session.avg_pace).toBe(0)
    expect(session.distance_km).toBe(0)
  })

  it('programa vacío o null no se escribe en el registro', () => {
    const a = buildCardioSession({
      activityType: 'running', points: route, startTime: t0, now: t0 + 600_000,
      pausedDuration: 0, programId: null, programDayKey: '',
    }).session
    expect(a.program).toBeUndefined()
    expect(a.program_day_key).toBeUndefined()
    const b = buildCardioSession({
      activityType: 'running', points: route, startTime: t0, now: t0 + 600_000,
      pausedDuration: 0, programId: 'p1', programDayKey: 'd1',
    }).session
    expect(b.program).toBe('p1')
    expect(b.program_day_key).toBe('d1')
  })
})
