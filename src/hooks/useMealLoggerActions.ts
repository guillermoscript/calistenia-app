import { useCallback, useMemo } from 'react'
import type { NutritionEntry, FoodItem, DailyTotals, NutritionGoal, QualityScore, QualityBreakdown, QualitySuggestion } from '../types'

export type AnalyzeResult = {
  foods: FoodItem[]
  meal_description?: string
  quality?: {
    score: QualityScore
    breakdown: QualityBreakdown
    message: string
    suggestion: QualitySuggestion | null
  }
}

type AnalyzeMealFn = (
  imageFiles: File | File[],
  mealType: string,
  description?: string,
  userContext?: { goal?: string; remainingMacros?: DailyTotals; recentScores?: { mealType: string; score: string; loggedAt: string }[]; topFoods?: string[]; logHour?: number },
) => Promise<{ foods: FoodItem[]; totals: DailyTotals; meal_description: string; ai_model: string; quality?: AnalyzeResult['quality'] }>

type ScoreMealQualityFn = (
  foods: { name: string; calories: number; protein: number; carbs: number; fat: number }[],
  totals: DailyTotals,
  mealType: string,
  userContext?: { goal?: string; remainingMacros?: DailyTotals; recentScores?: { mealType: string; score: string; loggedAt: string }[]; topFoods?: string[]; logHour?: number },
) => Promise<{ score: QualityScore; breakdown: QualityBreakdown; message: string; suggestion: QualitySuggestion | null } | null>

interface UseMealLoggerActionsDeps {
  userId: string | null
  goals: NutritionGoal | null
  entries: NutritionEntry[]
  analyzeMeal: AnalyzeMealFn
  scoreMealQuality: ScoreMealQualityFn
  saveEntry: (entry: Omit<NutritionEntry, 'id'>, photoFiles?: File[]) => Promise<NutritionEntry>
  updateEntry: (id: string, updates: Partial<NutritionEntry>) => Promise<void>
  getRemainingMacros: (date?: string) => DailyTotals
}

/**
 * Service hook for meal logging actions.
 * Encapsulates analyze (with quality context) and save (with async quality scoring).
 * Used by both NutritionPage (dialog) and MealLoggerPage (full page on mobile).
 */
export function useMealLoggerActions({
  userId,
  goals,
  entries,
  analyzeMeal,
  scoreMealQuality,
  saveEntry,
  updateEntry,
  getRemainingMacros,
}: UseMealLoggerActionsDeps) {
  const remaining = useMemo(() => getRemainingMacros(), [getRemainingMacros])

  const buildUserContext = useCallback(() => {
    const recentScores = entries
      .filter(e => e.qualityScore)
      .slice(0, 5)
      .map(e => ({ mealType: e.mealType, score: e.qualityScore!, loggedAt: e.loggedAt }))
    return {
      goal: goals?.goal,
      remainingMacros: remaining,
      recentScores: recentScores.length > 0 ? recentScores : undefined,
      logHour: new Date().getHours(),
    }
  }, [goals, remaining, entries])

  const handleAnalyze = useCallback(async (
    imageFiles: File[],
    mealType: string,
    description?: string,
  ): Promise<AnalyzeResult> => {
    const result = await analyzeMeal(imageFiles, mealType, description, buildUserContext())
    return {
      foods: result.foods,
      meal_description: result.meal_description,
      quality: result.quality,
    }
  }, [analyzeMeal, buildUserContext])

  const handleSave = useCallback(async (
    entry: Omit<NutritionEntry, 'id' | 'user'>,
    photoFiles?: File[],
  ) => {
    const saved = await saveEntry({ ...entry, user: userId || undefined }, photoFiles)
    // Fire async quality scoring for manual/barcode entries that don't have a score yet
    if (!saved.qualityScore && saved.foods.length > 0) {
      const portion = (f: FoodItem) => f.portionAmount || 1
      scoreMealQuality(
        saved.foods.map(f => ({
          name: f.name || '?',
          calories: (f.baseCal100 || 0) * portion(f),
          protein: (f.baseProt100 || 0) * portion(f),
          carbs: (f.baseCarbs100 || 0) * portion(f),
          fat: (f.baseFat100 || 0) * portion(f),
        })),
        { calories: saved.totalCalories || 0, protein: saved.totalProtein || 0, carbs: saved.totalCarbs || 0, fat: saved.totalFat || 0 },
        saved.mealType,
        goals ? { goal: goals.goal, remainingMacros: remaining } : undefined,
      ).then(async (quality) => {
        if (quality && saved.id && !saved.id.startsWith('local_')) {
          await updateEntry(saved.id, {
            qualityScore: quality.score,
            qualityBreakdown: quality.breakdown,
            qualityMessage: quality.message,
            qualitySuggestion: quality.suggestion,
          })
        }
      }).catch(() => { /* non-blocking — entry already saved, quality is best-effort */ })
    }
  }, [saveEntry, userId, scoreMealQuality, goals, remaining, updateEntry])

  return { handleAnalyze, handleSave }
}
