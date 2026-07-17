/**
 * NutritionPage (mobile) — pantalla de nutrición con dos sub-vistas:
 * HOY (seguimiento: date nav, ring + macros, agua, comidas, coach/tendencia)
 * y PLANIFICAR (hub de planificación: despensa, plan IA del día, plan desde
 * despensa, plan semanal). FAB logger con cámara compartido entre ambas.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MenuButton } from '@/components/QuickMenu'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'

import { useQueryClient } from '@tanstack/react-query'
import { todayStr, addDays, nowLocalForPB, startOfWeekStr } from '@calistenia/core/lib/dateUtils'
import { useSpendSummary } from '@calistenia/core/hooks/useSpend'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import { usePantryItems } from '@calistenia/core/hooks/usePantry'
import { usePantryPlan } from '@calistenia/core/hooks/usePantryPlan'
import { useNutritionCoach } from '@calistenia/core/hooks/useNutritionCoach'
import { useWeeklyMealPlan } from '@calistenia/core/hooks/useWeeklyMealPlan'
import { useWater } from '@calistenia/core/hooks/useWater'
import { computeDailyQualityScore } from '@calistenia/core/lib/nutrition-quality'
import { isPrimaryGoal, primaryGoalToNutritionGoalType } from '@calistenia/core/lib/primaryGoal'
import { qk } from '@calistenia/core/lib/query-keys'
import { useDayRollover } from '@/lib/use-day-rollover'
import { useDailyHealth } from '@/lib/health/useDailyHealth'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { BADGE_DEFINITIONS } from '@calistenia/core/lib/badge-definitions'
import { SCORE_COLORS } from '@calistenia/core/lib/style-tokens'
import type { NutritionGoal, NutritionEntry, FoodItem, QualityScore } from '@calistenia/core/types'

import { useLocalSearchParams, useRouter } from 'expo-router'
import { analyzeMealMobile, urisToBlobs } from '@/lib/nutrition-api'
import { syncNutritionWidget } from '@/lib/sync-nutrition-widget'
import NutritionDashboard from '@/components/nutrition/NutritionDashboard'
import NutritionGoalSetup from '@/components/nutrition/NutritionGoalSetup'
import MealLoggerSheet from '@/components/nutrition/MealLoggerSheet'
import WaterTracker from '@/components/nutrition/WaterTracker'
import WeeklyNutritionChart from '@/components/nutrition/WeeklyNutritionChart'
import DailyMealPlan from '@/components/nutrition/DailyMealPlan'
import WeeklyMealPlan from '@/components/nutrition/WeeklyMealPlan'
import { PantryPlanSection } from '@/components/nutrition/PantryPlanSection'
import { usePantryDepletion } from '@/components/pantry/use-pantry-depletion'
import { PantryDepleteSheet } from '@/components/pantry/PantryDepleteSheet'
import CoachInsights from '@/components/nutrition/CoachInsights'
import NutritionShareButton from '@/components/share/NutritionShareButton'
import { Sentry } from '@/lib/instrument'

type PlannedMeal = {
  meal_type: string
  label: string
  calories: number
  protein: number
  carbs: number
  fat: number
  description?: string
}

interface UserProfileData {
  weight?: number
  height?: number
  age?: number
  sex?: 'male' | 'female'
  goalWeight?: number
  activityLevel?: string
  pace?: string
  goalType?: string
}

const ONBOARDING_ACTIVITY_MAP: Record<string, string> = {
  sedentary: 'sedentary',
  light: 'light',
  active: 'moderate',
  very_active: 'active',
}

function inferGoalType(weight?: number, goalWeight?: number, primaryGoal?: unknown): string | undefined {
  // Objetivo explícito del onboarding (#226); el delta de peso es solo fallback.
  if (isPrimaryGoal(primaryGoal)) return primaryGoalToNutritionGoalType(primaryGoal)
  if (!weight || !goalWeight) return undefined
  const delta = goalWeight - weight
  if (delta > 2) return 'muscle_gain'
  if (delta < -2) return 'fat_loss'
  return 'maintain'
}

export default function NutritionTab() {
  const { t } = useTranslation()
  const authUser = useAuthUser()
  const userId = authUser?.id ?? null
  const router = useRouter()
  const queryClient = useQueryClient()
  const { action, date: dateParam } = useLocalSearchParams<{ action?: string; date?: string }>()

  const [selectedDate, setSelectedDate] = useState(dateParam || todayStr())
  const [activeTab, setActiveTab] = useState<'today' | 'plan'>('today')
  const [showCoach, setShowCoach] = useState(false)
  const [loggerVisible, setLoggerVisible] = useState(false)
  const [editingEntry, setEditingEntry] = useState<NutritionEntry | null>(null)
  const [profileData, setProfileData] = useState<UserProfileData>({})
  const [phaseChangeBanner, setPhaseChangeBanner] = useState(false)
  const trainingPhaseRef = useRef<number | null>(null)

  // ─── Core hooks ─────────────────────────────────────────────────────────────
  const nutrition = useNutrition(userId)
  const pantryDepletion = usePantryDepletion(userId)
  const {
    goals,
    entries: allEntries,
    isReady,
    saveGoals,
    saveEntry,
    deleteEntry,
    updateEntry,
    calculateMacros,
    getDailyTotals,
    getEntriesForDate,
    fetchEntriesForDate,
    fetchEntriesForDateRange,
    getWeeklyHistory,
    getRecentEntries,
    scoreMealQuality,
    getRemainingMacros,
  } = nutrition

  const { dayTotal: waterTotal, goal: waterGoal, addWater, setGoal: setWaterGoal, adding: waterAdding } = useWater(userId, selectedDate)

  const { data: pantryItems = [] } = usePantryItems(userId)
  const pantryCount = pantryItems.length

  // F5 (#174): gasto de la semana ACTUAL (V1; días fuera de esta semana no traen badge)
  const spendData = useSpendSummary(userId, startOfWeekStr()).data

  const pantryPlan = usePantryPlan(userId)
  // Solo se usa en JSX tras el early-return de !goals; el ?? 0 es para el narrow de TS.
  const pantryGoals = {
    calories: goals?.dailyCalories ?? 0,
    protein: goals?.dailyProtein ?? 0,
    carbs: goals?.dailyCarbs ?? 0,
    fat: goals?.dailyFat ?? 0,
  }

  const {
    activePlan: weeklyPlan,
    planDays: weeklyPlanDays,
    isLoading: weeklyLoading,
    generatePlan: generateWeeklyPlan,
    regenerateDay: regenerateWeeklyDay,
    logMeal: logWeeklyMeal,
    deleteMeal: deleteWeeklyMeal,
    archivePlan: archiveWeeklyPlan,
    refresh: refreshWeeklyPlan,
  } = useWeeklyMealPlan(userId)

  const {
    dailyInsight,
    weeklyInsight,
    badges,
    generatingWeekly,
    loadBadges,
    upsertDailyInsight,
    generateWeeklyInsight,
  } = useNutritionCoach(userId)

  // Mobile analyze: uses URI-based API instead of File objects
  const handleAnalyze = useCallback(async (
    images: { uri: string; mimeType?: string; fileName?: string }[],
    mealType: string,
    description?: string,
    eatenHour?: number,
  ) => {
    const remaining = getRemainingMacros()
    const recentScores = allEntries
      .filter(e => e.qualityScore)
      .slice(0, 5)
      .map(e => ({ mealType: e.mealType, score: e.qualityScore!, loggedAt: e.loggedAt }))
    return analyzeMealMobile(images, mealType, description, {
      goal: goals?.goal,
      remainingMacros: remaining,
      recentScores: recentScores.length > 0 ? recentScores : undefined,
      // Hour the food was eaten (photo EXIF / finish time), else current hour.
      logHour: eatenHour != null && Number.isFinite(eatenHour) ? eatenHour : new Date().getHours(),
    })
  }, [goals, allEntries, getRemainingMacros])

  // Mobile save: handles photo URIs
  const handleSaveMobileEntry = useCallback(async (
    entry: Omit<NutritionEntry, 'id' | 'user'>,
    photoUris?: string[],
  ): Promise<string | void> => {
    // Edit flow: update the existing record in place, preserving its original loggedAt.
    if (editingEntry?.id) {
      const { loggedAt: _loggedAt, ...patch } = entry
      await updateEntry(editingEntry.id, patch)
      setEditingEntry(null)
      return
    }
    // Read photo URIs to Blobs and create the entry WITH them in one request, so
    // the cached entry carries populated photoUrls right away (mirrors web's
    // File[] path). If a Blob read fails, fall back to saving without photos
    // rather than losing the whole meal.
    let photoFiles: Blob[] | undefined
    if (photoUris && photoUris.length > 0) {
      try {
        photoFiles = await urisToBlobs(photoUris)
      } catch (e) {
        Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'read_meal_photos' } })
      }
    }
    const saved = await saveEntry({ ...entry, user: userId || undefined }, photoFiles)
    // Async quality scoring for manual entries
    if (!saved.qualityScore && saved.foods.length > 0) {
      scoreMealQuality(
        saved.foods.map(f => ({
          name: f.name || '?',
          calories: (f.baseCal100 || 0) * (f.portionAmount || 1),
          protein: (f.baseProt100 || 0) * (f.portionAmount || 1),
          carbs: (f.baseCarbs100 || 0) * (f.portionAmount || 1),
          fat: (f.baseFat100 || 0) * (f.portionAmount || 1),
        })),
        { calories: saved.totalCalories, protein: saved.totalProtein, carbs: saved.totalCarbs, fat: saved.totalFat },
        saved.mealType,
        goals ? { goal: goals.goal, remainingMacros: getRemainingMacros() } : undefined,
      ).then(async quality => {
        if (quality && saved.id && !saved.id.startsWith('local_')) {
          await updateEntry(saved.id, {
            qualityScore: quality.score,
            qualityBreakdown: quality.breakdown,
            qualityMessage: quality.message,
            qualitySuggestion: quality.suggestion,
          }).catch((e) => { Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'update_quality_score' } }) })
        }
      }).catch((e) => { Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'score_meal_quality' } }) })
    }
    return saved.id
  }, [saveEntry, userId, scoreMealQuality, goals, getRemainingMacros, updateEntry, editingEntry])

  // ─── Load user profile ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (!available) return
      try {
        const user = await pb.collection('users').getOne(userId)
        const weight = user.weight || undefined
        const goalWeight = user.goal_weight || undefined
        setProfileData({
          weight,
          height: user.height || undefined,
          age: user.age || undefined,
          sex: user.sex || undefined,
          goalWeight,
          activityLevel: user.activity_level ? ONBOARDING_ACTIVITY_MAP[user.activity_level] : undefined,
          pace: user.pace || undefined,
          goalType: inferGoalType(weight, goalWeight, user.primary_goal),
        })
      } catch { /* ignore */ }
    }
    load()
  }, [userId])

  // ─── Load badges on mount ────────────────────────────────────────────────────
  useEffect(() => { loadBadges() }, [loadBadges])

  // ─── Deep-link quick-add (calistenia://nutrition?action=camera|text) ─────────
  useEffect(() => {
    if (action === 'camera' || action === 'text') {
      setLoggerVisible(true)
      router.setParams({ action: undefined })
    }
  }, [action]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sync entries for selected date ─────────────────────────────────────────
  useEffect(() => {
    fetchEntriesForDate(selectedDate)
  }, [selectedDate, fetchEntriesForDate])

  // Deep-link: cuando se navega aquí con ?date (p.ej. desde el Calendario), saltar
  // a ese día. El tab queda montado, así que el initializer de useState no basta.
  useEffect(() => {
    if (dateParam) { setSelectedDate(dateParam); setActiveTab('today') }
  }, [dateParam])

  // ─── Day rollover ────────────────────────────────────────────────────────────
  // The tab can stay mounted across midnight; without this, selectedDate stays
  // frozen on yesterday and the calorie ring/water/widget never reset to the new
  // day. On rollover, if the user was viewing "today", advance to the new today
  // and refetch the accumulator (its midnight boundary is recomputed on fetch).
  // A user inspecting a past day is left untouched.
  useDayRollover((newToday, prevToday) => {
    setSelectedDate(d => (d === prevToday ? newToday : d))
    if (userId) queryClient.invalidateQueries({ queryKey: qk.nutrition.today(userId) })
  })

  // ─── Preload last 7 days for weekly chart ────────────────────────────────────
  useEffect(() => {
    fetchEntriesForDateRange(addDays(todayStr(), -6), todayStr())
  }, [fetchEntriesForDateRange])

  // ─── Frequent meals (re-log quick-tap) ──────────────────────────────────────
  const [frequentMeals, setFrequentMeals] = useState<NutritionEntry[]>([])
  useEffect(() => {
    if (!isReady || !goals) return
    const load = async () => {
      const recent = await getRecentEntries(20)
      const signature = (e: NutritionEntry) => e.foods.map(f => f.name).sort().join('|')
      const groups = new Map<string, { entry: NutritionEntry; count: number }>()
      for (const entry of recent) {
        const sig = signature(entry)
        if (!sig) continue
        const existing = groups.get(sig)
        if (existing) existing.count++
        else groups.set(sig, { entry, count: 1 })
      }
      const frequent = [...groups.values()]
        .filter(g => g.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map(g => g.entry)
      setFrequentMeals(frequent)
    }
    load()
  }, [isReady, goals, getRecentEntries])

  // ─── Daily quality score + coach badge notifications ─────────────────────────
  const entries = useMemo(() => getEntriesForDate(selectedDate), [getEntriesForDate, selectedDate])
  const dailyTotals = useMemo(() => getDailyTotals(selectedDate), [getDailyTotals, selectedDate])
  const weeklyHistory = useMemo(() => getWeeklyHistory(), [getWeeklyHistory])

  // ─── Sync widget snapshot whenever today's totals or goals change ────────────
  useEffect(() => {
    if (selectedDate === todayStr()) {
      void syncNutritionWidget(dailyTotals, goals ?? null)
    }
  }, [dailyTotals, goals, selectedDate])

  const dailyQualityScore = useMemo<QualityScore | undefined>(
    () => computeDailyQualityScore(entries),
    [entries],
  )

  useEffect(() => {
    if (!dailyQualityScore || selectedDate !== todayStr()) return
    upsertDailyInsight(selectedDate, dailyQualityScore, entries).then(({ newBadges }) => {
      for (const badge of newBadges) {
        const def = BADGE_DEFINITIONS[badge]
        if (def) {
          haptics.success()
          Alert.alert(`${def.icon} ${def.label}`, def.description)
        }
      }
    }).catch((e) => { Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'upsert_daily_insight' } }) })
  }, [dailyQualityScore, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Missed goals alert (US-15) ──────────────────────────────────────────────
  const missedGoalsAlert = useMemo(() => {
    if (!goals) return false
    const last3 = weeklyHistory.slice(3, 6)
    const missed = last3.filter(d => d.calories > 0 && d.calories < goals.dailyCalories * 0.7)
    return missed.length >= 2
  }, [weeklyHistory, goals])

  // ─── Calorías activas del reloj (Health Connect) para este día ───────────────
  // El reloj quemó X kcal → amplían el budget de calorías del día (modelo
  // "comes lo que quemas"). OJO: el TDEE ya incluye un multiplicador de actividad,
  // así que sumar esto puede doble-contar si el usuario eligió un nivel alto.
  const dailyHealth = useDailyHealth(selectedDate)
  const activeCalories = Math.max(0, Math.round(dailyHealth?.active_calories ?? 0))

  // ─── Remaining macros (siempre de HOY: alimentan el plan IA en PLANIFICAR,
  // que planifica el día en curso aunque se esté inspeccionando otra fecha) ────
  const todayTotals = useMemo(() => getDailyTotals(todayStr()), [getDailyTotals])
  const todayEntries = useMemo(() => getEntriesForDate(todayStr()), [getEntriesForDate])
  const remaining = useMemo(() => {
    if (!goals) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    // activeCalories viene del health del día seleccionado; solo aplica si es hoy.
    const extra = selectedDate === todayStr() ? activeCalories : 0
    return {
      calories: goals.dailyCalories + extra - todayTotals.calories,
      protein: goals.dailyProtein - todayTotals.protein,
      carbs: goals.dailyCarbs - todayTotals.carbs,
      fat: goals.dailyFat - todayTotals.fat,
    }
  }, [goals, todayTotals, activeCalories, selectedDate])

  const loggedMealTypes = useMemo(
    () => [...new Set(todayEntries.map(e => e.mealType))],
    [todayEntries]
  )

  // ─── Save goals ──────────────────────────────────────────────────────────────
  const handleSaveGoals = useCallback(async (newGoals: NutritionGoal) => {
    await saveGoals(newGoals)
    setPhaseChangeBanner(false)
  }, [saveGoals])

  const handleCalculateMacros = useCallback((
    weight: number, height: number, age: number, sex: string,
    activityLevel: string, goal: string, pace?: string,
  ) => {
    const result = calculateMacros(weight, height, age, sex as any, activityLevel as any, goal as any, pace as any)
    return {
      dailyCalories: result.dailyCalories,
      dailyProtein: result.dailyProtein,
      dailyCarbs: result.dailyCarbs,
      dailyFat: result.dailyFat,
    }
  }, [calculateMacros])

  const handleSavePlannedMeal = useCallback(async (meal: PlannedMeal) => {
    const food: FoodItem = {
      name: meal.label,
      portionAmount: 1,
      portionUnit: 'unidad',
      unitWeightInGrams: 0,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      baseCal100: meal.calories,
      baseProt100: meal.protein,
      baseCarbs100: meal.carbs,
      baseFat100: meal.fat,
      tags: ['plan-ia'],
    }
    await saveEntry({
      user: userId || undefined,
      mealType: meal.meal_type as any,
      foods: [food],
      totalCalories: meal.calories,
      totalProtein: meal.protein,
      totalCarbs: meal.carbs,
      totalFat: meal.fat,
      aiModel: 'meal-plan',
      source: 'ai_daily_plan',
      loggedAt: nowLocalForPB(),
    })
  }, [saveEntry, userId])

  // Stable dashboard callbacks (so memoized meal cards don't re-render on every
  // parent render). Duplicate surfaces save failures instead of losing the meal.
  const handleDuplicateEntry = useCallback(async (entry: NutritionEntry) => {
    haptics.medium()
    try {
      await saveEntry({
        user: userId || undefined,
        mealType: entry.mealType,
        foods: entry.foods.map(f => ({ ...f })),
        totalCalories: entry.totalCalories,
        totalProtein: entry.totalProtein,
        totalCarbs: entry.totalCarbs,
        totalFat: entry.totalFat,
        loggedAt: nowLocalForPB(),
      })
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'duplicate_meal_entry' } })
      haptics.error()
      Alert.alert(t('nutrition.logger.saveError', { defaultValue: 'No se pudo guardar' }))
    }
  }, [saveEntry, userId, t])

  const handleEditEntry = useCallback((entry: NutritionEntry) => {
    haptics.medium()
    setEditingEntry(entry)
    setLoggerVisible(true)
  }, [])

  const isToday = selectedDate === todayStr()

  // ─── Date navigation helpers ─────────────────────────────────────────────────
  const goToPrevDay = useCallback(() => { haptics.light(); setSelectedDate(d => addDays(d, -1)) }, [])
  const goToNextDay = useCallback(() => { haptics.light(); setSelectedDate(d => addDays(d, 1)) }, [])
  const goToToday = useCallback(() => { haptics.medium(); setSelectedDate(todayStr()) }, [])

  const swipeGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-20, 20])
      .failOffsetY([-15, 15])
      .onEnd((e) => {
        if (e.translationX < -60) runOnJS(goToNextDay)()
        else if (e.translationX > 60) runOnJS(goToPrevDay)()
      }),
    [goToNextDay, goToPrevDay]
  )

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (!isReady) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="px-4 pt-4 pb-2">
          <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground mb-1">{t('nutrition.subtitle')}</Text>
          <Text className="font-bebas text-4xl text-foreground">{t('nutrition.title')}</Text>
        </View>
        <View className="px-4 gap-3 mt-4">
          {[1, 2, 3].map(i => (
            <View key={i} className="h-20 bg-muted rounded-xl opacity-50" />
          ))}
        </View>
      </SafeAreaView>
    )
  }

  // ─── Goal setup (first run) ──────────────────────────────────────────────────
  if (!goals) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScrollView contentContainerClassName="px-4 py-6">
          <NutritionGoalSetup
            onSave={handleSaveGoals}
            calculateMacros={handleCalculateMacros}
            initialWeight={profileData.weight}
            initialHeight={profileData.height}
            initialAge={profileData.age}
            initialSex={profileData.sex}
            initialActivityLevel={profileData.activityLevel}
            initialGoal={profileData.goalType}
            initialPace={profileData.pace}
          />
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ─── Main nutrition screen ────────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-4 pb-32"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="pt-4 pb-2 flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground mb-1">
              {t('nutrition.subtitle')}
            </Text>
            <Text className="font-bebas text-4xl text-foreground">{t('nutrition.title')}</Text>
          </View>
          <MenuButton className="mt-1" />
        </View>

        {/* Phase change banner (US-14) */}
        {phaseChangeBanner && (
          <Card className="border-lime-400/30 bg-lime-400/5 mb-4">
            <CardContent className="p-4">
              <Text className="text-sm font-sans-medium text-lime-400 mb-1">
                {t('nutrition.phaseChange', { phase: trainingPhaseRef.current })}
              </Text>
              <Text className="text-xs text-muted-foreground mb-3">
                {t('nutrition.phaseChangeDesc')}
              </Text>
              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  onPress={() => setPhaseChangeBanner(false)}
                  className="flex-1 h-9"
                >
                  <Text className="font-mono text-[10px] tracking-widest uppercase">{t('nutrition.ignore')}</Text>
                </Button>
                <Button
                  onPress={() => {
                    setPhaseChangeBanner(false)
                    saveGoals({ ...goals, dailyCalories: -1 })
                  }}
                  className="flex-1 h-9 bg-lime-400"
                >
                  <Text className="font-mono text-[10px] tracking-widest uppercase text-zinc-900">{t('nutrition.recalculate')}</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Missed goals alert (US-15) */}
        {missedGoalsAlert && (
          <View className="flex-row gap-3 mb-4 px-1">
            <View className="w-1 shrink-0 rounded-full bg-amber-400/60" />
            <View className="flex-1">
              <Text className="text-sm font-sans-medium text-amber-400">{t('nutrition.missedGoalsTitle')}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t('nutrition.missedGoalsDesc')}</Text>
            </View>
          </View>
        )}

        {/* Sub-vistas: HOY (seguimiento) / PLANIFICAR (hub de planes) */}
        <View className="flex-row mb-5 border-b border-border">
          {(['today', 'plan'] as const).map(tab => (
            <Pressable
              key={tab}
              onPress={() => { haptics.selection(); setActiveTab(tab) }}
              className={cn(
                'flex-1 items-center pb-2.5 -mb-px border-b-2',
                activeTab === tab ? 'border-lime-400' : 'border-transparent',
              )}
            >
              <Text className={cn(
                'font-bebas text-base tracking-[2px]',
                activeTab === tab ? 'text-lime-400' : 'text-muted-foreground',
              )}>
                {tab === 'today' ? t('nutrition.tabs.today') : t('nutrition.tabs.plan')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Date navigator — swipe left/right to change day */}
        {activeTab === 'today' && (
          <GestureDetector gesture={swipeGesture}>
            <View className="flex-row items-center gap-3 mb-5">
              <Pressable
                onPress={goToPrevDay}
                className="size-9 rounded-full bg-muted/60 items-center justify-center active:bg-muted"
              >
                <ChevronLeft size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} />
              </Pressable>
              <View className="flex-1">
                <Text className="text-sm font-sans-medium text-foreground capitalize text-center">
                  {isToday ? t('common.today') : formatDate(selectedDate)}
                </Text>
                {!isToday && (
                  <Text className="text-[10px] font-mono text-muted-foreground text-center">{selectedDate}</Text>
                )}
              </View>
              <Pressable
                onPress={goToNextDay}
                className="size-9 rounded-full bg-muted/60 items-center justify-center active:bg-muted"
              >
                <ChevronRight size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} />
              </Pressable>
              {!isToday && (
                <Pressable onPress={goToToday}>
                  <Text className="font-mono text-[10px] text-lime-400 tracking-widest uppercase">{t('common.today')}</Text>
                </Pressable>
              )}
            </View>
          </GestureDetector>
        )}

        {/* Water tracker */}
        {activeTab === 'today' && (
          <View className="mb-5">
            <WaterTracker
              todayTotal={waterTotal}
              goal={waterGoal}
              onAdd={isToday ? addWater : undefined}
              onSetGoal={setWaterGoal}
              adding={waterAdding}
            />
          </View>
        )}

        {/* Frequent meals quick-tap */}
        {activeTab === 'today' && isToday && frequentMeals.length > 0 && (
          <View className="mb-5">
            <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground mb-3">
              {t('nutrition.frequentMeals')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2.5 px-0.5"
            >
              {frequentMeals.map((entry, i) => {
                const foodNames = entry.foods.map(f => f.name).filter(Boolean)
                const summary = foodNames.length > 2
                  ? foodNames.slice(0, 2).join(', ') + ` +${foodNames.length - 2}`
                  : foodNames.join(', ')
                return (
                  <Pressable
                    key={i}
                    onPress={async () => {
                      haptics.medium()
                      try {
                        await handleSaveMobileEntry({
                          mealType: entry.mealType,
                          foods: entry.foods,
                          totalCalories: entry.totalCalories,
                          totalProtein: entry.totalProtein,
                          totalCarbs: entry.totalCarbs,
                          totalFat: entry.totalFat,
                          loggedAt: nowLocalForPB(),
                        })
                      } catch (e) {
                        Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'quick_add_recent_entry' } })
                        haptics.error()
                        Alert.alert(t('nutrition.logger.saveError', { defaultValue: 'No se pudo guardar' }))
                      }
                    }}
                    className="w-40 p-3 bg-card border border-border rounded-xl active:border-lime-400/40"
                  >
                    <Text className="text-xs font-sans-medium text-foreground" numberOfLines={1}>
                      {summary || t('nutrition.noName')}
                    </Text>
                    <Text className="font-mono text-[10px] text-muted-foreground mt-1">
                      {Math.round(entry.totalCalories)} kcal · {Math.round(entry.totalProtein)}g P
                    </Text>
                    <View className="flex-row items-center gap-1 mt-1.5">
                      <Plus size={10} className="text-lime-400" />
                      <Text className="font-mono text-[9px] text-lime-400 tracking-widest uppercase">{t('nutrition.register')}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Dashboard: calorie ring + macro bars + meal entries */}
        {activeTab === 'today' && (
          <View className="mb-5">
            <NutritionDashboard
              dailyTotals={dailyTotals}
              goals={goals}
              entries={entries}
              onDeleteEntry={deleteEntry}
              onDuplicateEntry={handleDuplicateEntry}
              onEditEntry={handleEditEntry}
              selectedDate={selectedDate}
              dailyQualityScore={dailyQualityScore}
              activeCalories={activeCalories}
              spend={spendData?.summary}
              entryCosts={spendData?.costByEntry}
            />
          </View>
        )}

        {/* Share card — solo en HOY y con al menos una comida registrada */}
        {activeTab === 'today' && entries.length > 0 && (
          <View className="mb-5">
            <NutritionShareButton
              date={selectedDate}
              totals={dailyTotals}
              goals={goals}
              waterMl={waterTotal}
              waterGoal={waterGoal}
              qualityScore={dailyQualityScore}
              mealCount={entries.length}
              userName={(authUser?.display_name as string) || (authUser?.name as string) || 'Atleta'}
              avatarUrl={authUser ? getUserAvatarUrl(authUser as any, '200x200') : null}
              referralCode={(authUser?.referral_code as string) || null}
              entries={entries}
            />
          </View>
        )}

        {/* ── PLANIFICAR: despensa → plan del día → plan desde despensa → semanal ── */}
        {activeTab === 'plan' && (
          <View className="mb-5 gap-6">
            {/* Despensa: el inventario que alimenta los planes */}
            <Pressable
              onPress={() => router.push('/pantry')}
              className="flex-row items-end justify-between border-b border-border pb-4 active:opacity-70"
            >
              <View className="gap-1.5">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  {t('pantry.title')}
                </Text>
                {pantryCount > 0 ? (
                  <Text className="font-bebas text-3xl leading-none text-foreground">
                    {pantryCount}
                    <Text className="font-mono text-[10px] tracking-[2px] text-muted-foreground">
                      {'  '}{t('nutrition.planHub.foods').toUpperCase()}
                    </Text>
                  </Text>
                ) : (
                  <Text className="font-sans text-xs text-muted-foreground">
                    {t('nutrition.planHub.empty')}
                  </Text>
                )}
              </View>
              <View className="flex-row items-center gap-1 pb-0.5">
                <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-400">
                  {t('nutrition.planHub.manage')}
                </Text>
                <ChevronRight size={12} color="#a3e635" />
              </View>
            </Pressable>

            {/* Plan IA del día — siempre planifica HOY; se oculta solo sin budget */}
            <DailyMealPlan
              remaining={remaining}
              goals={pantryGoals}
              loggedMealTypes={loggedMealTypes}
              onSaveMeal={handleSavePlannedMeal}
            />

            {/* Plan del día desde la despensa */}
            <PantryPlanSection userId={userId} goals={pantryGoals} />

            {/* Plan semanal */}
            <View className="border-t border-border pt-5">
              <WeeklyMealPlan
                activePlan={weeklyPlan}
                planDays={weeklyPlanDays}
                isLoading={weeklyLoading}
                goals={goals}
                getDailyTotals={getDailyTotals}
                onGenerate={() => generateWeeklyPlan(goals).then(() => {})}
                onRegenerateDay={regenerateWeeklyDay}
                onLogMeal={logWeeklyMeal}
                onDeleteMeal={deleteWeeklyMeal}
                onArchive={archiveWeeklyPlan}
                onRefresh={refreshWeeklyPlan}
                hasPantry={pantryPlan.hasPantry}
                onGenerateFromPantry={() => pantryPlan.generateWeek(pantryGoals)}
              />
            </View>
          </View>
        )}

        {/* Coach & tendencia (collapsible) */}
        {activeTab === 'today' && (
          <View className="mb-5">
            <Pressable
              onPress={() => { haptics.light(); setShowCoach(v => !v) }}
              className="flex-row items-center justify-between border-t border-border py-3"
            >
              <View className="flex-row items-center gap-2">
                <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground">
                  {t('nutrition.coach.title', 'Coach')}
                </Text>
                {dailyInsight?.overallScore && (
                  <View className={cn('rounded px-1.5 py-0.5', SCORE_COLORS[dailyInsight.overallScore])}>
                    <Text className="font-bebas text-xs leading-none">{dailyInsight.overallScore}</Text>
                  </View>
                )}
                {badges.length > 0 && (
                  <Text className="font-mono text-[9px] text-amber-400">{badges.length} 🏅</Text>
                )}
              </View>
              <ChevronLeft
                size={16}
                color="rgba(255,255,255,0.45)"
                style={{ transform: [{ rotate: showCoach ? '-90deg' : '90deg' }] }}
              />
            </Pressable>

            {showCoach && (
              <View className="gap-4 pt-1">
                <CoachInsights
                  entries={entries}
                  dailyInsight={dailyInsight}
                  weeklyInsight={weeklyInsight}
                  badges={badges}
                  generatingWeekly={generatingWeekly}
                  onGenerateWeekly={() => {
                    generateWeeklyInsight(todayStr(), allEntries, goals?.goal).catch((e) => { Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'generate_weekly_insight' } }) })
                  }}
                />
                <WeeklyNutritionChart
                  history={weeklyHistory}
                  calorieGoal={goals.dailyCalories}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB: meal logger */}
      <Pressable
        onPress={() => { haptics.medium(); setLoggerVisible(true) }}
        className="absolute bottom-8 right-5 size-14 rounded-full bg-lime-400 items-center justify-center shadow-lg active:bg-lime-300"
        style={{ shadowColor: 'hsl(74 90% 45%)', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}
      >
        <Plus size={28} color="#1a2000" strokeWidth={2.5} />
      </Pressable>

      {/* Meal logger bottom sheet */}
      <MealLoggerSheet
        visible={loggerVisible}
        onClose={() => { setLoggerVisible(false); setEditingEntry(null) }}
        onAnalyze={handleAnalyze}
        onSave={handleSaveMobileEntry}
        onSaved={pantryDepletion.runMatch}
        userId={userId}
        dailyTotals={dailyTotals}
        goals={goals}
        getRecentEntries={getRecentEntries}
        editEntry={editingEntry}
      />
      {/* Se presenta recién al CERRAR el logger: iOS no soporta dos Modals hermanos
          visibles a la vez, y así el sheet aparece después de la pantalla de éxito. */}
      <PantryDepleteSheet
        rows={loggerVisible ? null : pantryDepletion.rows}
        onConfirm={pantryDepletion.confirm}
        onDismiss={pantryDepletion.dismiss}
      />
    </SafeAreaView>
  )
}
