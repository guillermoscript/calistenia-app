import type { FoodItem, PortionUnit } from '../types'
import { UNIT_WEIGHT_GRAMS } from '../types'

/**
 * Parse a portion string like "100g", "250ml", "2 unidad" into amount + unit.
 */
export function parsePortionString(str: string): { amount: number; unit: PortionUnit } {
  const s = str.trim().toLowerCase()

  // Try to match number + unit
  const match = s.match(/^([\d.,]+)\s*(g|kg|ml|l|oz|unidad|unidades)?$/i)
  if (match) {
    const amount = parseFloat(match[1].replace(',', '.')) || 100
    let unit: PortionUnit = 'g'
    const rawUnit = (match[2] || 'g').toLowerCase()
    if (rawUnit === 'kg') unit = 'kg'
    else if (rawUnit === 'ml') unit = 'ml'
    else if (rawUnit === 'l') unit = 'L'
    else if (rawUnit === 'oz') unit = 'oz'
    else if (rawUnit === 'unidad' || rawUnit === 'unidades') unit = 'unidad'
    else unit = 'g'
    return { amount, unit }
  }

  // Default
  return { amount: 100, unit: 'g' }
}

/**
 * Given a FoodItem with macros for the current portion, compute the base/100g values.
 */
export function normalizeToBase100(food: FoodItem): FoodItem {
  const totalGrams = food.portionAmount * food.unitWeightInGrams
  if (totalGrams <= 0) return food

  const factor = 100 / totalGrams
  return {
    ...food,
    baseCal100: Math.round(food.calories * factor * 10) / 10,
    baseProt100: Math.round(food.protein * factor * 10) / 10,
    baseCarbs100: Math.round(food.carbs * factor * 10) / 10,
    baseFat100: Math.round(food.fat * factor * 10) / 10,
  }
}

/**
 * Given a FoodItem with base/100g values, compute display macros for the current portion.
 */
export function calcMacros(food: FoodItem): FoodItem {
  const totalGrams = food.portionAmount * food.unitWeightInGrams
  const factor = totalGrams / 100

  return {
    ...food,
    calories: Math.round(food.baseCal100 * factor),
    protein: Math.round(food.baseProt100 * factor * 10) / 10,
    carbs: Math.round(food.baseCarbs100 * factor * 10) / 10,
    fat: Math.round(food.baseFat100 * factor * 10) / 10,
  }
}

/**
 * Create a FoodItem with new-style fields from legacy portion string + macros.
 */
export function migrateLegacyFood(legacy: {
  name: string
  portion?: string
  calories: number
  protein: number
  carbs: number
  fat: number
  category?: string
  tags?: string[]
}): FoodItem {
  const parsed = parsePortionString(legacy.portion || '100g')
  const unitWeight = UNIT_WEIGHT_GRAMS[parsed.unit]

  const food: FoodItem = {
    name: legacy.name,
    portionAmount: parsed.amount,
    portionUnit: parsed.unit,
    unitWeightInGrams: unitWeight,
    calories: legacy.calories,
    protein: legacy.protein,
    carbs: legacy.carbs,
    fat: legacy.fat,
    baseCal100: 0,
    baseProt100: 0,
    baseCarbs100: 0,
    baseFat100: 0,
    category: legacy.category as FoodItem['category'],
    tags: legacy.tags,
    portionNote: (legacy as any).portionNote,
  }

  return normalizeToBase100(food)
}

/**
 * Create a default empty FoodItem for manual entry.
 */
export function createEmptyFood(): FoodItem {
  return {
    name: '',
    portionAmount: 100,
    portionUnit: 'g',
    unitWeightInGrams: 1,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    baseCal100: 0,
    baseProt100: 0,
    baseCarbs100: 0,
    baseFat100: 0,
  }
}
