import { describe, expect, it, beforeEach, vi } from 'vitest'
const mem = new Map<string, string>()
vi.mock('../../platform', () => ({
  storage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  },
}))
import { storage } from '../../platform'
import {
  MEAL_OPTIONS, getDefaultMealType, getLastMealType, getSeedMealType,
  normalizeFoods, setLastMealType, sumFoodTotals,
} from './shared'
import type { FoodItem } from '../../types'

describe('sumFoodTotals', () => {
  it('suma e ignora valores no numéricos', () => {
    const t = sumFoodTotals([
      { calories: 100, protein: 10, carbs: 5, fat: 2 },
      { calories: '50' as unknown as number, protein: undefined as unknown as number, carbs: NaN, fat: 1 },
    ])
    expect(t).toEqual({ calories: 150, protein: 10, carbs: 5, fat: 3 })
  })
  it('lista vacía: ceros', () => {
    expect(sumFoodTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('tipo de comida semilla', () => {
  beforeEach(() => { mem.clear() })

  it('lo último elegido gana a la hora', () => {
    setLastMealType('cena')
    expect(getLastMealType()).toBe('cena')
    expect(getSeedMealType()).toBe('cena')
  })
  it('un valor guardado inválido se ignora', () => {
    storage.setItem('calistenia_last_meal_type', 'brunch')
    expect(getLastMealType()).toBeNull()
    expect(MEAL_OPTIONS.map(o => o.id)).toContain(getSeedMealType())
    expect(MEAL_OPTIONS.map(o => o.id)).toContain(getDefaultMealType())
  })
})

describe('normalizeFoods', () => {
  it('deja intactas las comidas con baseCal100 y tolera null', () => {
    const f = { name: 'x', baseCal100: 100, calories: 100 } as unknown as FoodItem
    expect(normalizeFoods([f])[0]).toBe(f)
    expect(normalizeFoods(null as unknown as FoodItem[])).toEqual([])
  })
})
