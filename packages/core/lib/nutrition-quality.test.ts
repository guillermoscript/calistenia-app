import { describe, it, expect } from 'vitest'
import { computeDailyQualityScore } from './nutrition-quality'
import type { FoodItem, NutritionEntry, QualityScore } from '../types'

const food: FoodItem = {
  name: 'Pollo', portionAmount: 100, portionUnit: 'g', unitWeightInGrams: 1,
  calories: 165, protein: 31, carbs: 0, fat: 3.6,
  baseCal100: 165, baseProt100: 31, baseCarbs100: 0, baseFat100: 3.6,
}

const entry = (over: Partial<NutritionEntry> = {}): NutritionEntry => ({
  mealType: 'almuerzo',
  foods: [food],
  totalCalories: 400,
  totalProtein: 30,
  totalCarbs: 40,
  totalFat: 10,
  loggedAt: '2026-07-08 12:00:00.000Z',
  ...over,
})

describe('computeDailyQualityScore', () => {
  it('sin entries → undefined', () => {
    expect(computeDailyQualityScore([])).toBeUndefined()
  })

  it('un solo meal con score → undefined (no representativo)', () => {
    expect(computeDailyQualityScore([entry({ qualityScore: 'A' })])).toBeUndefined()
  })

  it('dos meals, mismo peso calórico → promedio directo (A=5, C=3 → B=4)', () => {
    const entries = [
      entry({ id: 'e1', qualityScore: 'A', totalCalories: 300 }),
      entry({ id: 'e2', qualityScore: 'C', totalCalories: 300 }),
    ]
    expect(computeDailyQualityScore(entries)).toBe<QualityScore>('B')
  })

  it('pondera por calorías: la comida con más calorías pesa más', () => {
    const entries = [
      entry({ id: 'e1', qualityScore: 'A', totalCalories: 100 }), // 5
      entry({ id: 'e2', qualityScore: 'E', totalCalories: 300 }), // 1
    ]
    // (5*100 + 1*300) / 400 = 2 → D
    expect(computeDailyQualityScore(entries)).toBe<QualityScore>('D')
  })

  it('redondeo .5 hacia arriba (Math.round de JS)', () => {
    const entries = [
      entry({ id: 'e1', qualityScore: 'A', totalCalories: 100 }), // 5
      entry({ id: 'e2', qualityScore: 'B', totalCalories: 100 }), // 4
    ]
    // (5*100 + 4*100) / 200 = 4.5 → Math.round(4.5) = 5 → A
    expect(computeDailyQualityScore(entries)).toBe<QualityScore>('A')
  })

  it('ignora meals sin qualityScore al filtrar, pero cuenta solo los que sí tienen', () => {
    const entries = [
      entry({ id: 'e1', qualityScore: 'A', totalCalories: 200 }),
      entry({ id: 'e2', qualityScore: 'A', totalCalories: 200 }),
      entry({ id: 'e3', qualityScore: undefined, totalCalories: 5000 }), // no cuenta
    ]
    expect(computeDailyQualityScore(entries)).toBe<QualityScore>('A')
  })

  it('suma de calorías puntuadas en 0 → undefined (evita división entre 0)', () => {
    const entries = [
      entry({ id: 'e1', qualityScore: 'A', totalCalories: 0 }),
      entry({ id: 'e2', qualityScore: 'B', totalCalories: 0 }),
    ]
    expect(computeDailyQualityScore(entries)).toBeUndefined()
  })
})
