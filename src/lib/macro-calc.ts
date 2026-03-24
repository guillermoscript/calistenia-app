import type { FoodItem, PortionUnit } from '../types'
import { UNIT_WEIGHT_GRAMS } from '../types'

/** Coerce to a finite non-negative number, fallback 0 */
const safe = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Parse a portion string like "100g", "250ml", "2 unidad" into amount + unit.
 */
export function parsePortionString(str: string): { amount: number; unit: PortionUnit } {
  const s = str.trim().toLowerCase()

  // Try to match number + unit (flexible: supports "175g", "175 g", "175gr", "175 gramos", etc.)
  const match = s.match(/([\d.,]+)\s*(g(?:r(?:amos)?)?|kg|ml|l(?:itros?)?|oz|unidad(?:es)?)?/i)
  if (match) {
    const amount = parseFloat(match[1].replace(',', '.')) || 100
    let unit: PortionUnit = 'g'
    const rawUnit = (match[2] || 'g').toLowerCase()
    if (rawUnit === 'kg') unit = 'kg'
    else if (rawUnit === 'ml') unit = 'ml'
    else if (rawUnit === 'l' || rawUnit.startsWith('litro')) unit = 'L'
    else if (rawUnit === 'oz') unit = 'oz'
    else if (rawUnit.startsWith('unidad')) unit = 'unidad'
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
  const totalGrams = safe(food.portionAmount) * safe(food.unitWeightInGrams)
  if (totalGrams <= 0) return food

  const factor = 100 / totalGrams
  return {
    ...food,
    baseCal100: Math.round(safe(food.calories) * factor * 10) / 10,
    baseProt100: Math.round(safe(food.protein) * factor * 10) / 10,
    baseCarbs100: Math.round(safe(food.carbs) * factor * 10) / 10,
    baseFat100: Math.round(safe(food.fat) * factor * 10) / 10,
  }
}

/**
 * Given a FoodItem with base/100g values, compute display macros for the current portion.
 */
export function calcMacros(food: FoodItem): FoodItem {
  const totalGrams = safe(food.portionAmount) * safe(food.unitWeightInGrams)
  const factor = totalGrams / 100

  return {
    ...food,
    calories: Math.round(safe(food.baseCal100) * factor),
    protein: Math.round(safe(food.baseProt100) * factor * 10) / 10,
    carbs: Math.round(safe(food.baseCarbs100) * factor * 10) / 10,
    fat: Math.round(safe(food.baseFat100) * factor * 10) / 10,
  }
}

/**
 * Create a FoodItem with new-style fields from legacy portion string + macros.
 */
export function migrateLegacyFood(legacy: {
  name: string
  portion?: string
  portionGrams?: number
  calories: number
  protein: number
  carbs: number
  fat: number
  category?: string
  tags?: string[]
}): FoodItem {
  const parsed = parsePortionString(legacy.portion || '100g')
  const unitWeight = UNIT_WEIGHT_GRAMS[parsed.unit]

  // Use portionGrams from AI when available (more reliable than parsing string)
  const portionAmount = legacy.portionGrams && legacy.portionGrams > 0
    ? legacy.portionGrams
    : parsed.amount

  const food: FoodItem = {
    name: legacy.name,
    portionAmount,
    portionUnit: parsed.unit,
    unitWeightInGrams: unitWeight,
    calories: safe(legacy.calories),
    protein: safe(legacy.protein),
    carbs: safe(legacy.carbs),
    fat: safe(legacy.fat),
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
