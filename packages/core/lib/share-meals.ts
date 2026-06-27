/**
 * Shared meal-mapping helper for the rich nutrition share card.
 * Pure, no external deps — safe to import in web and native.
 */
import type { MealType, NutritionEntry, QualityScore } from '../types'

export interface ShareMeal {
  mealType: MealType
  photoUrl?: string
  title: string
  protein: number
  carbs: number
  fat: number
  calories: number
  qualityScore?: QualityScore
}

/**
 * Map a day's NutritionEntry list into at most `max` ShareMeal rows, sorted
 * ascending by eat-time (eatenAt → loggedAt fallback).
 *
 * Returns:
 *   meals    — the first `max` mapped entries.
 *   overflow — how many entries were omitted (0 when all fit).
 */
export function buildShareMeals(
  entries: NutritionEntry[],
  max = 4,
): { meals: ShareMeal[]; overflow: number } {
  // Sort ascending by the most precise available timestamp.
  const sorted = [...entries].sort((a, b) => {
    const ta = a.eatenAt ?? a.loggedAt
    const tb = b.eatenAt ?? b.loggedAt
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })

  const sliced = sorted.slice(0, max)
  const overflow = Math.max(0, sorted.length - sliced.length)

  const meals: ShareMeal[] = sliced.map((entry) => {
    // Build a concise title from the foods list.
    let title = ''
    if (entry.foods.length === 1) {
      title = entry.foods[0].name
    } else if (entry.foods.length > 1) {
      title = `${entry.foods[0].name} +${entry.foods.length - 1}`
    }

    return {
      mealType: entry.mealType,
      photoUrl: entry.photoUrls?.[0],
      title,
      protein: Math.round(entry.totalProtein),
      carbs: Math.round(entry.totalCarbs),
      fat: Math.round(entry.totalFat),
      calories: Math.round(entry.totalCalories),
      qualityScore: entry.qualityScore,
    }
  })

  return { meals, overflow }
}
