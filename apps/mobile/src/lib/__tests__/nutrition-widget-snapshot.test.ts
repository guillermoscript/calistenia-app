import { describe, it, expect } from 'vitest'
import { rolloverSnapshot, type NutritionWidgetSnapshot } from '../nutrition-widget-snapshot'

const base: NutritionWidgetSnapshot = {
  date: '2026-06-12',
  calories: 1450,
  protein: 90,
  carbs: 140,
  fat: 50,
  calorieGoal: 2200,
  proteinGoal: 160,
  carbsGoal: 220,
  fatGoal: 70,
  mealStreak: 5,
  mealStreakToday: true,
  lang: 'es',
  tz: 'America/New_York',
}

describe('rolloverSnapshot', () => {
  it('null pasa como null', () => {
    expect(rolloverSnapshot(null, '2026-06-13')).toBeNull()
  })

  it('mismo día: devuelve el snapshot intacto', () => {
    expect(rolloverSnapshot(base, '2026-06-12')).toBe(base)
  })

  it('día nuevo: reinicia consumo a 0, conserva metas', () => {
    const r = rolloverSnapshot(base, '2026-06-13')!
    expect(r.date).toBe('2026-06-13')
    expect(r.calories).toBe(0)
    expect(r.protein).toBe(0)
    expect(r.carbs).toBe(0)
    expect(r.fat).toBe(0)
    // metas + lang + tz intactas
    expect(r.calorieGoal).toBe(2200)
    expect(r.proteinGoal).toBe(160)
    expect(r.carbsGoal).toBe(220)
    expect(r.fatGoal).toBe(70)
    expect(r.lang).toBe('es')
    expect(r.tz).toBe('America/New_York')
  })

  it('fecha futura (desfase reloj/tz): no toca datos', () => {
    expect(rolloverSnapshot(base, '2026-06-11')).toBe(base)
  })

  it('día nuevo: mealStreak se conserva (no es consumo diario), mealStreakToday se apaga', () => {
    const r = rolloverSnapshot(base, '2026-06-13')!
    expect(r.mealStreak).toBe(5)
    expect(r.mealStreakToday).toBe(false)
  })

  it('mismo día: mealStreak y mealStreakToday intactos', () => {
    const r = rolloverSnapshot(base, '2026-06-12')!
    expect(r.mealStreak).toBe(5)
    expect(r.mealStreakToday).toBe(true)
  })
})
