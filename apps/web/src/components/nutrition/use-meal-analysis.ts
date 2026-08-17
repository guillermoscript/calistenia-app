/**
 * Análisis por IA del registro de comidas web (#477).
 *
 * Salió de MealLoggerContent: analizar fotos, analizar texto, el "no esperar"
 * que a los 20 s ofrece mandar el análisis a segundo plano, y la cancelación.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createEmptyFood } from '@calistenia/core/lib/macro-calc'
import type { FoodItem, MealType } from '@calistenia/core/types'
import { normalizeFoods, type AnalysisQuality, type Step } from './meal-logger-shared'

/** El aviso de "no esperar" aparece cuando el análisis se hace largo. */
const BACKGROUND_OFFER_DELAY_MS = 20_000

interface UseMealAnalysisParams {
  t: (key: string) => string
  onAnalyze: (imageFiles: File[], mealType: string, description?: string, eatenHour?: number) => Promise<{
    foods: FoodItem[]
    meal_description?: string
    quality?: AnalysisQuality
  }>
  onSendToBackground?: (imageFiles: File[], mealType: string, description?: string) => void
  onSaveSuccess?: () => void
  imageFiles: File[]
  mealType: MealType
  imageDescription: string
  quickText: string
  eatenHourNum: () => number | undefined
  setStep: (step: Step) => void
  setError: (error: string | null) => void
  setFoods: React.Dispatch<React.SetStateAction<FoodItem[]>>
  setMealDescription: (description: string) => void
  setAnalysisQuality: (quality: AnalysisQuality | undefined) => void
  setQuickText: (text: string) => void
}

export function useMealAnalysis({
  t, onAnalyze, onSendToBackground, onSaveSuccess,
  imageFiles, mealType, imageDescription, quickText, eatenHourNum,
  setStep, setError, setFoods, setMealDescription, setAnalysisQuality, setQuickText,
}: UseMealAnalysisParams) {
  const [showBgOption, setShowBgOption] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)
  const bgTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleAnalyze = useCallback(async () => {
    if (imageFiles.length === 0) return

    cancelledRef.current = false
    abortControllerRef.current = new AbortController()
    setStep('analyzing')
    setError(null)
    setShowBgOption(false)

    // Show "no esperar" option after 20s
    if (onSendToBackground) {
      bgTimerRef.current = setTimeout(() => setShowBgOption(true), BACKGROUND_OFFER_DELAY_MS)
    }

    try {
      const result = await onAnalyze(imageFiles, mealType, imageDescription.trim() || undefined, eatenHourNum())
      if (cancelledRef.current) return
      const normalized = normalizeFoods(result.foods)
      if (normalized.length === 0) {
        setError(t('nutrition.logger.noFoodsDetected'))
        setStep('capture')
        return
      }
      setFoods(normalized)
      setMealDescription(result.meal_description || '')
      setAnalysisQuality(result.quality)
      setStep('review')
    } catch {
      if (cancelledRef.current) return
      setError(t('nutrition.logger.analyzeImageError'))
      setStep('capture')
    } finally {
      abortControllerRef.current = null
      clearTimeout(bgTimerRef.current)
      setShowBgOption(false)
    }
  }, [
    imageFiles, mealType, imageDescription, eatenHourNum, onAnalyze, onSendToBackground, t,
    setStep, setError, setFoods, setMealDescription, setAnalysisQuality,
  ])

  // "No esperar" during analysis → send to background instead of wasting the API call
  const handleSendToBackground = useCallback(() => {
    if (!onSendToBackground || imageFiles.length === 0) return
    cancelledRef.current = true
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    clearTimeout(bgTimerRef.current)
    setShowBgOption(false)
    onSendToBackground(imageFiles, mealType, imageDescription.trim() || undefined)
    onSaveSuccess?.()
  }, [onSendToBackground, onSaveSuccess, imageFiles, mealType, imageDescription])

  // Cleanup bg timer on unmount
  useEffect(() => {
    return () => clearTimeout(bgTimerRef.current)
  }, [])

  /** Texto libre sin IA: una comida vacía por cada nombre separado por comas. */
  const handleQuickTextSubmit = useCallback(() => {
    const text = quickText.trim()
    if (!text) return
    const names = text.split(',').map(s => s.trim()).filter(Boolean)
    const newFoods = names.map(name => {
      const food = createEmptyFood()
      food.name = name
      return food
    })
    setFoods(newFoods)
    setQuickText('')
    setStep('review')
  }, [quickText, setFoods, setQuickText, setStep])

  const handleAnalyzeText = useCallback(async () => {
    const text = quickText.trim()
    if (!text) return

    cancelledRef.current = false
    abortControllerRef.current = new AbortController()
    setStep('analyzing')
    setError(null)

    try {
      const result = await onAnalyze([], mealType, text, eatenHourNum())
      if (cancelledRef.current) return
      const normalized = normalizeFoods(result.foods)
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
    } catch {
      if (cancelledRef.current) return
      setError(t('nutrition.logger.analyzeImageError'))
      setStep('capture')
    } finally {
      abortControllerRef.current = null
    }
  }, [
    quickText, mealType, eatenHourNum, onAnalyze, t,
    setStep, setError, setFoods, setMealDescription, setAnalysisQuality, setQuickText,
  ])

  /** Cancelar y volver a la captura (solo se ofrece cuando no hay background). */
  const cancelAnalysis = useCallback(() => {
    cancelledRef.current = true
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setStep('capture')
  }, [setStep])

  return {
    showBgOption,
    handleAnalyze,
    handleAnalyzeText,
    handleQuickTextSubmit,
    handleSendToBackground,
    cancelAnalysis,
  }
}
