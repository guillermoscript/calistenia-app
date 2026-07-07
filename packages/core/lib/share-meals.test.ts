import { describe, it, expect } from 'vitest'
import { buildShareMeals } from './share-meals'
import type { FoodItem, NutritionEntry } from '../types'

const food = (over: Partial<FoodItem> = {}): FoodItem => ({
  name: 'Manzana', portionAmount: 150, portionUnit: 'g', unitWeightInGrams: 1,
  calories: 80, protein: 1, carbs: 20, fat: 0,
  baseCal100: 53, baseProt100: 0.7, baseCarbs100: 13, baseFat100: 0,
  ...over,
})

const entry = (over: Partial<NutritionEntry> = {}): NutritionEntry => ({
  mealType: 'desayuno',
  foods: [food()],
  totalCalories: 300,
  totalProtein: 20,
  totalCarbs: 30,
  totalFat: 10,
  loggedAt: '2026-07-08 08:00:00.000Z',
  ...over,
})

describe('buildShareMeals', () => {
  it('array vacío → meals vacío y overflow 0', () => {
    expect(buildShareMeals([])).toEqual({ meals: [], overflow: 0 })
  })

  it('mapea campos básicos y redondea macros', () => {
    const entries = [entry({ totalCalories: 300.4, totalProtein: 20.6, totalCarbs: 29.5, totalFat: 9.5 })]
    const { meals } = buildShareMeals(entries)
    expect(meals[0]).toMatchObject({ calories: 300, protein: 21, carbs: 30, fat: 10 })
  })

  it('ordena ascendente por eatenAt, con fallback a loggedAt', () => {
    const entries = [
      entry({ id: 'cena', mealType: 'cena', loggedAt: '2026-07-08 20:00:00.000Z' }),
      entry({ id: 'desayuno', mealType: 'desayuno', eatenAt: '2026-07-08 08:00:00.000Z', loggedAt: '2026-07-08 08:05:00.000Z' }),
      entry({ id: 'almuerzo', mealType: 'almuerzo', eatenAt: '2026-07-08 13:00:00.000Z' }),
    ]
    const { meals } = buildShareMeals(entries)
    expect(meals.map((m) => m.mealType)).toEqual(['desayuno', 'almuerzo', 'cena'])
  })

  it('respeta max por defecto (4) y reporta overflow', () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      entry({ id: `e${i}`, loggedAt: `2026-07-08 0${i}:00:00.000Z` }),
    )
    const { meals, overflow } = buildShareMeals(entries)
    expect(meals).toHaveLength(4)
    expect(overflow).toBe(2)
  })

  it('max personalizado limita la cantidad de meals', () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      entry({ id: `e${i}`, loggedAt: `2026-07-08 0${i}:00:00.000Z` }),
    )
    const { meals, overflow } = buildShareMeals(entries, 2)
    expect(meals).toHaveLength(2)
    expect(overflow).toBe(1)
  })

  it('título: un solo food usa el nombre tal cual', () => {
    const { meals } = buildShareMeals([entry({ foods: [food({ name: 'Avena' })] })])
    expect(meals[0].title).toBe('Avena')
  })

  it('título: varios foods usa el primero + contador de los restantes', () => {
    const { meals } = buildShareMeals([
      entry({ foods: [food({ name: 'Avena' }), food({ name: 'Leche' }), food({ name: 'Plátano' })] }),
    ])
    expect(meals[0].title).toBe('Avena +2')
  })

  it('título: sin foods → string vacío', () => {
    const { meals } = buildShareMeals([entry({ foods: [] })])
    expect(meals[0].title).toBe('')
  })

  it('photoUrl toma la primera foto cuando existe', () => {
    const { meals } = buildShareMeals([entry({ photoUrls: ['foto1.jpg', 'foto2.jpg'] })])
    expect(meals[0].photoUrl).toBe('foto1.jpg')
  })

  it('sin fotos → photoUrl undefined', () => {
    const { meals } = buildShareMeals([entry({ photoUrls: undefined })])
    expect(meals[0].photoUrl).toBeUndefined()
  })

  it('photoUrls vacío ([]) → photoUrl undefined', () => {
    const { meals } = buildShareMeals([entry({ photoUrls: [] })])
    expect(meals[0].photoUrl).toBeUndefined()
  })

  it('propaga qualityScore (incluyendo undefined)', () => {
    const { meals } = buildShareMeals([entry({ qualityScore: 'B' }), entry({ id: 'sin-score', qualityScore: undefined })])
    expect(meals[0].qualityScore).toBe('B')
    expect(meals[1].qualityScore).toBeUndefined()
  })
})
