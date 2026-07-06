/**
 * useMealLogger — owns the entire MealLogger state machine (capture → analyzing →
 * review → saving → success), image picking, AI analysis, food editing and save.
 * The presentational layer (steps/views) consumes the returned model.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'

import { haptics } from '@/lib/haptics'
import { Sentry } from '@/lib/instrument'
import {
  requestCameraPermission as askCameraPermission,
  requestMediaPermission as askMediaPermission,
} from '@/lib/image-upload'
import { localHour, nowLocalForPB, todayStr, utcToLocalDateStr, localHMFromPB } from '@calistenia/core/lib/dateUtils'
import { isMidnightEatenAt, parseExifDateTimeToHM } from '@calistenia/core/lib/meal-time'
import { createEmptyFood, normalizeToBase100 } from '@calistenia/core/lib/macro-calc'
import { useFoodHistory } from '@calistenia/core/hooks/useFoodHistory'
import type { FoodItem, MealType, NutritionEntry } from '@calistenia/core/types'

import {
  type AnalysisQuality,
  type CaptureSubView,
  type EditingMacro,
  type ImageAsset,
  type MacroField,
  type MealLoggerSheetProps,
  type Step,
  MAX_PHOTOS,
  getDefaultMealType,
  getLastMealType,
  setLastMealType,
  normalizeEntryFoods,
} from './meal-logger-shared'

export function useMealLogger({
  visible,
  onClose,
  initialMode,
  onAnalyze,
  onSave,
  onSaved,
  userId,
  dailyTotals,
  goals,
  getRecentEntries,
  editEntry,
}: MealLoggerSheetProps) {
  const { t } = useTranslation()
  const { getRecentFoods, trackFood } = useFoodHistory(userId)

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('capture')
  const [captureSubView, setCaptureSubView] = useState<CaptureSubView>('main')
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([])
  const [mealType, setMealType] = useState<MealType>(getDefaultMealType)
  // Meal timing — exact finish time (HH/MM strings) + optional duration in minutes.
  const [eatenHour, setEatenHour] = useState('')
  const [eatenMinute, setEatenMinute] = useState('')
  const [durationInput, setDurationInput] = useState('')
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [quickText, setQuickText] = useState('')
  const [imageDescription, setImageDescription] = useState('')
  const [mealDescription, setMealDescription] = useState('')
  const [analysisQuality, setAnalysisQuality] = useState<AnalysisQuality | undefined>()
  const [editingMacro, setEditingMacro] = useState<EditingMacro>(null)
  const [editingMacroValue, setEditingMacroValue] = useState('')

  // Recent meals state
  const [recentFoods, setRecentFoods] = useState<FoodItem[]>([])
  const [recentEntries, setRecentEntries] = useState<NutritionEntry[]>([])
  const [recentSearch, setRecentSearch] = useState('')
  const [recentTypeFilter, setRecentTypeFilter] = useState<MealType | ''>('')

  const cancelledRef = useRef(false)
  const quickTextInputRef = useRef<TextInput>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const totals = useMemo(
    () =>
      foods.reduce(
        (acc, f) => ({
          calories: acc.calories + (Number(f.calories) || 0),
          protein: acc.protein + (Number(f.protein) || 0),
          carbs: acc.carbs + (Number(f.carbs) || 0),
          fat: acc.fat + (Number(f.fat) || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [foods],
  )

  const filteredRecentEntries = useMemo(() => {
    let entries = recentEntries
    if (recentTypeFilter) {
      entries = entries.filter((e) => e.mealType === recentTypeFilter)
    }
    if (recentSearch.trim()) {
      const q = recentSearch.toLowerCase().trim()
      entries = entries.filter(
        (entry) =>
          entry.foods.some((f) => f.name?.toLowerCase().includes(q)) ||
          entry.mealType?.toLowerCase().includes(q),
      )
    }
    return entries
  }, [recentEntries, recentSearch, recentTypeFilter])

  const mealLabel = t(`meal.${mealType}`)

  // ── Reset / prefill ──────────────────────────────────────────────────────────
  // `seed` lets callers force a meal type across the reset (the edit flow
  // overrides it afterward anyway). Otherwise we prefer the user's last-used type
  // and fall back to the hour heuristic, so the choice sticks between logs and
  // across "Registrar otra".
  const handleResetForm = (seed?: MealType) => {
    setStep('capture')
    setCaptureSubView('main')
    setImageAssets([])
    setMealType(seed ?? getLastMealType() ?? getDefaultMealType())
    // Default the finish time to "now" so logging is one tap; the user can adjust.
    const nowPb = nowLocalForPB()
    setEatenHour(nowPb.slice(11, 13))
    setEatenMinute(nowPb.slice(14, 16))
    setDurationInput('')
    setFoods([])
    setError(null)
    setEditingMacro(null)
    setEditingMacroValue('')
    setQuickText('')
    setImageDescription('')
    setMealDescription('')
    setAnalysisQuality(undefined)
    setRecentFoods([])
    setRecentEntries([])
    setRecentSearch('')
    setRecentTypeFilter('')
  }

  // Pre-fill the review step from an existing entry (edit flow). Skips capture/analyze
  // and preserves the meal type so an edit updates in place.
  const loadEntryForEdit = (entry: NutritionEntry) => {
    handleResetForm()
    setMealType(entry.mealType)
    // Prefill the finish time from the stored eaten_at (naive local digits) or
    // fall back to the record's creation time; prefill the duration too.
    // Guard: treat "00:00" as the unset sentinel (legacy rows) and fall back to
    // loggedAt rather than surfacing midnight to the user in the edit form.
    if (entry.eatenAt && entry.eatenAt.length >= 16 && !isMidnightEatenAt(entry.eatenAt)) {
      setEatenHour(entry.eatenAt.slice(11, 13))
      setEatenMinute(entry.eatenAt.slice(14, 16))
    } else {
      const hm = localHMFromPB(entry.loggedAt)
      if (hm) {
        setEatenHour(hm.hour)
        setEatenMinute(hm.minute)
      }
    }
    setDurationInput(entry.durationMin != null ? String(entry.durationMin) : '')
    setFoods(normalizeEntryFoods(entry.foods))
    setStep('review')
  }

  // ── Image Picker ───────────────────────────────────────────────────────────
  // Thin i18n wrappers over the shared permission helpers (which own the actual
  // expo-image-picker permission request + denied Alert).
  const requestCameraPermission = () =>
    askCameraPermission({
      title: t('common.permissionRequired') || 'Permiso requerido',
      message: t('common.cameraPermissionMessage') || 'Se necesita acceso a la cámara para tomar fotos.',
    })

  const requestMediaPermission = () =>
    askMediaPermission({
      title: t('common.permissionRequired') || 'Permiso requerido',
      message: t('common.galleryPermissionMessage') || 'Se necesita acceso a la galería.',
    })

  /**
   * Apply capture time from the first asset's EXIF metadata (fresh logs only).
   * EXIF keys differ by platform; check in priority order.
   */
  const applyExifTime = (asset: ImagePicker.ImagePickerAsset) => {
    // Only seed time for fresh logs (editEntry == null handled by the caller).
    const exif = asset.exif as Record<string, unknown> | null | undefined
    if (!exif) return
    const raw =
      (exif['DateTimeOriginal'] as string | undefined) ??
      (exif['DateTimeDigitized'] as string | undefined) ??
      (exif['DateTime'] as string | undefined) ??
      ((exif['{Exif}'] as Record<string, unknown> | undefined)?.['DateTimeOriginal'] as string | undefined)
    const hm = parseExifDateTimeToHM(raw)
    if (hm) {
      setEatenHour(hm.hour)
      setEatenMinute(hm.minute)
    }
  }

  const handleCamera = async () => {
    const ok = await requestCameraPermission()
    if (!ok) return
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
      exif: true,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setImageAssets((prev) =>
        prev.length < MAX_PHOTOS
          ? [...prev, { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? undefined }]
          : prev,
      )
      // For fresh logs, seed the finish-time from EXIF capture datetime.
      if (!editEntry) {
        applyExifTime(asset)
      }
    }
  }

  const handleGallery = async () => {
    const ok = await requestMediaPermission()
    if (!ok) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - imageAssets.length,
      exif: true,
    })
    if (!result.canceled && result.assets.length > 0) {
      const newAssets: ImageAsset[] = result.assets.map((a: ImagePicker.ImagePickerAsset) => ({
        uri: a.uri,
        mimeType: a.mimeType ?? 'image/jpeg',
        fileName: a.fileName ?? undefined,
      }))
      setImageAssets((prev) => [...prev, ...newAssets].slice(0, MAX_PHOTOS))
      // For fresh logs, seed the finish-time from the first asset's EXIF datetime.
      if (!editEntry) {
        applyExifTime(result.assets[0])
      }
    }
  }

  const removePhoto = (index: number) => {
    setImageAssets((prev) => prev.filter((_, i) => i !== index))
  }

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

  // Clear AI-derived artifacts (quality panel + meal description) when the review
  // step is re-entered WITHOUT a fresh analyze (Back → Manual / Repeat). Without
  // this, the previous meal's quality would render over the new foods and — worse
  // — get persisted on save (handleSave spreads analysisQuality), tagging a
  // manually-entered meal with a stale AI score. Only AI-analyzed foods carry a
  // quality score.
  const clearAiAnalysis = () => {
    setAnalysisQuality(undefined)
    setMealDescription('')
  }

  // ── Food editing ─────────────────────────────────────────────────────────────
  const updateFood = useCallback((index: number, field: keyof FoodItem, value: string | number) => {
    setFoods((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)))
  }, [])

  const removeFood = useCallback((index: number) => {
    setFoods((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const addFood = () => {
    setFoods((prev) => [...prev, createEmptyFood()])
  }

  const addRecentFood = (food: FoodItem) => {
    setFoods((prev) => [...prev, { ...food }])
  }

  const commitMacroEdit = (index: number, field: MacroField, raw: string) => {
    const isCalories = field === 'calories'
    const val = isCalories ? parseInt(raw) || 0 : parseFloat(raw) || 0
    setFoods((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f
        return normalizeToBase100({ ...f, [field]: val })
      }),
    )
    setEditingMacro(null)
    setEditingMacroValue('')
  }

  // Manual entry: start blank, or seed from a comma-separated quick-text list.
  const startManualEntry = () => {
    clearAiAnalysis()
    setFoods([createEmptyFood()])
    setStep('review')
  }

  const createManualFoodsFromText = () => {
    clearAiAnalysis()
    const names = quickText.split(',').map((s) => s.trim()).filter(Boolean)
    const newFoods = names.map((name) => {
      const food = createEmptyFood()
      food.name = name
      return food
    })
    setFoods(newFoods.length > 0 ? newFoods : [createEmptyFood()])
    setQuickText('')
    setStep('review')
  }

  // ── Meal type ──────────────────────────────────────────────────────────────
  const selectMealType = (v: MealType) => {
    setMealType(v)
    haptics.selection()
  }

  // ── Repeat meal ────────────────────────────────────────────────────────────
  const loadRepeatMeal = async () => {
    setCaptureSubView('repeatMeal')
    setRecentSearch('')
    setRecentTypeFilter('')
    try {
      setRecentEntries(await getRecentEntries(30))
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'load-repeat-meal' } })
    }
  }

  const selectRecentEntry = (entry: NutritionEntry) => {
    clearAiAnalysis()
    setMealType(entry.mealType)
    setFoods(normalizeEntryFoods(entry.foods))
    setCaptureSubView('main')
    setStep('review')
    haptics.selection()
  }

  const backFromRepeat = () => {
    setCaptureSubView('main')
    setRecentSearch('')
    setRecentTypeFilter('')
  }

  const backFromReview = () => {
    clearAiAnalysis()
    setStep('capture')
    setFoods([])
    setImageAssets([])
  }

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

  // ── Effects ────────────────────────────────────────────────────────────────
  // Reset when modal opens — or pre-fill the review step when editing an entry.
  useEffect(() => {
    if (!visible) return
    if (editEntry) {
      loadEntryForEdit(editEntry)
    } else {
      handleResetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Auto-trigger initialMode when modal opens.
  useEffect(() => {
    if (!visible || !initialMode) return
    if (initialMode === 'camera') {
      const id = setTimeout(() => { handleCamera() }, 300)
      return () => clearTimeout(id)
    }
    if (initialMode === 'text') {
      const id = setTimeout(() => { quickTextInputRef.current?.focus() }, 300)
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialMode])

  // Load recent foods when review step opens.
  useEffect(() => {
    if (step === 'review' && userId) {
      getRecentFoods(8).then(setRecentFoods).catch((e) => { Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'load_recent_foods' } }) })
    }
  }, [step, userId, getRecentFoods])

  return {
    // pass-through props
    goals,
    dailyTotals,
    onClose,
    // state
    step,
    captureSubView,
    imageAssets,
    mealType,
    eatenHour,
    eatenMinute,
    durationInput,
    foods,
    error,
    quickText,
    imageDescription,
    mealDescription,
    analysisQuality,
    editingMacro,
    editingMacroValue,
    recentFoods,
    recentEntries,
    recentSearch,
    recentTypeFilter,
    // setters used directly by the view
    setQuickText,
    setImageDescription,
    setRecentSearch,
    setRecentTypeFilter,
    setEditingMacro,
    setEditingMacroValue,
    setEatenHour,
    setEatenMinute,
    setDurationInput,
    // refs
    quickTextInputRef,
    // derived
    totals,
    filteredRecentEntries,
    mealLabel,
    // handlers
    selectMealType,
    handleCamera,
    handleGallery,
    removePhoto,
    handleAnalyzeImages,
    handleAnalyzeText,
    cancelAnalysis,
    createManualFoodsFromText,
    startManualEntry,
    loadRepeatMeal,
    selectRecentEntry,
    backFromRepeat,
    backFromReview,
    updateFood,
    removeFood,
    addFood,
    addRecentFood,
    commitMacroEdit,
    handleSave,
    handleResetForm,
  }
}

export type MealLoggerModel = ReturnType<typeof useMealLogger>
