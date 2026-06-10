/**
 * MealLoggerSheet — full-screen modal for logging meals.
 * Port of web's MealLoggerContent.tsx adapted for React Native.
 *
 * Steps: capture → analyzing → review → saving → success
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  Modal,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
  Alert,
  type TextInputProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { X, Camera, Image as ImageIcon, PenLine, RefreshCw, Plus, ChevronLeft, Check, Search } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'

import { localHour, nowLocalForPB } from '@calistenia/core/lib/dateUtils'
import { createEmptyFood, calcMacros, migrateLegacyFood, normalizeToBase100 } from '@calistenia/core/lib/macro-calc'
import { useFoodHistory } from '@calistenia/core/hooks/useFoodHistory'
import type {
  FoodItem,
  NutritionEntry,
  DailyTotals,
  NutritionGoal,
  MealType,
  QualityScore,
  QualityBreakdown,
  QualitySuggestion,
} from '@calistenia/core/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface ImageAsset {
  uri: string
  mimeType?: string
  fileName?: string
}

export interface MealLoggerSheetProps {
  visible: boolean
  onClose: () => void
  onAnalyze: (
    images: ImageAsset[],
    mealType: string,
    description?: string,
  ) => Promise<{
    foods: FoodItem[]
    meal_description?: string
    quality?: {
      score: QualityScore
      breakdown: QualityBreakdown
      message: string
      suggestion: QualitySuggestion | null
    }
  }>
  onSave: (
    entry: Omit<NutritionEntry, 'id' | 'user'>,
    photoUris?: string[],
  ) => Promise<void>
  userId: string | null
  dailyTotals: DailyTotals
  goals: NutritionGoal | null
  getRecentEntries: (limit?: number) => Promise<NutritionEntry[]>
}

type Step = 'capture' | 'analyzing' | 'review' | 'saving' | 'success'
type CaptureSubView = 'main' | 'repeatMeal'

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PHOTOS = 5

const MEAL_OPTIONS = [
  { id: 'desayuno' as MealType, labelKey: 'meal.desayuno', icon: '☀️' },
  { id: 'almuerzo' as MealType, labelKey: 'meal.almuerzo', icon: '🍽️' },
  { id: 'cena' as MealType, labelKey: 'meal.cena', icon: '🌙' },
  { id: 'snack' as MealType, labelKey: 'meal.snack', icon: '🍎' },
] as const

function getDefaultMealType(): MealType {
  const h = new Date().getHours()
  if (h < 10) return 'desayuno'
  if (h < 15) return 'almuerzo'
  if (h < 18) return 'snack'
  return 'cena'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MealLoggerSheet({
  visible,
  onClose,
  onAnalyze,
  onSave,
  userId,
  dailyTotals,
  goals,
  getRecentEntries,
}: MealLoggerSheetProps) {
  const { t } = useTranslation()
  const { getRecentFoods, getHourSuggestions, trackFood } = useFoodHistory(userId)

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('capture')
  const [captureSubView, setCaptureSubView] = useState<CaptureSubView>('main')
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([])
  const [mealType, setMealType] = useState<MealType>(getDefaultMealType)
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [quickText, setQuickText] = useState('')
  const [imageDescription, setImageDescription] = useState('')
  const [mealDescription, setMealDescription] = useState('')
  const [analysisQuality, setAnalysisQuality] = useState<{
    score: QualityScore
    breakdown: QualityBreakdown
    message: string
    suggestion: QualitySuggestion | null
  } | undefined>()
  const [editingMacro, setEditingMacro] = useState<{
    index: number
    field: 'calories' | 'protein' | 'carbs' | 'fat'
  } | null>(null)
  const [editingMacroValue, setEditingMacroValue] = useState('')

  // Recent meals state
  const [recentFoods, setRecentFoods] = useState<FoodItem[]>([])
  const [recentEntries, setRecentEntries] = useState<NutritionEntry[]>([])
  const [recentSearch, setRecentSearch] = useState('')
  const [recentTypeFilter, setRecentTypeFilter] = useState<MealType | ''>('')

  const cancelledRef = useRef(false)

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

  // ── Effects ────────────────────────────────────────────────────────────────
  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      handleResetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Load recent foods when review step opens
  useEffect(() => {
    if (step === 'review' && userId) {
      getRecentFoods(8).then(setRecentFoods).catch(() => {})
    }
  }, [step, userId, getRecentFoods])

  // ── Image Picker ───────────────────────────────────────────────────────────
  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('common.permissionRequired') || 'Permiso requerido',
        t('common.cameraPermissionMessage') || 'Se necesita acceso a la cámara para tomar fotos.',
      )
      return false
    }
    return true
  }

  const requestMediaPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('common.permissionRequired') || 'Permiso requerido',
        t('common.galleryPermissionMessage') || 'Se necesita acceso a la galería.',
      )
      return false
    }
    return true
  }

  const handleCamera = async () => {
    const ok = await requestCameraPermission()
    if (!ok) return
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setImageAssets((prev) =>
        prev.length < MAX_PHOTOS
          ? [...prev, { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? undefined }]
          : prev,
      )
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
    })
    if (!result.canceled && result.assets.length > 0) {
      const newAssets: ImageAsset[] = result.assets.map((a: ImagePicker.ImagePickerAsset) => ({
        uri: a.uri,
        mimeType: a.mimeType ?? 'image/jpeg',
        fileName: a.fileName ?? undefined,
      }))
      setImageAssets((prev) => [...prev, ...newAssets].slice(0, MAX_PHOTOS))
    }
  }

  const removePhoto = (index: number) => {
    setImageAssets((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Analysis ───────────────────────────────────────────────────────────────
  const normalizeAnalysisResult = (foods: FoodItem[]) =>
    foods.map((f) => {
      if (!('baseCal100' in f) || !(f as FoodItem).baseCal100) {
        return migrateLegacyFood(f as any)
      }
      return f
    })

  const handleAnalyzeImages = async () => {
    if (imageAssets.length === 0) return
    cancelledRef.current = false
    setStep('analyzing')
    setError(null)
    haptics.medium()
    try {
      const result = await onAnalyze(imageAssets, mealType, imageDescription.trim() || undefined)
      if (cancelledRef.current) return
      const normalized = normalizeAnalysisResult(result.foods || [])
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
      setError(t('nutrition.logger.noFoodsDetected'))
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
      const result = await onAnalyze([], mealType, text)
      if (cancelledRef.current) return
      const normalized = normalizeAnalysisResult(result.foods || [])
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
      setError(t('nutrition.logger.noFoodsDetected'))
      setStep('capture')
    }
  }

  // ── Food editing ───────────────────────────────────────────────────────────
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

  const commitMacroEdit = (index: number, field: 'calories' | 'protein' | 'carbs' | 'fat', raw: string) => {
    const isCalories = field === 'calories'
    const val = isCalories ? parseInt(raw) || 0 : parseFloat(raw) || 0
    setFoods((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f
        const updated = { ...f, [field]: val }
        return normalizeToBase100(updated)
      }),
    )
    setEditingMacro(null)
    setEditingMacroValue('')
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const validFoods = foods.filter((f) => f.name.trim())
    if (validFoods.length === 0) {
      setError(t('nutrition.logger.addFood'))
      return
    }
    setStep('saving')
    try {
      await onSave(
        {
          mealType,
          foods: validFoods,
          totalCalories: totals.calories,
          totalProtein: totals.protein,
          totalCarbs: totals.carbs,
          totalFat: totals.fat,
          loggedAt: nowLocalForPB(),
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
      // Track food history
      const hour = localHour()
      validFoods.forEach((f) => trackFood(f, mealType, hour))
      haptics.success()
      setStep('success')
    } catch {
      setError(t('nutrition.logger.saveError'))
      setStep('review')
      haptics.error()
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleResetForm = () => {
    setStep('capture')
    setCaptureSubView('main')
    setImageAssets([])
    setMealType(getDefaultMealType())
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

  // ── Repeat meal ────────────────────────────────────────────────────────────
  const loadRepeatMeal = async () => {
    setCaptureSubView('repeatMeal')
    setRecentSearch('')
    setRecentTypeFilter('')
    try {
      const entries = await getRecentEntries(30)
      setRecentEntries(entries)
    } catch {
      // ignore
    }
  }

  const selectRecentEntry = (entry: NutritionEntry) => {
    setMealType(entry.mealType)
    const normalized = entry.foods.map((f) => {
      if (!('baseCal100' in f) || !(f as FoodItem).baseCal100) {
        return migrateLegacyFood(f as any)
      }
      return f as FoodItem
    })
    setFoods(normalized)
    setCaptureSubView('main')
    setStep('review')
    haptics.selection()
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const mealLabel = t(`meal.${mealType}`)

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* ── Header ── */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/50">
            {/* Back / cancel on left (context-dependent) */}
            {step === 'review' ? (
              <Pressable
                onPress={() => {
                  setStep('capture')
                  setFoods([])
                  setImageAssets([])
                }}
                className="size-9 items-center justify-center rounded-lg active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <ChevronLeft size={20} color="#a1a1aa" />
              </Pressable>
            ) : (
              <View className="size-9" />
            )}

            <Text className="font-bebas text-xl tracking-widest text-foreground">
              {t('nutrition.logger.title')}
            </Text>

            <Pressable
              onPress={onClose}
              className="size-9 items-center justify-center rounded-lg active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <X size={18} color="#a1a1aa" />
            </Pressable>
          </View>

          {/* ── Drag handle (iOS visual) ── */}
          {Platform.OS === 'ios' && (
            <View className="items-center py-1">
              <View className="w-10 h-1 rounded-full bg-muted/60" />
            </View>
          )}

          {/* ── Scrollable content ── */}
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 py-4 gap-4"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── STEP: CAPTURE ── */}
            {step === 'capture' && (
              <>
                {captureSubView === 'main' && (
                  <>
                    {/* Meal type selector */}
                    <MealTypeSelector
                      value={mealType}
                      onChange={(v) => { setMealType(v); haptics.selection() }}
                      t={t}
                    />

                    {/* Text analysis input */}
                    <View className="gap-2">
                      <TextInput
                        value={quickText}
                        onChangeText={setQuickText}
                        placeholder={t('nutrition.logger.aiTextPlaceholder')}
                        placeholderTextColor="#52525b"
                        multiline
                        numberOfLines={3}
                        maxLength={500}
                        textAlignVertical="top"
                        className="px-4 py-3 rounded-xl border border-border bg-muted/30 text-foreground font-sans text-base leading-relaxed min-h-[72px]"
                        style={{ minHeight: 72 }}
                      />
                      {quickText.trim().length > 0 && (
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={handleAnalyzeText}
                            className="flex-1 h-12 bg-lime-400 items-center justify-center rounded-xl active:bg-lime-300"
                          >
                            <Text className="font-bebas text-base tracking-widest text-zinc-900">
                              ✨ {t('nutrition.logger.analyzeWithAI')}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              const names = quickText.split(',').map((s) => s.trim()).filter(Boolean)
                              const newFoods = names.map((name) => {
                                const food = createEmptyFood()
                                food.name = name
                                return food
                              })
                              setFoods(newFoods.length > 0 ? newFoods : [createEmptyFood()])
                              setQuickText('')
                              setStep('review')
                            }}
                            className="h-12 px-4 items-center justify-center rounded-xl border border-border active:bg-muted"
                          >
                            <Text className="font-mono text-[10px] tracking-widest text-muted-foreground">
                              {t('nutrition.logger.manual')}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {/* Photo strip (when photos selected) */}
                    {imageAssets.length > 0 ? (
                      <View className="gap-3">
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerClassName="gap-2 px-1"
                        >
                          {imageAssets.map((asset, i) => (
                            <View
                              key={i}
                              className="relative rounded-xl overflow-hidden"
                              style={{ width: 120, height: 120 }}
                            >
                              <Image
                                source={{ uri: asset.uri }}
                                style={{ width: 120, height: 120 }}
                                resizeMode="cover"
                              />
                              <Pressable
                                onPress={() => removePhoto(i)}
                                className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/60 items-center justify-center"
                              >
                                <X size={10} color="#ffffff" />
                              </Pressable>
                              <View className="absolute bottom-1.5 left-1.5 bg-black/50 rounded px-1 py-0.5">
                                <Text className="font-mono text-[9px] text-white/80">
                                  {i + 1}/{imageAssets.length}
                                </Text>
                              </View>
                            </View>
                          ))}
                          {imageAssets.length < MAX_PHOTOS && (
                            <View className="rounded-xl border-2 border-dashed border-border items-center justify-center gap-2 flex-row"
                              style={{ width: 120, height: 120 }}>
                              <Pressable
                                onPress={handleCamera}
                                className="size-9 items-center justify-center rounded-lg active:bg-lime-400/10"
                              >
                                <Camera size={18} color="#71717a" />
                              </Pressable>
                              <Pressable
                                onPress={handleGallery}
                                className="size-9 items-center justify-center rounded-lg active:bg-lime-400/10"
                              >
                                <ImageIcon size={18} color="#71717a" />
                              </Pressable>
                            </View>
                          )}
                        </ScrollView>

                        {/* Optional image description */}
                        <TextInput
                          value={imageDescription}
                          onChangeText={setImageDescription}
                          placeholder={t('nutrition.logger.describeFood')}
                          placeholderTextColor="#52525b"
                          multiline
                          numberOfLines={2}
                          maxLength={500}
                          textAlignVertical="top"
                          className="px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground font-sans text-base leading-relaxed"
                          style={{ minHeight: 56 }}
                        />

                        <Pressable
                          onPress={handleAnalyzeImages}
                          className="h-12 bg-lime-400 items-center justify-center rounded-xl active:bg-lime-300"
                        >
                          <Text className="font-bebas text-base tracking-widest text-zinc-900">
                            ✨ {t('nutrition.logger.analyzeWithAI')}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      /* Input method grid */
                      <View className="flex-row flex-wrap gap-2">
                        <InputMethodCard
                          icon={<Camera size={22} color="#71717a" />}
                          label={t('nutrition.logger.camera')}
                          onPress={handleCamera}
                        />
                        <InputMethodCard
                          icon={<ImageIcon size={22} color="#71717a" />}
                          label={t('nutrition.logger.gallery')}
                          onPress={handleGallery}
                        />
                        <InputMethodCard
                          icon={<PenLine size={22} color="#71717a" />}
                          label={t('nutrition.logger.manual')}
                          onPress={() => {
                            setFoods([createEmptyFood()])
                            setStep('review')
                          }}
                        />
                        <InputMethodCard
                          icon={<RefreshCw size={22} color="#71717a" />}
                          label={t('nutrition.logger.repeat')}
                          onPress={loadRepeatMeal}
                        />
                      </View>
                    )}

                    {error && (
                      <View className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <Text className="text-sm text-red-400">{error}</Text>
                      </View>
                    )}
                  </>
                )}

                {captureSubView === 'repeatMeal' && (
                  <RepeatMealView
                    entries={filteredRecentEntries}
                    allEntries={recentEntries}
                    searchValue={recentSearch}
                    onSearchChange={setRecentSearch}
                    typeFilter={recentTypeFilter}
                    onTypeFilterChange={setRecentTypeFilter}
                    onSelect={selectRecentEntry}
                    onBack={() => {
                      setCaptureSubView('main')
                      setRecentSearch('')
                      setRecentTypeFilter('')
                    }}
                    t={t}
                  />
                )}
              </>
            )}

            {/* ── STEP: ANALYZING ── */}
            {step === 'analyzing' && (
              <View className="py-10 items-center gap-6">
                {imageAssets.length > 0 ? (
                  <View className="w-full rounded-xl overflow-hidden" style={{ maxHeight: 240 }}>
                    <Image
                      source={{ uri: imageAssets[0].uri }}
                      style={{ width: '100%', height: 200 }}
                      resizeMode="cover"
                      className="opacity-60"
                    />
                    <View className="absolute inset-0 items-center justify-center">
                      <View className="bg-background/80 rounded-xl px-6 py-4 items-center gap-2">
                        <ActivityIndicator size="small" color="#a3e635" />
                        <Text className="font-sans text-sm text-foreground">
                          {t('nutrition.logger.analyzing')}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    <ActivityIndicator size="large" color="#a3e635" />
                    <Text className="font-sans text-sm text-muted-foreground">
                      {t('nutrition.logger.analyzing')}
                    </Text>
                    {/* Skeleton rows */}
                    {[0, 1, 2].map((i) => (
                      <View
                        key={i}
                        className="w-full h-10 rounded-lg bg-muted/40"
                        style={{ opacity: 1 - i * 0.2 }}
                      />
                    ))}
                  </>
                )}
                <Pressable
                  onPress={() => {
                    cancelledRef.current = true
                    setStep('capture')
                  }}
                  className="py-2 px-4"
                >
                  <Text className="font-mono text-xs tracking-widest text-muted-foreground">
                    {t('nutrition.logger.cancel')}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* ── STEP: REVIEW ── */}
            {step === 'review' && (
              <>
                {/* Meal type quick switch */}
                <View className="flex-row items-center justify-between">
                  <Text className="font-bebas text-xl tracking-wide text-foreground">
                    {mealLabel.toUpperCase()}
                  </Text>
                  <View className="flex-row gap-1">
                    {MEAL_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.id}
                        onPress={() => { setMealType(opt.id); haptics.selection() }}
                        className={cn(
                          'size-9 rounded-lg items-center justify-center',
                          mealType === opt.id
                            ? 'bg-lime-400/10 ring-1 ring-lime-400/30'
                            : 'active:bg-muted',
                        )}
                      >
                        <Text className="text-base">{opt.icon}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Daily progress context (compact) */}
                {goals && (
                  <DailyProgressBar
                    dailyTotals={dailyTotals}
                    mealTotals={totals}
                    goals={goals}
                    t={t}
                  />
                )}

                {/* Quick-add: recent foods */}
                {recentFoods.length > 0 && (
                  <View className="gap-2">
                    <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {t('nutrition.logger.recentMeals')}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-0.5">
                      {recentFoods.map((food, i) => (
                        <Pressable
                          key={`r-${i}`}
                          onPress={() => addRecentFood(food)}
                          className="px-3 py-1.5 rounded-full border border-border active:bg-muted/50"
                          style={{ minHeight: 36, justifyContent: 'center' }}
                        >
                          <Text className="font-sans text-xs text-muted-foreground">
                            + {food.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Food items list */}
                <View className="gap-2.5">
                  {foods.map((food, idx) => (
                    <FoodItemCard
                      key={idx}
                      food={food}
                      index={idx}
                      editingMacro={editingMacro}
                      editingMacroValue={editingMacroValue}
                      onEditingMacroChange={setEditingMacro}
                      onEditingMacroValueChange={setEditingMacroValue}
                      onCommitMacro={commitMacroEdit}
                      onUpdateFood={updateFood}
                      onRemove={removeFood}
                      t={t}
                    />
                  ))}
                </View>

                {/* AI meal description */}
                {mealDescription ? (
                  <View className="px-3 py-2.5 rounded-xl bg-lime-400/5 border border-lime-400/10">
                    <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                      {mealDescription}
                    </Text>
                  </View>
                ) : null}

                {/* Add food */}
                <Pressable
                  onPress={addFood}
                  className="flex-row items-center justify-center gap-2 min-h-[44px] rounded-xl border border-dashed border-border active:bg-lime-400/5"
                >
                  <Plus size={14} color="#71717a" />
                  <Text className="font-mono text-xs tracking-widest text-muted-foreground">
                    {t('nutrition.logger.addFood')}
                  </Text>
                </Pressable>

                {/* Total summary */}
                <TotalsSummary totals={totals} goals={goals} dailyTotals={dailyTotals} t={t} />

                {error && (
                  <View className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <Text className="text-sm text-red-400">{error}</Text>
                  </View>
                )}

                {/* Save button */}
                <Pressable
                  onPress={handleSave}
                  disabled={foods.length === 0}
                  className={cn(
                    'h-14 items-center justify-center rounded-xl',
                    foods.length === 0 ? 'bg-lime-400/50' : 'bg-lime-400 active:bg-lime-300',
                  )}
                >
                  <Text className="font-bebas text-lg tracking-widest text-zinc-900">
                    {t('nutrition.logger.saveMeal')}
                  </Text>
                </Pressable>
              </>
            )}

            {/* ── STEP: SAVING ── */}
            {step === 'saving' && (
              <View className="py-16 items-center gap-4">
                <ActivityIndicator size="large" color="#a3e635" />
                <Text className="font-sans text-sm text-muted-foreground">
                  {t('nutrition.logger.saving')}
                </Text>
              </View>
            )}

            {/* ── STEP: SUCCESS ── */}
            {step === 'success' && (
              <View className="py-6 gap-4">
                {/* Success icon */}
                <View className="items-center gap-3">
                  <View className="size-16 rounded-full bg-lime-400/10 border border-lime-400/20 items-center justify-center">
                    <Check size={28} color="#a3e635" />
                  </View>
                  <Text className="font-bebas text-2xl tracking-wide text-lime-400">
                    {t('nutrition.logger.mealRegistered')}
                  </Text>
                </View>

                {/* Meal summary */}
                <View className="p-4 bg-muted/30 border border-border rounded-xl gap-3">
                  <View className="flex-row items-center justify-between">
                    <View className="px-2 py-0.5 rounded-full bg-lime-400/10 border border-lime-400/20">
                      <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-400">
                        {mealLabel}
                      </Text>
                    </View>
                    <Text className="font-bebas text-xl text-foreground tabular-nums">
                      {Math.round(totals.calories)} kcal
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <MacroCell value={totals.protein} label={t('nutrition.protein')} color="text-sky-500" />
                    <MacroCell value={totals.carbs} label={t('nutrition.carbs')} color="text-amber-400" />
                    <MacroCell value={totals.fat} label={t('nutrition.fat')} color="text-pink-500" />
                  </View>
                  {goals && (
                    <Text className="font-sans text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
                      {Math.round(dailyTotals.calories + totals.calories)} / {Math.round(goals.dailyCalories)} kcal {t('nutrition.today') || 'hoy'}
                    </Text>
                  )}
                </View>

                {/* Actions */}
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={onClose}
                    className="flex-1 h-12 bg-lime-400 active:bg-lime-300 items-center justify-center rounded-xl"
                  >
                    <Text className="font-bebas text-lg tracking-wide text-zinc-900">
                      {t('nutrition.logger.done')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleResetForm}
                    className="flex-1 h-12 border border-border active:bg-muted items-center justify-center rounded-xl"
                  >
                    <Text className="font-bebas text-lg tracking-wide text-foreground">
                      {t('nutrition.logger.registerAnother')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Bottom padding so content clears keyboard */}
            <View style={{ height: 32 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MealTypeSelector({
  value,
  onChange,
  t,
}: {
  value: MealType
  onChange: (v: MealType) => void
  t: (key: string) => string
}) {
  return (
    <View className="flex-row gap-1.5 p-1 bg-muted/50 rounded-xl">
      {MEAL_OPTIONS.map((opt) => (
        <Pressable
          key={opt.id}
          onPress={() => onChange(opt.id)}
          className={cn(
            'flex-1 items-center gap-0.5 py-2 rounded-lg',
            value === opt.id
              ? 'bg-background shadow-sm'
              : 'active:bg-background/50',
          )}
        >
          <Text className="text-base leading-none">{opt.icon}</Text>
          <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">
            {t(opt.labelKey)}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function InputMethodCard({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 active:border-lime-400/40 active:bg-lime-400/5"
      style={{ width: '47%' }}
    >
      {icon}
      <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{label}</Text>
    </Pressable>
  )
}

interface RepeatMealViewProps {
  entries: NutritionEntry[]
  allEntries: NutritionEntry[]
  searchValue: string
  onSearchChange: (v: string) => void
  typeFilter: MealType | ''
  onTypeFilterChange: (v: MealType | '') => void
  onSelect: (entry: NutritionEntry) => void
  onBack: () => void
  t: (key: string) => string
}

function RepeatMealView({
  entries,
  allEntries,
  searchValue,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  onSelect,
  onBack,
  t,
}: RepeatMealViewProps) {
  return (
    <View className="gap-3">
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onBack}
          className="size-9 items-center justify-center rounded-lg active:bg-muted"
        >
          <ChevronLeft size={20} color="#a1a1aa" />
        </Pressable>
        <Text className="font-bebas text-lg tracking-wide text-foreground">
          {t('nutrition.logger.recentMeals')}
        </Text>
      </View>

      {/* Search */}
      {allEntries.length > 0 && (
        <>
          <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/30">
            <Search size={14} color="#71717a" />
            <TextInput
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder={t('nutrition.logger.recentMeals')}
              placeholderTextColor="#52525b"
              className="flex-1 font-sans text-sm text-foreground"
              style={{ fontSize: 14 }}
            />
            {searchValue.length > 0 && (
              <Pressable onPress={() => onSearchChange('')} className="p-0.5">
                <X size={14} color="#71717a" />
              </Pressable>
            )}
          </View>

          {/* Type filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-0.5">
            {(['', ...MEAL_OPTIONS.map((m) => m.id)] as const).map((type) => (
              <Pressable
                key={type || 'all'}
                onPress={() => onTypeFilterChange(type as MealType | '')}
                className={cn(
                  'px-2.5 py-1 rounded-full border',
                  typeFilter === type
                    ? 'bg-lime-400/15 border-lime-400/40'
                    : 'bg-muted/30 border-border active:border-lime-400/20',
                )}
                style={{ minHeight: 28, justifyContent: 'center' }}
              >
                <Text
                  className={cn(
                    'font-mono text-[11px]',
                    typeFilter === type ? 'text-lime-400' : 'text-muted-foreground',
                  )}
                >
                  {type ? t(MEAL_OPTIONS.find((m) => m.id === type)!.labelKey) : 'Todo'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Entries list */}
      {entries.length === 0 ? (
        <View className="py-12 items-center gap-2">
          <Text className="text-3xl">🍽️</Text>
          <Text className="font-sans text-sm text-muted-foreground">
            {t('nutrition.logger.noRecentMeals')}
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {entries.map((entry, i) => (
            <Pressable
              key={entry.id || i}
              onPress={() => onSelect(entry)}
              className="p-3.5 bg-muted/30 border border-border rounded-xl active:border-lime-400/30 active:bg-lime-400/[0.03] gap-1.5"
            >
              <View className="flex-row items-center justify-between">
                <View className="px-2 py-0.5 rounded-full bg-muted">
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {entry.mealType}
                  </Text>
                </View>
                <Text className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {new Date(entry.loggedAt).toLocaleDateString('es', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </Text>
              </View>
              <Text className="font-sans text-sm text-foreground" numberOfLines={1}>
                {entry.foods.map((f) => f.name).filter(Boolean).join(', ') || '—'}
              </Text>
              <View className="flex-row gap-3">
                <Text className="font-sans-medium text-xs text-foreground/80 tabular-nums">
                  {Math.round(entry.totalCalories)} kcal
                </Text>
                <Text className="font-sans text-xs text-sky-500 tabular-nums">
                  P {Math.round(entry.totalProtein)}g
                </Text>
                <Text className="font-sans text-xs text-amber-400 tabular-nums">
                  C {Math.round(entry.totalCarbs)}g
                </Text>
                <Text className="font-sans text-xs text-pink-500 tabular-nums">
                  G {Math.round(entry.totalFat)}g
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

interface FoodItemCardProps {
  food: FoodItem
  index: number
  editingMacro: { index: number; field: 'calories' | 'protein' | 'carbs' | 'fat' } | null
  editingMacroValue: string
  onEditingMacroChange: (v: { index: number; field: 'calories' | 'protein' | 'carbs' | 'fat' } | null) => void
  onEditingMacroValueChange: (v: string) => void
  onCommitMacro: (index: number, field: 'calories' | 'protein' | 'carbs' | 'fat', raw: string) => void
  onUpdateFood: (index: number, field: keyof FoodItem, value: string | number) => void
  onRemove: (index: number) => void
  t: (key: string) => string
}

function FoodItemCard({
  food,
  index,
  editingMacro,
  editingMacroValue,
  onEditingMacroChange,
  onEditingMacroValueChange,
  onCommitMacro,
  onUpdateFood,
  onRemove,
  t,
}: FoodItemCardProps) {
  const MACROS = [
    { field: 'calories' as const, label: 'kcal', color: 'text-foreground', suffix: ' kcal', isInt: true },
    { field: 'protein' as const, label: 'P', color: 'text-sky-500', suffix: 'g P', isInt: false },
    { field: 'carbs' as const, label: 'C', color: 'text-amber-400', suffix: 'g C', isInt: false },
    { field: 'fat' as const, label: 'G', color: 'text-pink-500', suffix: 'g G', isInt: false },
  ] as const

  return (
    <View className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      {/* Food name + remove */}
      <View className="flex-row items-center gap-2 p-3 pb-2">
        <TextInput
          value={food.name}
          onChangeText={(v) => onUpdateFood(index, 'name', v)}
          placeholder="Nombre del alimento"
          placeholderTextColor="#52525b"
          className="flex-1 font-sans text-base text-foreground"
          style={{ fontSize: 15 }}
        />
        <Pressable
          onPress={() => onRemove(index)}
          className="size-9 items-center justify-center rounded-lg active:bg-red-400/10"
          accessibilityLabel={`${t('common.delete')} ${food.name}`}
        >
          <X size={14} color="#71717a" />
        </Pressable>
      </View>

      {/* Portion info (read-only display — portion editing is simplified for mobile) */}
      <View className="px-3 pb-2 flex-row items-center gap-1">
        <Text className="font-mono text-[11px] text-muted-foreground">
          {food.portionAmount}{food.portionUnit}
        </Text>
        {food.portionNote ? (
          <Text className="font-sans text-[11px] text-muted-foreground/60">· {food.portionNote}</Text>
        ) : null}
      </View>

      {/* Macros row — tappable to edit */}
      <View className="px-3 py-2 bg-muted/30 border-t border-border/50 flex-row items-center gap-1 flex-wrap">
        {MACROS.map((macro) => {
          const isEditing = editingMacro?.index === index && editingMacro?.field === macro.field
          const rawVal = Number(food[macro.field]) || 0
          const displayVal = macro.isInt
            ? Math.round(rawVal)
            : Math.round(rawVal * 10) / 10

          if (isEditing) {
            return (
              <TextInput
                key={macro.field}
                value={editingMacroValue}
                onChangeText={onEditingMacroValueChange}
                onBlur={() => onCommitMacro(index, macro.field, editingMacroValue)}
                onSubmitEditing={() => onCommitMacro(index, macro.field, editingMacroValue)}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                className={cn('w-16 h-8 text-base px-1 rounded-lg border border-lime-400/40 bg-background text-center tabular-nums', macro.color)}
                style={{ fontSize: 14 }}
              />
            )
          }

          return (
            <Pressable
              key={macro.field}
              onPress={() => {
                onEditingMacroChange({ index, field: macro.field })
                onEditingMacroValueChange(String(displayVal))
              }}
              className={cn(
                'px-2 py-1.5 rounded-lg active:bg-muted/60',
                'min-h-[36px] items-center justify-center',
              )}
            >
              <Text className={cn('font-sans text-xs tabular-nums', macro.color)}>
                {displayVal}{macro.suffix}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function DailyProgressBar({
  dailyTotals,
  mealTotals,
  goals,
  t,
}: {
  dailyTotals: DailyTotals
  mealTotals: { calories: number; protein: number; carbs: number; fat: number }
  goals: NutritionGoal
  t: (key: string) => string
}) {
  const totalCal = dailyTotals.calories + mealTotals.calories
  const pct = goals.dailyCalories > 0 ? Math.min(totalCal / goals.dailyCalories, 1) : 0
  const over = totalCal > goals.dailyCalories

  return (
    <View className="p-3 rounded-xl bg-muted/30 border border-border/50 gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t('nutrition.today') || 'Hoy'}
        </Text>
        <Text className={cn('font-bebas text-sm tabular-nums', over ? 'text-red-400' : 'text-foreground')}>
          {Math.round(totalCal)} / {Math.round(goals.dailyCalories)} kcal
        </Text>
      </View>
      <View className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <View
          className={cn('h-full rounded-full', over ? 'bg-red-400' : 'bg-lime-400')}
          style={{ width: `${pct * 100}%` }}
        />
      </View>
    </View>
  )
}

function TotalsSummary({
  totals,
  goals,
  dailyTotals,
  t,
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number }
  goals: NutritionGoal | null
  dailyTotals: DailyTotals
  t: (key: string) => string
}) {
  return (
    <View className="p-4 bg-muted/40 rounded-xl border border-border/50 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Total
        </Text>
        <Text className="font-bebas text-2xl tabular-nums text-foreground">
          {Math.round(totals.calories)} kcal
        </Text>
      </View>
      <View className="flex-row gap-3">
        <MacroCell value={totals.protein} label={t('nutrition.protein')} color="text-sky-500" />
        <MacroCell value={totals.carbs} label={t('nutrition.carbs')} color="text-amber-400" />
        <MacroCell value={totals.fat} label={t('nutrition.fat')} color="text-pink-500" />
      </View>
    </View>
  )
}

function MacroCell({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color: string
}) {
  return (
    <View className="flex-1 items-center p-2 bg-background/50 rounded-lg gap-0.5">
      <Text className={cn('font-bebas text-lg tabular-nums', color)}>
        {Math.round(value)}g
      </Text>
      <Text className="font-mono text-[9px] tracking-wide text-muted-foreground">
        {label}
      </Text>
    </View>
  )
}
