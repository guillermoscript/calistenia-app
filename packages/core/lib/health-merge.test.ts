import { describe, expect, it } from 'vitest'
import {
  collapseSleepByNight, earliestDay, isDaytimeNap, latestByDay, nightOf, planSleepMerge, planWeightMerge,
  sleepMinutesByWakeDay, sleepQualityFromMinutes,
} from './health-merge'

/** Instante en hora LOCAL del dispositivo, para que el test no dependa de la zona. */
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

describe('collapseSleepByNight', () => {
  it('fecha la noche por el día en que te ACUESTAS, como el registro manual («anoche» = ayer)', () => {
    const days = collapseSleepByNight([
      { startTime: at(2026, 9, 1, 23, 40), endTime: at(2026, 9, 2, 7, 10), awakeMinutes: 25 },
      // acostarse pasada la medianoche sigue siendo la noche del día anterior
      { startTime: at(2026, 9, 4, 1, 45), endTime: at(2026, 9, 4, 6, 30), awakeMinutes: 10 },
    ])
    expect(Object.keys(days).sort()).toEqual(['2026-09-01', '2026-09-03'])
    expect(days['2026-09-01'].asleep).toBe(7 * 60 + 30 - 25)
    expect(days['2026-09-03'].asleep).toBe(4 * 60 + 45 - 10)
  })

  it('un sueño partido es UNA noche: acuesta más temprano, despierta más tarde', () => {
    const days = collapseSleepByNight([
      { startTime: at(2026, 9, 1, 23), endTime: at(2026, 9, 2, 3), awakeMinutes: 10, id: 'a' },
      { startTime: at(2026, 9, 2, 4), endTime: at(2026, 9, 2, 7), awakeMinutes: 5, id: 'b' },
    ])
    expect(Object.keys(days)).toEqual(['2026-09-01'])
    expect(days['2026-09-01'].start).toBe(at(2026, 9, 1, 23))
    expect(days['2026-09-01'].end).toBe(at(2026, 9, 2, 7))
    expect(days['2026-09-01'].asleep).toBe(4 * 60 - 10 + 3 * 60 - 5)
  })

  it('la siesta NO se fusiona con la noche (antes salía «00:30–16:10»)', () => {
    const days = collapseSleepByNight([
      { startTime: at(2026, 9, 5, 0, 30), endTime: at(2026, 9, 5, 6), awakeMinutes: 15, id: 'night' },
      { startTime: at(2026, 9, 5, 15), endTime: at(2026, 9, 5, 16, 10), awakeMinutes: 0, id: 'nap' },
    ])
    expect(Object.keys(days)).toEqual(['2026-09-04'])
    expect(days['2026-09-04']).toMatchObject({ start: at(2026, 9, 5, 0, 30), end: at(2026, 9, 5, 6), asleep: 315, id: 'night' })
  })

  it('una siesta sola no crea la noche de hoy', () => {
    expect(collapseSleepByNight([
      { startTime: at(2026, 9, 5, 14), endTime: at(2026, 9, 5, 15), awakeMinutes: 0 },
    ])).toEqual({})
  })
})

describe('isDaytimeNap / nightOf', () => {
  it('siesta = corta, de día y sin cruzar medianoche', () => {
    expect(isDaytimeNap({ startTime: at(2026, 9, 5, 15), endTime: at(2026, 9, 5, 16, 10) })).toBe(true)
    // sueño de día tras turno de noche: largo, no es siesta
    expect(isDaytimeNap({ startTime: at(2026, 9, 5, 9, 30), endTime: at(2026, 9, 5, 16, 30) })).toBe(false)
    // cabezada que acaba de noche: cuenta para la noche
    expect(isDaytimeNap({ startTime: at(2026, 9, 5, 20, 30), endTime: at(2026, 9, 5, 22) })).toBe(false)
    expect(isDaytimeNap({ startTime: at(2026, 9, 5, 23), endTime: at(2026, 9, 6, 7) })).toBe(false)
  })
  it('nightOf corta a mediodía', () => {
    expect(nightOf(at(2026, 9, 5, 11, 59))).toBe('2026-09-04')
    expect(nightOf(at(2026, 9, 5, 12))).toBe('2026-09-05')
  })
})

describe('sleepMinutesByWakeDay', () => {
  it('el cache diario lleva la noche en el día en que te despiertas, sin la siesta', () => {
    const nights = collapseSleepByNight([
      { startTime: at(2026, 9, 1, 23), endTime: at(2026, 9, 2, 7), awakeMinutes: 30 },
      { startTime: at(2026, 9, 2, 15), endTime: at(2026, 9, 2, 16), awakeMinutes: 0 },
    ])
    expect(sleepMinutesByWakeDay(nights)).toEqual({ '2026-09-02': 450 })
  })
})

describe('planSleepMerge', () => {
  const days = collapseSleepByNight([
    { startTime: at(2026, 9, 1, 23), endTime: at(2026, 9, 2, 7), awakeMinutes: 0, id: 'x' },
    { startTime: at(2026, 9, 2, 23), endTime: at(2026, 9, 3, 7), awakeMinutes: 0 },
    { startTime: at(2026, 9, 3, 23), endTime: at(2026, 9, 4, 7), awakeMinutes: 0 },
  ])

  it('crea los días sin fila, actualiza los nuestros y NUNCA pisa lo manual', () => {
    const ops = planSleepMerge('u1', days, [
      { id: 'm', date: '2026-09-02 00:00:00.000Z', source: 'manual' },
      { id: 'h', date: '2026-09-03 00:00:00.000Z', source: 'health_connect' },
    ])
    expect(ops.map(o => o.kind)).toEqual(['create', 'update'])
    expect(ops[1]).toMatchObject({ kind: 'update', id: 'h' })
    expect(ops[0].payload).toMatchObject({
      user: 'u1', date: '2026-09-01 00:00:00', bedtime: '23:00', wake_time: '07:00',
      duration_minutes: 480, quality: 5, source: 'health_connect', external_id: 'x',
    })
    // Health Connect no sabe los despertares: no se manda un 0 inventado
    expect('awakenings' in ops[0].payload).toBe(false)
  })

  it('una fila sin source (legacy) también se respeta', () => {
    const ops = planSleepMerge('u1', days, [{ id: 'l', date: '2026-09-01', source: undefined }])
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
