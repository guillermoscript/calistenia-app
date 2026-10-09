import { describe, expect, it } from 'vitest'
import {
  collapseSleepByDay, earliestDay, latestByDay, planSleepMerge, planWeightMerge,
  sleepQualityFromMinutes,
} from './health-merge'

/** Instante en hora LOCAL del dispositivo, para que el test no dependa de la zona. */
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

describe('collapseSleepByDay', () => {
  it('une sesiones del mismo día de despertar: acuesta más temprano, despierta más tarde', () => {
    const days = collapseSleepByDay([
      { startTime: at(2026, 9, 1, 23), endTime: at(2026, 9, 2, 3), awakeMinutes: 10, id: 'a' },
      { startTime: at(2026, 9, 2, 4), endTime: at(2026, 9, 2, 7), awakeMinutes: 5, id: 'b' },
    ])
    expect(Object.keys(days)).toEqual(['2026-09-02'])
    expect(days['2026-09-02'].start).toBe(at(2026, 9, 1, 23))
    expect(days['2026-09-02'].end).toBe(at(2026, 9, 2, 7))
    expect(days['2026-09-02'].asleep).toBe(4 * 60 - 10 + 3 * 60 - 5)
  })
})

describe('planSleepMerge', () => {
  const days = collapseSleepByDay([
    { startTime: at(2026, 9, 1, 23), endTime: at(2026, 9, 2, 7), awakeMinutes: 0, id: 'x' },
    { startTime: at(2026, 9, 2, 23), endTime: at(2026, 9, 3, 7), awakeMinutes: 0 },
    { startTime: at(2026, 9, 3, 23), endTime: at(2026, 9, 4, 7), awakeMinutes: 0 },
  ])

  it('crea los días sin fila, actualiza los nuestros y NUNCA pisa lo manual', () => {
    const ops = planSleepMerge('u1', days, [
      { id: 'm', date: '2026-09-03 00:00:00.000Z', source: 'manual' },
      { id: 'h', date: '2026-09-04 00:00:00.000Z', source: 'health_connect' },
    ])
    expect(ops.map(o => o.kind)).toEqual(['create', 'update'])
    expect(ops[1]).toMatchObject({ kind: 'update', id: 'h' })
    expect(ops[0].payload).toMatchObject({
      user: 'u1', date: '2026-09-02 00:00:00', bedtime: '23:00', wake_time: '07:00',
      duration_minutes: 480, quality: 5, source: 'health_connect', external_id: 'x',
    })
  })

  it('una fila sin source (legacy) también se respeta', () => {
    const ops = planSleepMerge('u1', days, [{ id: 'l', date: '2026-09-02', source: undefined }])
    expect(ops.some(o => o.kind === 'update')).toBe(false)
    expect(ops).toHaveLength(2)
  })
})

describe('planWeightMerge', () => {
  it('omite grasa corporal ausente y respeta lo manual', () => {
    const ops = planWeightMerge('u1', { '2026-09-01': 70.5, '2026-09-02': 71 }, { '2026-09-01': 15 }, [
      { id: 'm', date: '2026-09-02 00:00:00.000Z', source: 'manual' },
    ])
    expect(ops).toHaveLength(1)
    expect(ops[0].payload).toEqual({
      user: 'u1', date: '2026-09-01 00:00:00', weight_kg: 70.5, body_fat_pct: 15, source: 'health_connect',
    })
    const noFat = planWeightMerge('u1', { '2026-09-05': 70 }, {}, [])
    expect('body_fat_pct' in noFat[0].payload).toBe(false)
  })
})

describe('helpers', () => {
  it('latestByDay se queda con la última lectura del día', () => {
    expect(latestByDay([
      { time: at(2026, 9, 1, 8), kg: 70.04 }, { time: at(2026, 9, 1, 20), kg: 69.96 },
    ], s => s.kg)).toEqual({ '2026-09-01': 70 })
  })
  it('earliestDay y calidad de sueño', () => {
    expect(earliestDay([])).toBeNull()
    expect(earliestDay(['2026-09-03', '2026-09-01'])).toBe('2026-09-01')
    expect(sleepQualityFromMinutes(8 * 60)).toBe(5)
    expect(sleepQualityFromMinutes(3 * 60)).toBe(1)
  })
})
