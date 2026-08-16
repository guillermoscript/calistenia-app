/**
 * useMealSave — owns persisting the logged meal: composes the eaten-at
 * timestamp, calls `onSave`, tracks food history/analytics, and triggers the
 * post-save pantry match.
 */
import type { Dispatch, SetStateAction } from 'react'
import type { useTranslation } from 'react-i18next'

import { haptics } from '@/lib/haptics'
import { Sentry } from '@/lib/instrument'
import { op } from '@calistenia/core/lib/analytics'
import { localHour, nowLocalForPB, todayStr, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import type { FoodItem, MealType } from '@calistenia/core/types'

import {
  type AnalysisQuality,
  type ImageAsset,
  type MealLoggerSheetProps,
  type MealTotals,
  type Step,
  setLastMealType,
} from './meal-logger-shared'

interface UseMealSaveParams {
  t: ReturnType<typeof useTranslation>['t']
  editEntry?: MealLoggerSheetProps['editEntry']
  foods: FoodItem[]
  mealType: MealType
  eatenHour: string
  eatenMinute: string
  durationInput: string
  totals: MealTotals
  analysisQuality: AnalysisQuality | undefined
  imageAssets: ImageAsset[]
  onSave: MealLoggerSheetProps['onSave']
  onSaved: MealLoggerSheetProps['onSaved']
  trackFood: (food: FoodItem, mealType: MealType, hour: number) => Promise<void>
  setStep: Dispatch<SetStateAction<Step>>
  setError: Dispatch<SetStateAction<string | null>>
}

export function useMealSave({
  t,
  editEntry,
  foods,
  mealType,
  eatenHour,
  eatenMinute,
  durationInput,
  totals,
  analysisQuality,
  imageAssets,
  onSave,
  onSaved,
  trackFood,
  setStep,
  setError,
}: UseMealSaveParams) {
  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const validFoods = foods.filter((f) => f.name.trim())
    if (validFoods.length === 0) {
      setError(t('nutrition.logger.addFood'))
      return
    }
    // Compose the finish time as a naive local datetime "YYYY-MM-DD HH:mm:ss":
    // the digits are displayed verbatim (no tz conversion). Keep it on the meal's
    // own day — today for new logs, the original day when editing.
    const hNum = Math.min(23, Math.max(0, parseInt(eatenHour, 10) || 0))
    const mNum = Math.min(59, Math.max(0, parseInt(eatenMinute, 10) || 0))
    const pad = (n: number) => String(n).padStart(2, '0')
    const baseDate = editEntry
      ? (editEntry.eatenAt?.slice(0, 10) || utcToLocalDateStr(editEntry.loggedAt))
      : todayStr()
    const eatenAt = `${baseDate} ${pad(hNum)}:${pad(mNum)}:00`
    const durNum = durationInput.trim() ? Math.max(0, parseInt(durationInput, 10) || 0) : 0

    setStep('saving')
    try {
      const savedId = await onSave(
        {
          mealType,
          foods: validFoods,
          totalCalories: totals.calories,
          totalProtein: totals.protein,
          totalCarbs: totals.carbs,
          totalFat: totals.fat,
          loggedAt: nowLocalForPB(),
          eatenAt,
          ...(durNum > 0 ? { durationMin: durNum } : {}),
          ...(analysisQuality
            ? {
                qualityScore: analysisQuality.score,
                qualityBreakdown: analysisQuality.breakdown,
                qualityMessage: analysisQuality.message,
                qualitySuggestion: analysisQuality.suggestion,
              }
            : {}),
        },
        imageAssets.length > 0 ? imageAssets.map((a) => a.uri) : undefined,
      )
      const hour = localHour()
      validFoods.forEach((f) => trackFood(f, mealType, hour))
      // Paridad con web (MealLoggerContent): solo registros nuevos — las
      // ediciones no cuentan como comida registrada para el funnel (#233).
      if (!editEntry) {
        op.track('meal_logged', { meal_type: mealType, food_count: validFoods.length, calories: totals.calories })
      }
      setLastMealType(mealType)
      haptics.success()
      setStep('success')
      // F4: match de despensa DESPUÉS del éxito — nunca bloquea ni afecta el log.
      // Saves offline (local_*) y ediciones no disparan (sin id de servidor / doble descuento).
      if (typeof savedId === 'string' && !savedId.startsWith('local_') && !editEntry) {
        onSaved?.(savedId, validFoods)
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'save-meal' } })
      setError(t('nutrition.logger.saveError'))
      setStep('review')
      haptics.error()
    }
  }

  return { handleSave }
}
