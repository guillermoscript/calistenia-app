import { describe, it, expect } from 'vitest'
import {
  parsePortionString,
  normalizeToBase100,
  calcMacros,
  migrateLegacyFood,
  createEmptyFood,
} from './macro-calc'
import type { FoodItem } from '../types'

const food = (over: Partial<FoodItem> = {}): FoodItem => ({
  name: 'Pollo', portionAmount: 100, portionUnit: 'g', unitWeightInGrams: 1,
  calories: 100, protein: 20, carbs: 0, fat: 2,
  baseCal100: 100, baseProt100: 20, baseCarbs100: 0, baseFat100: 2,
  ...over,
})

describe('parsePortionString', () => {
  it('gramos simples "100g"', () => {
    expect(parsePortionString('100g')).toEqual({ amount: 100, unit: 'g' })
  })

  it('mililitros "250ml"', () => {
    expect(parsePortionString('250ml')).toEqual({ amount: 250, unit: 'ml' })
  })

  it('unidades "2 unidad" / "3 unidades"', () => {
    expect(parsePortionString('2 unidad')).toEqual({ amount: 2, unit: 'unidad' })
    expect(parsePortionString('3 unidades')).toEqual({ amount: 3, unit: 'unidad' })
  })

  it('kilogramos "1.5kg"', () => {
    expect(parsePortionString('1.5kg')).toEqual({ amount: 1.5, unit: 'kg' })
  })

  it('decimal con coma "1,5 kg" → se interpreta como punto', () => {
    expect(parsePortionString('1,5 kg')).toEqual({ amount: 1.5, unit: 'kg' })
  })

  it('litros escritos como palabra "3 litros"', () => {
    expect(parsePortionString('3 litros')).toEqual({ amount: 3, unit: 'L' })
  })

  it('gramos escritos como palabra "175 gramos"', () => {
    expect(parsePortionString('175 gramos')).toEqual({ amount: 175, unit: 'g' })
  })

  it('onzas "6oz"', () => {
    expect(parsePortionString('6oz')).toEqual({ amount: 6, unit: 'oz' })
  })

  it('sin número reconocible → default 100g', () => {
    expect(parsePortionString('gramos')).toEqual({ amount: 100, unit: 'g' })
    expect(parsePortionString('')).toEqual({ amount: 100, unit: 'g' })
  })

  // OJO: parseFloat('0') es 0, y `0 || 100` cae al default 100 porque 0 es
  // falsy en JS. Un porción explícita de "0g" NO da amount:0, da amount:100.
  it('OJO: "0g" no respeta el 0 explícito, cae al default 100', () => {
    expect(parsePortionString('0g')).toEqual({ amount: 100, unit: 'g' })
  })
})

describe('normalizeToBase100', () => {
  it('calcula base/100g a partir de la porción actual', () => {
    const f = food({ portionAmount: 200, unitWeightInGrams: 1, calories: 200, protein: 40, carbs: 10, fat: 4 })
    const result = normalizeToBase100(f)
    expect(result.baseCal100).toBe(100)
    expect(result.baseProt100).toBe(20)
    expect(result.baseCarbs100).toBe(5)
    expect(result.baseFat100).toBe(2)
  })

  it('respeta el peso por unidad (p.ej. kg) al calcular los gramos totales', () => {
    const f = food({ portionAmount: 0.2, portionUnit: 'kg', unitWeightInGrams: 1000, calories: 200 })
    const result = normalizeToBase100(f)
    // 0.2 * 1000 = 200g totales → factor 0.5 → 100 base
    expect(result.baseCal100).toBe(100)
  })

  it('portionAmount 0 → totalGrams<=0 → devuelve el food SIN modificar', () => {
    const f = food({ portionAmount: 0 })
    expect(normalizeToBase100(f)).toBe(f)
  })

  it('unitWeightInGrams 0 → totalGrams<=0 → devuelve el food sin modificar', () => {
    const f = food({ unitWeightInGrams: 0 })
    expect(normalizeToBase100(f)).toBe(f)
  })

  it('valores negativos se coercionan a 0 vía safe()', () => {
    const f = food({ portionAmount: -50 })
    expect(normalizeToBase100(f)).toBe(f)
  })

  it('acepta strings numéricos (datos de IA) sin romperse', () => {
    const f = food({ portionAmount: '200' as unknown as number, calories: '200' as unknown as number })
    const result = normalizeToBase100(f)
    expect(result.baseCal100).toBe(100)
  })
})

describe('calcMacros', () => {
  it('calcula macros de la porción actual a partir de base/100g', () => {
    const f = food({ baseCal100: 100, baseProt100: 20, baseCarbs100: 5, baseFat100: 2, portionAmount: 250, unitWeightInGrams: 1 })
    const result = calcMacros(f)
    expect(result.calories).toBe(250)
    expect(result.protein).toBe(50)
    expect(result.carbs).toBe(12.5)
    expect(result.fat).toBe(5)
  })

  it('portionAmount 0 → todos los macros en 0 (a diferencia de normalizeToBase100, no hay early-return)', () => {
    const f = food({ baseCal100: 100, portionAmount: 0 })
    const result = calcMacros(f)
    expect(result.calories).toBe(0)
    expect(result.protein).toBe(0)
  })

  it('sin base cargada (0) → macros en 0 aunque haya porción', () => {
    const f = food({ baseCal100: 0, baseProt100: 0, baseCarbs100: 0, baseFat100: 0, portionAmount: 300 })
    const result = calcMacros(f)
    expect(result).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('migrateLegacyFood', () => {
  it('parsea portion string y calcula base/100g', () => {
    const result = migrateLegacyFood({
      name: 'Arroz', portion: '150g', calories: 195, protein: 4, carbs: 42, fat: 0.5,
    })
    expect(result.name).toBe('Arroz')
    expect(result.portionAmount).toBe(150)
    expect(result.portionUnit).toBe('g')
    expect(result.unitWeightInGrams).toBe(1)
    // base/100g: factor 100/150
    expect(result.baseCal100).toBeCloseTo(130, 1)
  })

  it('portionGrams de la IA tiene prioridad sobre el string parseado', () => {
    const result = migrateLegacyFood({
      name: 'Arroz', portion: '150g', portionGrams: 180, calories: 234, protein: 4.8, carbs: 50.4, fat: 0.6,
    })
    expect(result.portionAmount).toBe(180)
  })

  it('portionGrams 0 o negativo se ignora, usa el string parseado', () => {
    const result = migrateLegacyFood({
      name: 'Arroz', portion: '150g', portionGrams: 0, calories: 195, protein: 4, carbs: 42, fat: 0.5,
    })
    expect(result.portionAmount).toBe(150)
  })

  it('sin portion string → default "100g"', () => {
    const result = migrateLegacyFood({ name: 'Manzana', calories: 52, protein: 0.3, carbs: 14, fat: 0.2 })
    expect(result.portionAmount).toBe(100)
    expect(result.portionUnit).toBe('g')
  })

  it('propaga category, tags y portionNote', () => {
    const result = migrateLegacyFood({
      name: 'Manzana', calories: 52, protein: 0.3, carbs: 14, fat: 0.2,
      category: 'frutas', tags: ['fresco'], portionNote: 'una manzana mediana',
    } as never)
    expect(result.category).toBe('frutas')
    expect(result.tags).toEqual(['fresco'])
    expect(result.portionNote).toBe('una manzana mediana')
  })

  it('macros negativos o no numéricos se coercionan a 0 vía safe()', () => {
    const result = migrateLegacyFood({
      name: 'X', calories: -5, protein: NaN as unknown as number, carbs: 10, fat: 1,
    })
    expect(result.calories).toBe(0)
    expect(result.protein).toBe(0)
  })
})

describe('createEmptyFood', () => {
  it('devuelve un FoodItem vacío listo para entrada manual', () => {
    expect(createEmptyFood()).toEqual({
      name: '', portionAmount: 100, portionUnit: 'g', unitWeightInGrams: 1,
      calories: 0, protein: 0, carbs: 0, fat: 0,
      baseCal100: 0, baseProt100: 0, baseCarbs100: 0, baseFat100: 0,
    })
  })
})
