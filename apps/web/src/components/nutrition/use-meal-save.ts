/**
 * Guardado del registro de comidas web (#477).
 *
 * Salió de MealLoggerContent: compone el `eatenAt` local, guarda, alimenta el
 * catálogo y el historial, y dispara el match de despensa tras el éxito.
 */
import { useCallback } from 'react'
import { localHour, nowLocalForPB, todayStr } from '@calistenia/core/lib/dateUtils'
import { op } from '@calistenia/core/lib/analytics'
import type { FoodItem, MealType, NutritionEntry } from '@calistenia/core/types'
import { setLastMealType, type AnalysisQuality, type MealTotals, type Step } from './meal-logger-shared'

interface UseMealSaveParams {
  t: (key: string) => string
  foods: FoodItem[]
  mealType: MealType
  eatenHour: string
  eatenMinute: string
  durationInput: string
  totals: MealTotals
  analysisQuality: AnalysisQuality | undefined
  imageFiles: File[]
  onSave: (entry: Omit<NutritionEntry, 'id' | 'user'>, photoFiles?: File[]) => Promise<NutritionEntry | void>
  onSaved?: (entryId: string, foods: FoodItem[]) => void
  saveFoodToCatalog: (food: FoodItem) => Promise<unknown>
  trackFood: (food: FoodItem, mealType: MealType, hour: number) => void | Promise<void>
  setStep: (step: Step) => void
  setError: (error: string | null) => void
}

export function useMealSave({
  t, foods, mealType, eatenHour, eatenMinute, durationInput, totals, analysisQuality, imageFiles,
  onSave, onSaved, saveFoodToCatalog, trackFood, setStep, setError,
}: UseMealSaveParams) {
  const handleSave = useCallback(async () => {
    const validFoods = foods.filter(f => f.name.trim())
    if (validFoods.length === 0) {
      setError(t('nutrition.logger.addAtLeastOneFood'))
      return
    }
    // Naive local finish time "YYYY-MM-DD HH:mm:ss" — digits shown verbatim.
    const hNum = Math.min(23, Math.max(0, parseInt(eatenHour, 10) || 0))
    const mNum = Math.min(59, Math.max(0, parseInt(eatenMinute, 10) || 0))
    const pad = (n: number) => String(n).padStart(2, '0')
    const eatenAt = `${todayStr()} ${pad(hNum)}:${pad(mNum)}:00`
    const durNum = durationInput.trim() ? Math.max(0, parseInt(durationInput, 10) || 0) : 0

    setStep('saving')
    try {
      const saved = await onSave({
        mealType,
        foods: validFoods,
        totalCalories: totals.calories,
        totalProtein: totals.protein,
        totalCarbs: totals.carbs,
        totalFat: totals.fat,
        loggedAt: nowLocalForPB(),
        eatenAt,
        ...(durNum > 0 ? { durationMin: durNum } : {}),
        ...(analysisQuality ? {
          qualityScore: analysisQuality.score,
          qualityBreakdown: analysisQuality.breakdown,
          qualityMessage: analysisQuality.message,
          qualitySuggestion: analysisQuality.suggestion,
        } : {}),
      }, imageFiles.length > 0 ? imageFiles : undefined)
      foods.filter(f => f.name.trim()).forEach(f => saveFoodToCatalog(f))
      const hour = localHour()
      foods.filter(f => f.name.trim()).forEach(f => trackFood(f, mealType, hour))
      setLastMealType(mealType)
      op.track('meal_logged', { meal_type: mealType, food_count: validFoods.length, calories: totals.calories })
      setStep('success')
      // F4: match de despensa DESPUÉS del éxito — nunca bloquea ni afecta el log.
      // Saves offline (local_*) no disparan (sin id de servidor).
      const savedId = saved && typeof saved === 'object' ? saved.id : undefined
      if (savedId && !savedId.startsWith('local_')) {
        onSaved?.(savedId, validFoods)
      }
    } catch {
      setError(t('nutrition.logger.saveError'))
      setStep('review')
    }
  }, [
    foods, mealType, eatenHour, eatenMinute, durationInput, totals, analysisQuality, imageFiles,
    onSave, onSaved, saveFoodToCatalog, trackFood, setStep, setError, t,
  ])

  return { handleSave }
}
