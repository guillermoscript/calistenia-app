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
import { Camera, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import { DisclosureChevron } from '@/components/ui/disclosure-chevron'
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
import { useFrequentMeals } from '@calistenia/core/hooks/useFrequentMeals'
import { useNutritionProfilePrefill } from '@calistenia/core/hooks/useNutritionProfilePrefill'
import { syncUserPrimaryGoal, isNutritionPace } from '@calistenia/core/lib/nutrition-profile'
import { computeDailyQualityScore } from '@calistenia/core/lib/nutrition-quality'
import { op } from '@calistenia/core/lib/analytics'
import { qk } from '@calistenia/core/lib/query-keys'
import { useDayRollover } from '@/lib/use-day-rollover'
import { useDailyHealth } from '@/lib/health/useDailyHealth'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { BADGE_DEFINITIONS } from '@calistenia/core/lib/badge-definitions'
import { BadgeCelebrationDialog } from '@/components/nutrition/BadgeCelebrationDialog'
import { SCORE_COLORS } from '@calistenia/core/lib/style-tokens'
import type {
  BadgeType, NutritionGoal, NutritionGoalType, NutritionEntry, FoodItem, QualityScore, Sex, ActivityLevel,
} from '@calistenia/core/types'

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileMealLoggerActions } from '@/lib/use-mobile-meal-logger-actions'
import { syncNutritionWidget } from '@/lib/sync-nutrition-widget'
import NutritionDashboard from '@/components/nutrition/NutritionDashboard'
import NutritionGoalSetup from '@/components/nutrition/NutritionGoalSetup'
import MealLoggerSheet from '@/components/nutrition/MealLoggerSheet'
import { OneShotHint } from '@/components/ui/one-shot-hint'
import WaterTracker from '@/components/nutrition/WaterTracker'
import WeeklyNutritionChart from '@/components/nutrition/WeeklyNutritionChart'
import DailyMealPlan, { type PlannedMeal } from '@/components/nutrition/DailyMealPlan'
import ChangeGoalCard from '@/components/nutrition/ChangeGoalCard'
import FrequentMealsRow from '@/components/nutrition/FrequentMealsRow'
import WeeklyMealPlan from '@/components/nutrition/WeeklyMealPlan'
import { PantryPlanSection } from '@/components/nutrition/PantryPlanSection'
import { usePantryDepletion } from '@calistenia/core/hooks/usePantryDepletion'
import { PantryDepleteSheet } from '@/components/pantry/PantryDepleteSheet'
import CoachInsights from '@/components/nutrition/CoachInsights'
import NutritionShareButton from '@/components/share/NutritionShareButton'
import { Sentry } from '@/lib/instrument'

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
  const [phaseChangeBanner, setPhaseChangeBanner] = useState(false)
  const trainingPhaseRef = useRef<number | null>(null)
  // #243 F4b: cambio de objetivo post-onboarding — reabre el wizard sobre goals existentes
  const [showGoalSetup, setShowGoalSetup] = useState(false)
  const [pendingGoal, setPendingGoal] = useState<NutritionGoalType | null>(null)
  // Prefill del wizard desde `users` (peso/altura/actividad/ritmo/objetivo).
  const profileData = useNutritionProfilePrefill(userId)

  // ─── Core hooks ─────────────────────────────────────────────────────────────
  const nutrition = useNutrition(userId)
  const pantryDepletion = usePantryDepletion(userId, {
    captureException: (e, op) => Sentry.captureException(e, { tags: { feature: 'pantry', op } }),
    onConfirmSuccess: () => haptics.success(),
    onConfirmError: () => haptics.error(),
  })
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
    analyzeMeal,
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

  // Analizar/guardar: lógica compartida con web en core (`useMealLoggerActions`);
  // el adaptador solo traduce URIs → Blob y conserva la edición in-place.
  const clearEditing = useCallback(() => setEditingEntry(null), [])
  const { handleAnalyze, handleSave: handleSaveMobileEntry } = useMobileMealLoggerActions({
    userId,
    goals,
    entries: allEntries,
    analyzeMeal,
    scoreMealQuality,
    saveEntry,
    updateEntry,
    getRemainingMacros,
    editingEntry,
    onEditSaved: clearEditing,
  })

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
  const frequentMeals = useFrequentMeals({ enabled: isReady && !!goals, getRecentEntries })

  const handleQuickAddFrequent = useCallback((entry: NutritionEntry) => handleSaveMobileEntry({
    mealType: entry.mealType,
    foods: entry.foods,
    totalCalories: entry.totalCalories,
    totalProtein: entry.totalProtein,
    totalCarbs: entry.totalCarbs,
    totalFat: entry.totalFat,
    loggedAt: nowLocalForPB(),
  }), [handleSaveMobileEntry])

  // ─── Daily quality score + coach badge notifications ─────────────────────────
  const entries = useMemo(() => getEntriesForDate(selectedDate), [getEntriesForDate, selectedDate])
  const dailyTotals = useMemo(() => getDailyTotals(selectedDate), [getDailyTotals, selectedDate])
  const weeklyHistory = useMemo(() => getWeeklyHistory(), [getWeeklyHistory])

  // ─── Sync widget snapshot whenever today's totals, goals, racha or agua change ─
  // dailyInsight en deps: la racha de comidas la calcula upsertDailyInsight (más
  // abajo) de forma async, así que el primer sync del día puede llegar con
  // mealStreak desactualizado hasta que ese efecto resuelva y este se re-dispare.
  useEffect(() => {
    if (selectedDate === todayStr()) {
      void syncNutritionWidget(dailyTotals, goals ?? null, {
        mealStreak: dailyInsight?.streaks?.currentGood ?? 0,
        mealStreakToday: dailyInsight?.periodStart === todayStr()
          && (dailyInsight.overallScore === 'A' || dailyInsight.overallScore === 'B'),
      }, {
        waterMl: waterTotal,
        waterGoalMl: waterGoal,
      })
    }
  }, [dailyTotals, goals, selectedDate, dailyInsight, waterTotal, waterGoal])

  const dailyQualityScore = useMemo<QualityScore | undefined>(
    () => computeDailyQualityScore(entries),
    [entries],
  )

  // Badges nuevos → cola del dialog de celebración (#231); el haptic lo
  // dispara el propio dialog al mostrar cada badge.
  const [badgeQueue, setBadgeQueue] = useState<BadgeType[]>([])
  useEffect(() => {
    if (!dailyQualityScore || selectedDate !== todayStr()) return
    upsertDailyInsight(selectedDate, dailyQualityScore, entries).then(({ newBadges }) => {
      const earned = newBadges.filter(badge => BADGE_DEFINITIONS[badge])
      if (earned.length) setBadgeQueue(q => [...q, ...earned])
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
    // Wizard saves are user-reviewed/editable on the last step → 'manual'.
    await saveGoals({ ...newGoals, source: 'manual' })
    // Best-effort sync users.primary_goal (never blocks the save on failure).
    void syncUserPrimaryGoal(userId, newGoals.goal)
    // Registra el cambio venga de donde venga (picker → Ajustar, o el propio wizard).
    if (goals && newGoals.goal !== goals.goal) {
      op.track('goal_changed', { from: goals.goal, to: newGoals.goal, applied_recommended: false })
    }
    setPhaseChangeBanner(false)
    setShowGoalSetup(false)
    setPendingGoal(null)
  }, [saveGoals, userId, goals])

  // #243 F4b: aplicar el rango recomendado tal cual (sin pasar por el wizard).
  const handleApplyGoal = useCallback(async (goal: NutritionGoalType, preview: NutritionGoal) => {
    await saveGoals({ ...preview, source: 'auto' })
    void syncUserPrimaryGoal(userId, goal)
    if (goals) op.track('goal_changed', { from: goals.goal, to: goal, applied_recommended: true })
  }, [saveGoals, userId, goals])

  const handleAdjustGoal = useCallback((goal: NutritionGoalType) => {
    setPendingGoal(goal)
    setShowGoalSetup(true)
  }, [])

  const handleCalculateMacros = useCallback((
    weight: number, height: number, age: number, sex: Sex,
    activityLevel: ActivityLevel, goal: NutritionGoalType, pace?: string,
  ) => {
    const result = calculateMacros(weight, height, age, sex, activityLevel, goal, isNutritionPace(pace) ? pace : undefined)
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
      mealType: meal.meal_type,
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

  // ─── Goal setup (first run, or editing/changing goals) ───────────────────────
  if (!goals || showGoalSetup) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScrollView contentContainerClassName="px-4 py-6" keyboardShouldPersistTaps="handled">
          <NutritionGoalSetup
            onSave={handleSaveGoals}
            onCancel={goals ? () => { setShowGoalSetup(false); setPendingGoal(null) } : undefined}
            calculateMacros={handleCalculateMacros}
            initialWeight={goals ? goals.weight : profileData.weight}
            initialHeight={goals ? goals.height : profileData.height}
            initialAge={goals ? goals.age : profileData.age}
            initialSex={goals ? goals.sex : profileData.sex}
            initialActivityLevel={goals ? goals.activityLevel : profileData.activityLevel}
            initialGoal={goals ? (pendingGoal ?? goals.goal) : profileData.goalType}
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
                    setShowGoalSetup(true)
                  }}
                  className="flex-1 h-9 bg-lime-400"
                >
                  <Text className="font-mono text-[10px] tracking-widest uppercase text-zinc-900">{t('nutrition.recalculate')}</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        )}

        {/* #243 F4b: cambiar objetivo con preview de nuevo rango antes de aplicar */}
        <ChangeGoalCard
          goals={goals}
          pace={profileData.pace}
          onAdjust={handleAdjustGoal}
          onApply={handleApplyGoal}
        />

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

        {/* Hint one-shot: primera comida con foto (#235) */}
        {activeTab === 'today' && (
          <OneShotHint
            id="meal_photo"
            userId={userId}
            icon={Camera}
            text={t('hints.mealPhoto')}
            onPress={() => { haptics.medium(); setLoggerVisible(true) }}
            visible={isReady && allEntries.length === 0}
            className="mb-5"
          />
        )}

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
        {activeTab === 'today' && isToday && (
          <FrequentMealsRow meals={frequentMeals} onQuickAdd={handleQuickAddFrequent} />
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
                  {t('nutrition.coach.title')}
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
              <DisclosureChevron open={showCoach} size={16} color="rgba(255,255,255,0.45)" />
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
                    generateWeeklyInsight(todayStr(), allEntries, (authUser as { primary_goal?: string } | null)?.primary_goal || goals?.goal).catch((e) => { Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'generate_weekly_insight' } }) })
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
      {/* Celebración de badges (#231) — mismo gating que PantryDepleteSheet:
          no montar mientras el logger esté abierto (iOS, Modals hermanos). */}
      <BadgeCelebrationDialog
        badges={loggerVisible ? [] : badgeQueue}
        onDone={() => setBadgeQueue([])}
      />
    </SafeAreaView>
  )
}
