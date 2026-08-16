import { describe, it, expect } from 'vitest'
import { getFrequentMeals, mealSignature } from './nutrition-frequent'
import type { NutritionEntry } from '../types'

function entry(id: string, names: string[]): NutritionEntry {
  return {
    id,
    mealType: 'almuerzo',
    foods: names.map(name => ({ name, portionAmount: 1, portionUnit: 'g', unitWeightInGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 })),
    totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0,
    loggedAt: '2026-08-16 12:00:00.000Z',
  } as NutritionEntry
}

describe('mealSignature', () => {
  it('ignora el orden de los alimentos', () => {
    expect(mealSignature(entry('a', ['pollo', 'arroz']))).toBe(mealSignature(entry('b', ['arroz', 'pollo'])))
  })
  it('es vacía sin alimentos', () => {
    expect(mealSignature(entry('a', []))).toBe('')
  })
})

describe('getFrequentMeals', () => {
  it('devuelve solo las comidas repetidas, ordenadas por frecuencia, y la primera entry vista de cada grupo', () => {
    const recent = [
      entry('e1', ['pollo', 'arroz']),
      entry('e2', ['avena']),
      entry('e3', ['arroz', 'pollo']),
      entry('e4', ['avena']),
      entry('e5', ['huevo']),
      entry('e6', ['avena']),
    ]
    const result = getFrequentMeals(recent)
    expect(result.map(e => e.id)).toEqual(['e2', 'e1'])
  })

  it('descarta entries sin alimentos y respeta minCount/limit', () => {
    const recent = [
      entry('x', []), entry('y', []),
      entry('a1', ['a']), entry('a2', ['a']), entry('a3', ['a']),
      entry('b1', ['b']), entry('b2', ['b']),
      entry('c1', ['c']),
    ]
    expect(getFrequentMeals(recent).map(e => e.id)).toEqual(['a1', 'b1'])
    expect(getFrequentMeals(recent, { limit: 1 }).map(e => e.id)).toEqual(['a1'])
    expect(getFrequentMeals(recent, { minCount: 1 }).map(e => e.id)).toEqual(['a1', 'b1', 'c1'])
    expect(getFrequentMeals(recent, { minCount: 3 }).map(e => e.id)).toEqual(['a1'])
  })

  it('devuelve [] sin repeticiones', () => {
    expect(getFrequentMeals([entry('a', ['a']), entry('b', ['b'])])).toEqual([])
  })
})
