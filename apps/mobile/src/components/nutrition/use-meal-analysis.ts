/**
 * useMealAnalysis — owns AI analysis of photos/text: triggers `onAnalyze`,
 * normalizes the result into foods + quality, and supports cancellation.
 */
import { useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { useTranslation } from 'react-i18next'

import { haptics } from '@/lib/haptics'
import { Sentry } from '@/lib/instrument'
import type { FoodItem, MealType } from '@calistenia/core/types'

import {
  type AnalysisQuality,
  type ImageAsset,
  type MealLoggerSheetProps,
  type Step,
  normalizeEntryFoods,
} from './meal-logger-shared'

interface UseMealAnalysisParams {
  t: ReturnType<typeof useTranslation>['t']
  onAnalyze: MealLoggerSheetProps['onAnalyze']
  imageAssets: ImageAsset[]
  mealType: MealType
  imageDescription: string
  quickText: string
  eatenHour: string
  setStep: Dispatch<SetStateAction<Step>>
  setError: Dispatch<SetStateAction<string | null>>
  setFoods: Dispatch<SetStateAction<FoodItem[]>>
  setMealDescription: Dispatch<SetStateAction<string>>
  setAnalysisQuality: Dispatch<SetStateAction<AnalysisQuality | undefined>>
  setQuickText: Dispatch<SetStateAction<string>>
}

export function useMealAnalysis({
  t,
  onAnalyze,
  imageAssets,
  mealType,
  imageDescription,
  quickText,
  eatenHour,
  setStep,
  setError,
  setFoods,
  setMealDescription,
  setAnalysisQuality,
  setQuickText,
}: UseMealAnalysisParams) {
  const cancelledRef = useRef(false)

  // ── Analysis ───────────────────────────────────────────────────────────────
  // The finish-time field (seeded from photo EXIF, else "now") = the hour the
  // food was eaten; feed it to the AI for timing-based quality scoring.
  const eatenHourNum = (): number | undefined => {
    const h = parseInt(eatenHour, 10)
    return Number.isFinite(h) ? h : undefined
  }

  const handleAnalyzeImages = async () => {
    if (imageAssets.length === 0) return
    cancelledRef.current = false
    setStep('analyzing')
    setError(null)
    haptics.medium()
    try {
      const result = await onAnalyze(imageAssets, mealType, imageDescription.trim() || undefined, eatenHourNum())
      if (cancelledRef.current) return
      const normalized = normalizeEntryFoods(result.foods || [])
      if (normalized.length === 0) {
        setError(t('nutrition.logger.noFoodsDetected'))
        setStep('capture')
        return
      }
      setFoods(normalized)
      setMealDescription(result.meal_description || '')
      setAnalysisQuality(result.quality)
      setStep('review')
    } catch (e) {
      if (cancelledRef.current) return
      Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'analyze-images' } })
      setError(e instanceof Error && e.message ? e.message : t('nutrition.logger.noFoodsDetected'))
      setStep('capture')
    }
  }

  const handleAnalyzeText = async () => {
    const text = quickText.trim()
    if (!text) return
    cancelledRef.current = false
    setStep('analyzing')
    setError(null)
    haptics.medium()
    try {
      const result = await onAnalyze([], mealType, text, eatenHourNum())
      if (cancelledRef.current) return
      const normalized = normalizeEntryFoods(result.foods || [])
      if (normalized.length === 0) {
        setError(t('nutrition.logger.noFoodsDetected'))
        setStep('capture')
        return
      }
      setFoods(normalized)
      setMealDescription(result.meal_description || '')
      setAnalysisQuality(result.quality)
      setQuickText('')
      setStep('review')
    } catch (e) {
      if (cancelledRef.current) return
      Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'analyze-text' } })
      setError(e instanceof Error && e.message ? e.message : t('nutrition.logger.noFoodsDetected'))
      setStep('capture')
    }
  }

  const cancelAnalysis = () => {
    cancelledRef.current = true
    setStep('capture')
  }

  return { handleAnalyzeImages, handleAnalyzeText, cancelAnalysis }
}
