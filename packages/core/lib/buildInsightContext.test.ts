import { describe, it, expect, beforeAll } from 'vitest'
import { initCore } from '../platform'
import { setTimezone } from './dateUtils'
import type { MonthActivity } from './monthActivity'
import type { InsightDayRow } from './buildInsightContext'

// pocketbase.ts (importado transitivamente por monthActivity.ts / buildInsightContext.ts)
// lanza si initCore() no corrió antes — lo simulamos con una plataforma mínima y
// cargamos el resto vía import dinámico para que se evalúe DESPUÉS de esta línea
// (los imports estáticos se evalúan antes que cualquier código de este archivo).
initCore({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  env: { pbUrl: 'http://localhost:8090', aiApiUrl: '', isDev: true },
  analytics: { track: () => {}, identify: () => {}, clear: () => {} },
  connectivity: { isOnline: () => true, onOnline: () => () => {} },
})

const { emptyMonthActivity } = await import('./monthActivity')
const { monthsInRange, mergeMonthActivity, buildDayRows, summarizeRows } = await import('./buildInsightContext')

beforeAll(() => {
  // Determinismo: las fechas de estos tests no deben depender del tz del runner.
  setTimezone('UTC')
})

describe('monthsInRange', () => {
  it('a window inside a single month returns just that month', () => {
    expect(monthsInRange('2026-06-05', '2026-06-20')).toEqual([{ year: 2026, month0: 5 }])
  })

  it('a window spanning two months returns both, in order', () => {
    expect(monthsInRange('2026-06-25', '2026-07-03')).toEqual([
      { year: 2026, month0: 5 },
      { year: 2026, month0: 6 },
    ])
  })

  it('spans a year boundary (December → January)', () => {
    expect(monthsInRange('2025-12-20', '2026-01-05')).toEqual([
      { year: 2025, month0: 11 },
      { year: 2026, month0: 0 },
    ])
  })
})

describe('mergeMonthActivity', () => {
  it('concatenates arrays and merges *ByDate records across months', () => {
    const june = {
      ...emptyMonthActivity(),
      cardio: [{ id: 'c1' }],
      nutritionByDate: { '2026-06-30': { meals: 2, calories: 1500 } },
    } as unknown as MonthActivity
    const july = {
      ...emptyMonthActivity(),
      cardio: [{ id: 'c2' }],
      nutritionByDate: { '2026-07-01': { meals: 3, calories: 2000 } },
    } as unknown as MonthActivity

    const merged = mergeMonthActivity([june, july])

    expect(merged.cardio.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(merged.nutritionByDate).toEqual({
      '2026-06-30': { meals: 2, calories: 1500 },
      '2026-07-01': { meals: 3, calories: 2000 },
    })
  })
})

describe('buildDayRows', () => {
  const merged = {
    cardio: [
      { started_at: '2026-06-26 08:00:00.000Z', distance_km: 5, duration_seconds: 1800 },
      { started_at: '2026-06-26 18:00:00.000Z', distance_km: 3.2, duration_seconds: 1000 },
      // Fuera de la ventana [start, end] → debe quedar excluida.
      { started_at: '2026-06-20 08:00:00.000Z', distance_km: 10, duration_seconds: 3600 },
    ],
    circuits: [{ started_at: '2026-06-27 09:00:00.000Z' }],
    nutritionByDate: { '2026-06-28': { meals: 3, calories: 2200 } },
    waterByDate: { '2026-06-29': { totalMl: 2000 } },
    sleepByDate: { '2026-06-30': { duration_minutes: 420, quality: 4 } },
    weightByDate: { '2026-06-25': { weight_kg: 80.5 }, '2026-07-01': { weight_kg: 79.8 } },
    measurementByDate: {},
    photosByDate: {},
    lumbarByDate: {},
  } as unknown as MonthActivity
  const strengthByDate = { '2026-06-26': { workouts: 1, workoutMinutes: 45 } }
  const watchByDate = { '2026-06-27': { steps: 8000, restingHr: 58 } }

  const rows = buildDayRows(merged, strengthByDate, watchByDate, '2026-06-25', '2026-07-01')
  const byDate = new Map(rows.map((r) => [r.date, r]))

  it('only keeps days within [start, end], sorted ascending', () => {
    expect(rows.map((r) => r.date)).toEqual([
      '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30', '2026-07-01',
    ])
    expect(byDate.has('2026-06-20')).toBe(false) // cardio fuera de rango, excluida
  })

  it('sums multi-session cardio for a day and rounds minutes once at the end', () => {
    const day = byDate.get('2026-06-26')!
    expect(day.cardioSessions).toBe(2)
    expect(day.cardioKm).toBe(8.2)
    expect(day.cardioMinutes).toBe(47) // round((1800+1000)/60) = round(46.67)
    expect(day.workouts).toBe(1)
    expect(day.workoutMinutes).toBe(45)
  })

  it('merges circuit + watch data landing on the same day', () => {
    const day = byDate.get('2026-06-27')!
    expect(day.circuitSessions).toBe(1)
    expect(day.steps).toBe(8000)
    expect(day.restingHr).toBe(58)
  })

  it('carries nutrition, water, sleep and weight through unchanged', () => {
    expect(byDate.get('2026-06-28')).toMatchObject({ meals: 3, calories: 2200 })
    expect(byDate.get('2026-06-29')).toMatchObject({ waterMl: 2000 })
    expect(byDate.get('2026-06-30')).toMatchObject({ sleepMinutes: 420, sleepQuality: 4 })
    expect(byDate.get('2026-06-25')).toMatchObject({ weightKg: 80.5 })
    expect(byDate.get('2026-07-01')).toMatchObject({ weightKg: 79.8 })
  })
})

describe('summarizeRows', () => {
  it('returns all-null/zero aggregates for an empty window (no divide-by-zero)', () => {
    const summary = summarizeRows([], 7, '2026-07-01', false)
    expect(summary.daysWithAnyData).toBe(0)
    expect(summary.workouts).toEqual({ total: 0, daysTrained: 0 })
    expect(summary.nutrition).toEqual({ daysLogged: 0, avgCalories: null, avgMeals: null })
    expect(summary.water).toEqual({ daysLogged: 0, avgMl: null })
    expect(summary.sleep).toEqual({ daysLogged: 0, avgMinutes: null, avgQuality: null })
    expect(summary.weight).toEqual({ firstKg: null, lastKg: null, deltaKg: null })
    expect(summary.watch).toEqual({ available: false, avgSteps: null, avgRestingHr: null, avgHrvMs: null })
    expect(summary.streaks).toEqual({ currentTrainingStreak: 0, longestTrainingStreak: 0 })
  })

  it('aggregates a sparse 10-day window, breaking the streak on a gap day', () => {
    // Racha larga 06-24..06-26 (3 días), un día "gap" (06-27: hay datos pero
    // NO entrenamiento → debe cortar la racha igual), luego un entrenamiento
    // suelto en 06-28, y otro el último día (07-05) que ancla la racha actual.
    const rows: InsightDayRow[] = [
      { date: '2026-06-24', workouts: 1, workoutMinutes: 30, weightKg: 82.0 },
      { date: '2026-06-25', workouts: 1, workoutMinutes: 32, waterMl: 2500 },
      { date: '2026-06-26', workouts: 1, workoutMinutes: 28, sleepMinutes: 400, sleepQuality: 3 },
      { date: '2026-06-27', meals: 2, calories: 1800 }, // gap: sin entrenamiento
      { date: '2026-06-28', workouts: 1, workoutMinutes: 50, steps: 9000, restingHr: 55 },
      { date: '2026-07-05', workouts: 1, workoutMinutes: 40, weightKg: 80.0, steps: 11000, restingHr: 52 },
    ]

    const summary = summarizeRows(rows, 10, '2026-07-05', true)

    expect(summary.daysWithAnyData).toBe(6)
    expect(summary.workouts).toEqual({ total: 5, daysTrained: 5 })
    // Racha más larga = 06-24..06-26 (3); racha actual = solo 07-05 (1),
    // porque 07-04 no aparece en absoluto → cuenta como "sin entrenamiento".
    expect(summary.streaks).toEqual({ currentTrainingStreak: 1, longestTrainingStreak: 3 })
    expect(summary.nutrition).toEqual({ daysLogged: 1, avgCalories: 1800, avgMeals: 2 })
    expect(summary.water).toEqual({ daysLogged: 1, avgMl: 2500 })
    expect(summary.sleep).toEqual({ daysLogged: 1, avgMinutes: 400, avgQuality: 3 })
    expect(summary.weight).toEqual({ firstKg: 82.0, lastKg: 80.0, deltaKg: -2 })
    expect(summary.watch).toEqual({ available: true, avgSteps: 10000, avgRestingHr: 54, avgHrvMs: null }) // round((55+52)/2)
  })

  it('gates watch averages behind watchAvailable even if steps happen to be present', () => {
    const rows: InsightDayRow[] = [{ date: '2026-07-01', steps: 5000 }]
    const summary = summarizeRows(rows, 7, '2026-07-01', false)
    expect(summary.watch).toEqual({ available: false, avgSteps: null, avgRestingHr: null, avgHrvMs: null })
  })
})
