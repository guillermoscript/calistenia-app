/**
 * Máquina de estados del registro de comidas web (#477).
 *
 * Espejo de `apps/mobile/src/components/nutrition/use-meal-logger.ts` (#470):
 * este hook posee TODO el estado del flujo `capture → analyzing → review →
 * saving → success` y compone los tres hooks de concern (captura, análisis,
 * guardado). Devuelve un único modelo que consumen los componentes de paso.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { localHour, nowLocalForPB } from '@calistenia/core/lib/dateUtils'
import { useFoodCatalog } from '@calistenia/core/hooks/useFoodCatalog'
import { useBarcodeScanner } from '@calistenia/core/hooks/useBarcodeScanner'
import { useFoodHistory } from '@calistenia/core/hooks/useFoodHistory'
import { useMealTemplates } from '@calistenia/core/hooks/useMealTemplates'
import { calcMacros, normalizeToBase100, migrateLegacyFood, createEmptyFood } from '@calistenia/core/lib/macro-calc'
import type { FoodItem, NutritionEntry, MealTemplate, MealType } from '@calistenia/core/types'
import {
  MEAL_OPTIONS, getSeedMealType, normalizeFoods, sumFoodTotals,
  type AnalysisQuality, type CaptureSubView, type EditingMacro, type MealLoggerContentProps, type Step,
} from './meal-logger-shared'
import { useMealCapture } from './use-meal-capture'
import { useMealAnalysis } from './use-meal-analysis'
import { useMealSave } from './use-meal-save'

const RECENT_PAGE_SIZE = 10

export function useMealLogger({
  onAnalyze, onSave, userId, dailyTotals, goals, getRecentEntries, onSaveSuccess, onSaved,
  onSendToBackground, initialAnalysis,
}: MealLoggerContentProps) {
  const { t } = useTranslation()
  const { saveFoodToCatalog, completeWithAI } = useFoodCatalog()
  const { getRecentFoods, getHourSuggestions, trackFood } = useFoodHistory(userId)
  const { getTemplates, saveTemplate, applyTemplate, deleteTemplate } = useMealTemplates(userId)
  const { scanning, loading: barcodeLoading, error: barcodeError, startScan, handleBarcode, closeScan, reset: resetBarcode } = useBarcodeScanner({
    onIncompleteProduct: completeWithAI,
  })

  const [step, setStep] = useState<Step>('capture')
  const [captureSubView, setCaptureSubView] = useState<CaptureSubView>('main')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [mealType, setMealType] = useState<MealType>(getSeedMealType)
  // Meal timing — exact finish time (HH/MM) + optional duration (minutes).
  // Lazy initializers seed from the current local time so a first-open save
  // never yields the midnight sentinel "00:00". handleResetForm re-seeds on reset.
  const [eatenHour, setEatenHour] = useState<string>(() => nowLocalForPB().slice(11, 13))
  const [eatenMinute, setEatenMinute] = useState<string>(() => nowLocalForPB().slice(14, 16))
  const [durationInput, setDurationInput] = useState('')
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingMacro, setEditingMacro] = useState<EditingMacro>(null)
  const [quickText, setQuickText] = useState('')
  const [imageDescription, setImageDescription] = useState('')
  const [mealDescription, setMealDescription] = useState('')
  const [analysisQuality, setAnalysisQuality] = useState<AnalysisQuality | undefined>()
  // Recent foods & suggestions
  const [recentFoods, setRecentFoods] = useState<FoodItem[]>([])
  const [hourSuggestions, setHourSuggestions] = useState<FoodItem[]>([])
  const [recentEntries, setRecentEntries] = useState<NutritionEntry[]>([])
  const [recentSearch, setRecentSearch] = useState('')
  const [recentTypeFilter, setRecentTypeFilter] = useState<MealType | ''>('')
  const [recentPage, setRecentPage] = useState(1)
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  // The hour the food was eaten (from the finish-time field / photo EXIF) — fed
  // to the AI for timing-based quality scoring. undefined if not a valid number.
  const eatenHourNum = useCallback((): number | undefined => {
    const h = parseInt(eatenHour, 10)
    return Number.isFinite(h) ? h : undefined
  }, [eatenHour])

  const totals = useMemo(() => sumFoodTotals(foods), [foods])

  const capture = useMealCapture({
    imageFiles, setImageFiles, setImagePreviews, setEatenHour, setEatenMinute,
  })

  const analysis = useMealAnalysis({
    t, onAnalyze, onSendToBackground, onSaveSuccess,
    imageFiles, mealType, imageDescription, quickText, eatenHourNum,
    setStep, setError, setFoods, setMealDescription, setAnalysisQuality, setQuickText,
  })

  const { handleSave } = useMealSave({
    t, foods, mealType, eatenHour, eatenMinute, durationInput, totals, analysisQuality, imageFiles,
    onSave, onSaved, saveFoodToCatalog, trackFood, setStep, setError,
  })

  const handleBarcodeResult = useCallback(async (barcode: string) => {
    const food = await handleBarcode(barcode)
    if (food) {
      saveFoodToCatalog(food).catch(() => {})
      setFoods([food])
      setStep('review')
    }
  }, [handleBarcode, saveFoodToCatalog])

  const filteredRecentEntries = useMemo(() => {
    let entries = recentEntries
    if (recentTypeFilter) {
      entries = entries.filter(e => e.mealType === recentTypeFilter)
    }
    if (recentSearch.trim()) {
      const q = recentSearch.toLowerCase().trim()
      entries = entries.filter(entry =>
        entry.foods.some(f => f.name?.toLowerCase().includes(q)) ||
        entry.mealType?.toLowerCase().includes(q)
      )
    }
    return entries
  }, [recentEntries, recentSearch, recentTypeFilter])

  const paginatedRecentEntries = useMemo(() =>
    filteredRecentEntries.slice(0, recentPage * RECENT_PAGE_SIZE)
  , [filteredRecentEntries, recentPage])

  const hasMoreRecent = paginatedRecentEntries.length < filteredRecentEntries.length

  // Load recents when review step opens
  useEffect(() => {
    if (step === 'review' && userId) {
      getRecentFoods(8).then(setRecentFoods).catch(() => {})
      getHourSuggestions(localHour()).then(setHourSuggestions).catch(() => {})
    }
  }, [step, userId, getRecentFoods, getHourSuggestions])

  // Load initial analysis from a completed background job
  useEffect(() => {
    if (initialAnalysis && initialAnalysis.foods.length > 0) {
      setFoods(normalizeFoods(initialAnalysis.foods))
      setMealDescription(initialAnalysis.meal_description || '')
      setAnalysisQuality(initialAnalysis.quality)
      setStep('review')
    }
  }, [initialAnalysis])

  // ── Edición de comidas ─────────────────────────────────────────────────────

  const handlePortionChange = useCallback((index: number, amount: number, unit: FoodItem['portionUnit'], unitWeight: number) => {
    setFoods(prev => prev.map((f, i) => {
      if (i !== index) return f
      const updated = { ...f, portionAmount: amount, portionUnit: unit, unitWeightInGrams: unitWeight }
      return calcMacros(updated)
    }))
  }, [])

  const updateFood = useCallback((index: number, field: keyof FoodItem, value: string | number) => {
    setFoods(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f))
  }, [])

  const removeFood = useCallback((index: number) => {
    setFoods(prev => prev.filter((_, i) => i !== index))
  }, [])

  const addFood = useCallback(() => {
    setFoods(prev => [...prev, createEmptyFood()])
  }, [])

  const addRecentFood = useCallback((food: FoodItem) => {
    setFoods(prev => [...prev, { ...food }])
  }, [])

  /** Reemplaza una comida por la elegida en el autocompletado del catálogo. */
  const selectCatalogFood = useCallback((index: number, selected: FoodItem) => {
    const normalized = migrateLegacyFood(selected as any)
    setFoods(prev => prev.map((f, i) => i === index ? normalized : f))
  }, [])

  /** Confirma la edición inline de un macro y recalcula la base por 100 g. */
  const commitMacroEdit = useCallback((index: number, field: keyof FoodItem, value: number) => {
    updateFood(index, field, value)
    setFoods(prev => prev.map((f, i) => i === index ? normalizeToBase100(f) : f))
    setEditingMacro(null)
  }, [updateFood])

  const startManualEntry = useCallback(() => {
    setFoods([createEmptyFood()])
    setStep('review')
  }, [])

  /** Vuelve de revisión a captura descartando fotos y comidas. */
  const backToCapture = useCallback(() => {
    setStep('capture')
    setFoods([])
    setImagePreviews([])
    setImageFiles([])
  }, [])

  // ── Repetir comida y plantillas ────────────────────────────────────────────

  const resetRecentFilters = useCallback(() => {
    setRecentSearch('')
    setRecentTypeFilter('')
    setRecentPage(1)
  }, [])

  const loadRepeatMeal = useCallback(async () => {
    setCaptureSubView('repeatMeal')
    setRecentSearch('')
    setRecentTypeFilter('')
    setRecentPage(1)
    try {
      const entries = await getRecentEntries()
      setRecentEntries(entries)
    } catch { /* ignore */ }
  }, [getRecentEntries])

  const loadTemplates = useCallback(async () => {
    setCaptureSubView('templates')
    try {
      const tmpl = await getTemplates()
      setTemplates(tmpl)
    } catch { /* ignore */ }
  }, [getTemplates])

  const selectRecentEntry = useCallback((entry: NutritionEntry) => {
    setMealType(entry.mealType)
    setFoods(normalizeFoods(entry.foods))
    setCaptureSubView('main')
    setStep('review')
  }, [])

  const selectTemplate = useCallback(async (template: MealTemplate) => {
    try {
      const tmplFoods = await applyTemplate(template.id!)
      setMealType(template.mealType)
      setFoods(tmplFoods)
      setCaptureSubView('main')
      setStep('review')
    } catch { /* ignore */ }
  }, [applyTemplate])

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim() || foods.length === 0) return
    try {
      await saveTemplate(templateName.trim(), foods, mealType)
      setShowSaveTemplate(false)
      setTemplateName('')
    } catch { /* ignore */ }
  }, [templateName, foods, mealType, saveTemplate])

  const handleDeleteTemplate = useCallback(async (id: string) => {
    await deleteTemplate(id)
    setTemplates(prev => prev.filter(tmpl => tmpl.id !== id))
  }, [deleteTemplate])

  const handleResetForm = useCallback(() => {
    setStep('capture')
    setCaptureSubView('main')
    setImagePreviews([])
    setImageFiles([])
    setMealType(getSeedMealType())
    {
      const nowPb = nowLocalForPB()
      setEatenHour(nowPb.slice(11, 13))
      setEatenMinute(nowPb.slice(14, 16))
      setDurationInput('')
    }
    setFoods([])
    setError(null)
    setEditingMacro(null)
    setQuickText('')
    setImageDescription('')
    setMealDescription('')
    setAnalysisQuality(undefined)
    setShowSaveTemplate(false)
    setTemplateName('')
    resetBarcode()
  }, [resetBarcode])

  const mealLabel = t(`meal.${mealType}`)

  return {
    // i18n
    t,
    // máquina de estados
    step, captureSubView, setCaptureSubView,
    // datos del contexto
    userId, dailyTotals, goals, onSaveSuccess, onSendToBackground,
    // comida en curso
    mealType, setMealType, mealLabel, foods, totals, error,
    mealDescription, analysisQuality,
    eatenHour, setEatenHour, eatenMinute, setEatenMinute, durationInput, setDurationInput,
    editingMacro, setEditingMacro,
    // entrada de texto y fotos
    quickText, setQuickText, imageDescription, setImageDescription,
    imageFiles, imagePreviews,
    ...capture,
    // análisis
    ...analysis,
    // guardado
    handleSave, handleResetForm,
    // edición de comidas
    handlePortionChange, updateFood, removeFood, addFood, addRecentFood,
    selectCatalogFood, commitMacroEdit, startManualEntry, backToCapture,
    // sugerencias
    recentFoods, hourSuggestions,
    // repetir comida
    recentEntries, recentSearch, setRecentSearch, recentTypeFilter, setRecentTypeFilter,
    setRecentPage, filteredRecentEntries, paginatedRecentEntries, hasMoreRecent,
    resetRecentFilters, loadRepeatMeal, selectRecentEntry,
    // plantillas
    templates, templateName, setTemplateName, showSaveTemplate, setShowSaveTemplate,
    loadTemplates, selectTemplate, handleSaveTemplate, handleDeleteTemplate,
    // código de barras
    scanning, barcodeLoading, barcodeError, startScan, closeScan, resetBarcode, handleBarcodeResult,
    // constantes de UI
    mealOptions: MEAL_OPTIONS,
  }
}

export type MealLoggerModel = ReturnType<typeof useMealLogger>
