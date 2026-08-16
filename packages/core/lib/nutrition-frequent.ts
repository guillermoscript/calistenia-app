import type { NutritionEntry } from '../types'

export interface FrequentMealsOptions {
  /** Veces mínimas que una misma combinación de alimentos debe repetirse. */
  minCount?: number
  /** Máximo de comidas devueltas. */
  limit?: number
}

/** Firma de una comida: nombres de alimentos ordenados — el orden en el plato no cuenta. */
export function mealSignature(entry: NutritionEntry): string {
  return entry.foods.map(f => f.name).sort().join('|')
}

/**
 * Comidas frecuentes para el quick-tap "repetir" (#470): agrupa las entries
 * recientes por firma de alimentos, se queda con las repetidas y las ordena
 * por frecuencia. Devuelve la PRIMERA entry vista de cada grupo (la más
 * reciente si `entries` viene ordenada desc por fecha, como getRecentEntries).
 */
export function getFrequentMeals(
  entries: NutritionEntry[],
  { minCount = 2, limit = 4 }: FrequentMealsOptions = {},
): NutritionEntry[] {
  const groups = new Map<string, { entry: NutritionEntry; count: number }>()
  for (const entry of entries) {
    const sig = mealSignature(entry)
    if (!sig) continue
    const existing = groups.get(sig)
    if (existing) existing.count++
    else groups.set(sig, { entry, count: 1 })
  }
  return [...groups.values()]
    .filter(g => g.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(g => g.entry)
}
