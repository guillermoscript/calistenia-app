import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { todayStr, addDays, nowLocalForPB, startOfWeekStr } from '@calistenia/core/lib/dateUtils'
import { computeDailyQualityScore } from '@calistenia/core/lib/nutrition-quality'
import { inferNutritionGoalType, ONBOARDING_ACTIVITY_TO_NUTRITION, previewNutritionGoal, nutritionGoalTypeToPrimaryGoal } from '@calistenia/core/lib/nutritionGoal'
import { op } from '@calistenia/core/lib/analytics'
import { Input } from '../components/ui/input'
import NutritionGoalSetup from '../components/nutrition/NutritionGoalSetup'
import NutritionDashboard from '../components/nutrition/NutritionDashboard'
import MealLogger from '../components/nutrition/MealLogger'
import MealSuggestions from '../components/nutrition/MealSuggestions'
import WeeklyNutritionChart from '../components/nutrition/WeeklyNutritionChart'
import DailyMealPlan, { type PlannedMeal } from '../components/nutrition/DailyMealPlan'
import DailySummaryCard from '../components/nutrition/DailySummaryCard'
import WeeklyMealPlan from '../components/nutrition/WeeklyMealPlan'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import { useNutritionCoach } from '@calistenia/core/hooks/useNutritionCoach'
import { useWeeklyMealPlan } from '@calistenia/core/hooks/useWeeklyMealPlan'
import { usePantryItems } from '@calistenia/core/hooks/usePantry'
import { usePantryPlan } from '@calistenia/core/hooks/usePantryPlan'
import { useSpendSummary } from '@calistenia/core/hooks/useSpend'
import { PantryPlanSection } from '../components/nutrition/PantryPlanSection'
import { usePantryDepletion } from '../components/pantry/use-pantry-depletion'
import { PantryDepleteDialog } from '../components/pantry/PantryDepleteDialog'
import { useBackgroundJobs } from '../hooks/useBackgroundJobs'
import { submitAnalyzeMealJob } from '@calistenia/core/lib/ai-jobs-api'
import { toast } from 'sonner'
import { useWater } from '@calistenia/core/hooks/useWater'
import WaterTracker from '../components/WaterTracker'
import { CoachPanel } from '../components/nutrition/CoachPanel'
import { QualityScoreBadge } from '../components/nutrition/QualityScoreBadge'
import { BADGE_DEFINITIONS } from '@calistenia/core/lib/badge-definitions'
import { pb, isPocketBaseAvailable } from '@calistenia/core/lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { useMealLoggerActions } from '@calistenia/core/hooks/useMealLoggerActions'
import type { NutritionGoal, NutritionGoalType, NutritionEntry, FoodItem, Sex } from '@calistenia/core/types'

const LS_LAST_PHASE = 'calistenia_last_nutrition_phase'

// #243 F2: mismas etiquetas/iconos que NutritionGoalSetup.GOALS, para el picker inline.
const GOAL_LABEL_KEYS: Record<NutritionGoalType, string> = {
  muscle_gain: 'nutrition.goal.muscleGain',
  fat_loss: 'nutrition.goal.fatLoss',
  recomp: 'nutrition.goal.recomp',
  maintain: 'nutrition.goal.maintain',
}
const GOAL_CHOICES: { id: NutritionGoalType; labelKey: string; icon: string }[] = [
  { id: 'muscle_gain', labelKey: GOAL_LABEL_KEYS.muscle_gain, icon: '💪' },
  { id: 'fat_loss', labelKey: GOAL_LABEL_KEYS.fat_loss, icon: '🔥' },
  { id: 'recomp', labelKey: GOAL_LABEL_KEYS.recomp, icon: '⚖️' },
  { id: 'maintain', labelKey: GOAL_LABEL_KEYS.maintain, icon: '✅' },
]

interface NutritionPageProps {
  userId: string | null
  trainingPhase?: number
}

interface UserProfileData {
  weight?: number
  height?: number
  age?: number
  sex?: Sex
  goalWeight?: number
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  pace?: 'gradual' | 'balanced' | 'aggressive'
  goalType?: 'muscle_gain' | 'fat_loss' | 'recomp' | 'maintain'
}

export default function NutritionPage({ userId, trainingPhase }: NutritionPageProps) {
  const [profileData, setProfileData] = useState<UserProfileData>({})
  const [phaseChangeBanner, setPhaseChangeBanner] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  // #243 F2: cambio de objetivo post-onboarding — reabre el wizard sobre goals existentes
  const [showGoalSetup, setShowGoalSetup] = useState(false)
  const [pendingGoal, setPendingGoal] = useState<NutritionGoalType | null>(null)
  const [goalPickerOpen, setGoalPickerOpen] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<NutritionGoalType | null>(null)
  const { addJob, clearJob, canSubmit, pending, pendingLabels } = useBackgroundJobs()
  const { t } = useTranslation()

  const handleSendToBackground = useCallback((imageFiles: File[], mealType: string, description?: string) => {
    if (!addJob('_pending', 'analyze-meal')) return
    submitAnalyzeMealJob(imageFiles, mealType, description)
      .then(id => {
        clearJob('_pending')
        addJob(id, 'analyze-meal')
        toast.info(t('nutrition.logger.analyzingBg'), { description: t('nutrition.logger.bgNotification'), duration: 4000 })
      })
      .catch(() => {
        clearJob('_pending')
        toast.error(t('nutrition.logger.analyzeError'), { description: t('nutrition.logger.checkConnection') })
      })
  }, [addJob, clearJob])

  // Fetch user profile data for pre-filling nutrition goal setup
  useEffect(() => {
    if (!userId) return
    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (!available) return
      try {
        const user = await pb.collection('users').getOne(userId)
        const weight = user.weight || undefined
        const goalWeight = user.goal_weight || undefined
        // Edad/sexo ya no existen en `users` (PII → nutrition_goals); el wizard
        // los pide y los guarda en la propia fila del objetivo.
        setProfileData({
          weight,
          height: user.height || undefined,
          goalWeight,
          activityLevel: user.activity_level ? ONBOARDING_ACTIVITY_TO_NUTRITION[user.activity_level] : undefined,
          pace: user.pace || undefined,
          goalType: inferNutritionGoalType(weight, goalWeight, user.primary_goal),
        })
      } catch { /* ignore */ }
    }
    load()
  }, [userId])

  // US-14: Detect training phase change → suggest recalculating macros
  useEffect(() => {
    if (trainingPhase == null) return
    const lastPhase = localStorage.getItem(LS_LAST_PHASE)
    if (lastPhase !== null && Number(lastPhase) !== trainingPhase) {
      setPhaseChangeBanner(true)
    }
    localStorage.setItem(LS_LAST_PHASE, String(trainingPhase))
  }, [trainingPhase])

  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') || todayStr())
  // Sub-vistas HOY (seguimiento) / PLANIFICAR (hub de planes); 'weekly' es el
  // valor legado de los deep-links previos al rediseño.
  const [activeTab, setActiveTab] = useState<'today' | 'plan'>(() => {
    const tab = searchParams.get('tab')
    return tab === 'plan' || tab === 'weekly' ? 'plan' : 'today'
  })

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
  const { dayTotal: waterTotal, goal: waterGoal, addWater, setGoal: setWaterGoal, adding: waterAdding } = useWater(userId, selectedDate)

  // ── Despensa (F1-F5) ───────────────────────────────────────────────────────
  const navigate = useNavigate()
  const { data: pantryItems = [] } = usePantryItems(userId)
  const pantryCount = pantryItems.length
  const pantryPlan = usePantryPlan(userId)
  const spendData = useSpendSummary(userId, startOfWeekStr()).data
  const pantryDepletion = usePantryDepletion(userId)

  const nutrition = useNutrition(userId)
  const {
    goals,
    entries: allEntries,
    isReady,
    saveGoals,
    saveEntry,
    deleteEntry,
    updateEntry,
    analyzeMeal,
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

  const { handleAnalyze, handleSave: handleSaveEntry } = useMealLoggerActions({
    userId, goals, entries: allEntries, analyzeMeal, scoreMealQuality, saveEntry, updateEntry, getRemainingMacros,
  })

  const {
    dailyInsight,
    weeklyInsight,
    badges,
    generatingWeekly,
    loadBadges,
    upsertDailyInsight,
    getWeeklyInsight,
    generateWeeklyInsight,
  } = useNutritionCoach(userId)

  // Load badges on mount
  useEffect(() => { loadBadges() }, [loadBadges])

  // Sync URL with selected date and fetch entries on-demand
  useEffect(() => {
    fetchEntriesForDate(selectedDate)
    // Keep URL in sync (replace to avoid polluting history on every date change)
    const isToday = selectedDate === todayStr()
    setSearchParams(isToday ? {} : { date: selectedDate }, { replace: true })
  }, [selectedDate, fetchEntriesForDate, setSearchParams])

  // Preload last 7 days for weekly chart (single batch request)
  useEffect(() => {
    fetchEntriesForDateRange(addDays(todayStr(), -6), todayStr())
  }, [fetchEntriesForDateRange])

  const [frequentMeals, setFrequentMeals] = useState<NutritionEntry[]>([])

  // Load frequent meals from recent entries
  useEffect(() => {
    if (!isReady || !goals) return
    const load = async () => {
    const allEntries = await getRecentEntries(20)
    const signature = (e: NutritionEntry) => e.foods.map(f => f.name).sort().join('|')
    const groups = new Map<string, { entry: NutritionEntry; count: number }>()
    for (const entry of allEntries) {
      const sig = signature(entry)
      if (!sig) continue
      const existing = groups.get(sig)
      if (existing) {
        existing.count++
      } else {
        groups.set(sig, { entry, count: 1 })
      }
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

  const entries = useMemo(() => getEntriesForDate(selectedDate), [getEntriesForDate, selectedDate])
  const dailyTotals = useMemo(() => getDailyTotals(selectedDate), [getDailyTotals, selectedDate])
  const weeklyHistory = useMemo(() => getWeeklyHistory(), [getWeeklyHistory])

  // Siempre de HOY: alimenta el plan IA de PLANIFICAR y las sugerencias, que
  // planifican el día en curso aunque se esté inspeccionando otra fecha.
  const todayTotals = useMemo(() => getDailyTotals(todayStr()), [getDailyTotals])
  const todayEntries = useMemo(() => getEntriesForDate(todayStr()), [getEntriesForDate])
  const remaining = useMemo(() => {
    if (!goals) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return {
      calories: goals.dailyCalories - todayTotals.calories,
      protein: goals.dailyProtein - todayTotals.protein,
      carbs: goals.dailyCarbs - todayTotals.carbs,
      fat: goals.dailyFat - todayTotals.fat,
    }
  }, [goals, todayTotals])

  // US-15: Detect if user has missed goals 2+ of last 3 days
  const missedGoalsAlert = useMemo(() => {
    if (!goals) return false
    const last3 = weeklyHistory.slice(3, 6) // last 3 days before today (index 6)
    const missed = last3.filter(d => d.calories > 0 && d.calories < goals.dailyCalories * 0.7)
    return missed.length >= 2
  }, [weeklyHistory, goals])

  // Compute daily quality score (shared helper — same logic on web + native)
  const dailyQualityScore = useMemo(() => computeDailyQualityScore(entries), [entries])

  // Persist daily score and check badges
  useEffect(() => {
    if (!dailyQualityScore || selectedDate !== todayStr()) return
    upsertDailyInsight(selectedDate, dailyQualityScore, entries).then(({ newBadges }) => {
      for (const badge of newBadges) {
        const def = BADGE_DEFINITIONS[badge]
        toast.success(`${def.icon} ${def.label}`, {
          description: def.description,
          duration: 5000,
        })
      }
    })
  }, [dailyQualityScore, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const loggedMealTypes = useMemo(
    () => [...new Set(todayEntries.map(e => e.mealType))],
    [todayEntries]
  )

  const handleSaveGoals = useCallback(async (newGoals: NutritionGoal) => {
    // Wizard saves are user-reviewed/editable on step 5 → 'manual'.
    await saveGoals({ ...newGoals, source: 'manual' })
    // Best-effort sync users.primary_goal (never blocks the save on failure).
    const pg = nutritionGoalTypeToPrimaryGoal(newGoals.goal)
    if (pg && userId) {
      pb.collection('users').update(userId, { primary_goal: pg }).catch(() => {})
    }
    // Registra el cambio venga de donde venga (picker → Ajustar, o el propio wizard vía Recalcular).
    if (goals && newGoals.goal !== goals.goal) {
      op.track('goal_changed', { from: goals.goal, to: newGoals.goal, applied_recommended: false })
    }
    setPhaseChangeBanner(false)
    setShowGoalSetup(false)
    setPendingGoal(null)
  }, [saveGoals, userId, pendingGoal, goals])

  const handleCalculateMacros = useCallback((
    weight: number, height: number, age: number, sex: string, activityLevel: string, goal: string, pace?: string,
  ) => {
    const result = calculateMacros(
      weight, height, age, sex as any, activityLevel as any, goal as any, pace as any
    )
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

  const isToday = selectedDate === todayStr()

  // Metas simplificadas para la generación pantry-aware (mismo shape que mobile)
  const pantryGoals = useMemo(() => ({
    calories: goals?.dailyCalories ?? 0,
    protein: goals?.dailyProtein ?? 0,
    carbs: goals?.dailyCarbs ?? 0,
    fat: goals?.dailyFat ?? 0,
  }), [goals])

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('nutrition.subtitle')}</div>
      <div className="font-bebas text-4xl md:text-5xl mb-6">{t('nutrition.title')}</div>

      {/* Pending background jobs indicator */}
      {pending.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-lime/10 border border-lime/20 mb-4 motion-safe:animate-fade-in">
          <div className="size-4 border-2 border-lime/30 border-t-lime rounded-full animate-spin shrink-0" />
          <div className="text-xs text-foreground min-w-0">
            {pending.map((j, i) => (
              <span key={j.id}>
                {i > 0 && ' · '}
                {pendingLabels[j.type] || t('nutrition.processing')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sub-vistas: HOY (seguimiento) / PLANIFICAR (hub de planes) — ocultas mientras el wizard de metas está abierto (edición) */}
      {isReady && goals && !showGoalSetup && (
        <div className="flex border-b border-border mb-6">
          {(['today', 'plan'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 pb-2.5 -mb-px border-b-2 text-center font-bebas text-base tracking-[2px] transition-colors',
                activeTab === tab
                  ? 'border-lime-400 text-lime-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'today' ? t('nutrition.tabs.today') : t('nutrition.tabs.plan')}
            </button>
          ))}
        </div>
      )}

      {/* Date picker — solo en HOY (PLANIFICAR siempre trabaja sobre el día en curso); oculto en edición de metas */}
      {(!isReady || !goals || (activeTab === 'today' && !showGoalSetup)) && (
        <div id="tour-nutrition-date" className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            className="size-8 rounded-lg border border-border flex items-center justify-center hover:border-lime/40 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('nutrition.previousDay')}
          >
            ‹
          </button>
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-auto h-8 text-xs"
          />
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="size-8 rounded-lg border border-border flex items-center justify-center hover:border-lime/40 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('nutrition.nextDay')}
          >
            ›
          </button>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayStr())}
              className="text-[10px] tracking-widest text-lime hover:text-lime/80 uppercase"
            >
              {t('common.today').toUpperCase()}
            </button>
          )}
        </div>
      )}

      {!isReady ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (!goals || showGoalSetup) ? (
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
      ) : (
        <div className="space-y-8">

          {/* US-14: Phase change banner */}
          {phaseChangeBanner && (
            <Card className="border-lime/30 bg-lime/5">
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium text-lime">
                    {t('nutrition.phaseChange', { phase: trainingPhase })}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t('nutrition.phaseChangeDesc')}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => setPhaseChangeBanner(false)}
                    variant="outline"
                    className="text-[10px] tracking-widest h-8"
                  >
                    {t('nutrition.ignore')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setPhaseChangeBanner(false)
                      setShowGoalSetup(true)
                    }}
                    className="bg-lime hover:bg-lime/90 text-lime-foreground text-[10px] font-bebas tracking-widest h-8 px-3"
                  >
                    {t('nutrition.recalculate')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* #243 F2: cambiar objetivo con preview de nuevo rango antes de aplicar */}
          <Card>
            <CardContent className="p-4">
              {!goalPickerOpen ? (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
                      {t('nutrition.changeGoal.title')}
                    </div>
                    <div className="font-bebas text-2xl text-lime">
                      {t(GOAL_LABEL_KEYS[goals.goal])}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedGoal(null); setGoalPickerOpen(true) }}
                    className="text-[10px] tracking-widest h-8 shrink-0"
                  >
                    {t('nutrition.changeGoal.cta')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground tracking-widest uppercase">
                      {t('nutrition.changeGoal.pickPrompt')}
                    </div>
                    <button
                      onClick={() => { setGoalPickerOpen(false); setSelectedGoal(null) }}
                      className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground uppercase"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {GOAL_CHOICES.map(g => (
                      <button
                        key={g.id}
                        onClick={() => setSelectedGoal(g.id)}
                        className={cn(
                          'p-3 rounded-lg border text-center transition-all',
                          selectedGoal === g.id
                            ? 'border-lime bg-lime/10'
                            : 'border-border bg-card hover:border-lime/40'
                        )}
                      >
                        <div className="text-xl mb-1">{g.icon}</div>
                        <div className={cn('text-xs font-medium', selectedGoal === g.id && 'text-lime')}>
                          {t(g.labelKey)}
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedGoal && selectedGoal !== goals.goal && (() => {
                    const preview = previewNutritionGoal(
                      { weight: goals.weight, height: goals.height, age: goals.age, sex: goals.sex, activityLevel: goals.activityLevel, pace: profileData.pace },
                      selectedGoal,
                    )
                    return (
                      <>
                        <div className="p-3 bg-lime/5 border border-lime/20 rounded-lg space-y-3">
                          <div className="text-[10px] text-lime tracking-widest uppercase">
                            {t('nutrition.changeGoal.newRange')}
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div>
                              <div className="font-bebas text-2xl text-lime">{preview.dailyCalories}</div>
                              <div className="text-[9px] text-muted-foreground uppercase">kcal</div>
                            </div>
                            <div>
                              <div className="font-bebas text-2xl text-sky-500">{preview.dailyProtein}</div>
                              <div className="text-[9px] text-muted-foreground uppercase">prot</div>
                            </div>
                            <div>
                              <div className="font-bebas text-2xl text-amber-400">{preview.dailyCarbs}</div>
                              <div className="text-[9px] text-muted-foreground uppercase">carbs</div>
                            </div>
                            <div>
                              <div className="font-bebas text-2xl text-pink-500">{preview.dailyFat}</div>
                              <div className="text-[9px] text-muted-foreground uppercase">{t('nutrition.fat').toLowerCase()}</div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-lime/10 text-[10px] text-muted-foreground tracking-widest uppercase">
                            {t('nutrition.changeGoal.current')}: {goals.dailyCalories} kcal · {goals.dailyProtein}P · {goals.dailyCarbs}C · {goals.dailyFat}F
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setPendingGoal(selectedGoal)
                              setShowGoalSetup(true)
                              setGoalPickerOpen(false)
                            }}
                            className="flex-1 text-[10px] tracking-widest"
                          >
                            {t('nutrition.changeGoal.adjust')}
                          </Button>
                          <Button
                            onClick={async () => {
                              await saveGoals({ ...preview, source: 'auto' })
                              const pg = nutritionGoalTypeToPrimaryGoal(selectedGoal)
                              if (pg && userId) {
                                pb.collection('users').update(userId, { primary_goal: pg }).catch(() => {})
                              }
                              op.track('goal_changed', { from: goals.goal, to: selectedGoal, applied_recommended: true })
                              setGoalPickerOpen(false)
                              setSelectedGoal(null)
                            }}
                            className="flex-1 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
                          >
                            {t('nutrition.changeGoal.apply')}
                          </Button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* US-15: Missed goals alert */}
          {missedGoalsAlert && (
            <div className="flex gap-3 px-1">
              <div className="w-1 shrink-0 rounded-full bg-amber-400/60" />
              <div>
                <div className="text-sm font-medium text-amber-400">{t('nutrition.missedGoalsTitle')}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('nutrition.missedGoalsDesc') }} />
              </div>
            </div>
          )}

          {/* Water tracker */}
          {activeTab === 'today' && (
            <WaterTracker todayTotal={waterTotal} goal={waterGoal} onAdd={isToday ? addWater : undefined} onSetGoal={setWaterGoal} adding={waterAdding} />
          )}

          {/* Frequent meals quick-tap */}
          {activeTab === 'today' && isToday && frequentMeals.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">{t('nutrition.frequentMeals')}</div>
              <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth">
                {frequentMeals.map((entry, i) => {
                  const foodNames = entry.foods.map(f => f.name).filter(Boolean)
                  const summary = foodNames.length > 2
                    ? foodNames.slice(0, 2).join(', ') + ` +${foodNames.length - 2}`
                    : foodNames.join(', ')
                  return (
                    <button
                      key={i}
                      onClick={async () => {
                        try {
                          await handleSaveEntry({
                            mealType: entry.mealType,
                            foods: entry.foods,
                            totalCalories: entry.totalCalories,
                            totalProtein: entry.totalProtein,
                            totalCarbs: entry.totalCarbs,
                            totalFat: entry.totalFat,
                            loggedAt: nowLocalForPB(),
                          })
                        } catch {
                          toast.error(t('nutrition.logger.saveError'))
                        }
                      }}
                      className="shrink-0 w-40 p-3 bg-card border border-border rounded-lg hover:border-lime/40 transition-colors text-left group"
                    >
                      <div className="text-xs font-medium text-foreground line-clamp-1 group-hover:text-lime transition-colors">{summary || t('nutrition.noName')}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {Math.round(entry.totalCalories)} kcal · {Math.round(entry.totalProtein)}g P
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 text-[9px] text-lime tracking-widest">
                        <span>+</span> {t('nutrition.register')}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Daily dashboard */}
          {activeTab === 'today' && (
          <div id="tour-nutrition-dashboard">
            <NutritionDashboard
              dailyTotals={dailyTotals}
              goals={goals}
              entries={entries}
              onDeleteEntry={deleteEntry}
              onEditEntry={updateEntry}
              spend={spendData?.summary}
              entryCosts={spendData?.costByEntry}
              onDuplicateEntry={async (entry) => {
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
                  toast.success(t('nutrition.mealDuplicated'))
                } catch {
                  toast.error(t('nutrition.logger.saveError'))
                }
              }}
              selectedDate={selectedDate}
            />
          </div>
          )}

          {/* ── PLANIFICAR: despensa → plan del día → plan desde despensa → semanal ── */}
          {activeTab === 'plan' && (
            <>
              {/* Despensa: el inventario que alimenta los planes */}
              <button
                onClick={() => navigate('/pantry')}
                className="w-full flex items-end justify-between border-b border-border pb-4 hover:opacity-80 transition-opacity text-left group"
              >
                <span className="space-y-1.5">
                  <span className="block text-[10px] text-muted-foreground tracking-[3px] uppercase">
                    {t('pantry.title')}
                  </span>
                  {pantryCount > 0 ? (
                    <span className="block font-bebas text-3xl leading-none text-foreground">
                      {pantryCount}
                      <span className="font-mono text-[10px] tracking-[2px] text-muted-foreground">
                        {'  '}{t('nutrition.planHub.foods').toUpperCase()}
                      </span>
                    </span>
                  ) : (
                    <span className="block text-xs text-muted-foreground">
                      {t('nutrition.planHub.empty')}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 pb-0.5 text-[10px] font-mono tracking-widest uppercase text-lime-400 group-hover:text-lime-300 transition-colors">
                  {t('nutrition.planHub.manage')} <span aria-hidden>›</span>
                </span>
              </button>

              {/* Plan IA del día — siempre planifica HOY; se oculta solo sin budget */}
              <DailyMealPlan
                remaining={remaining}
                goals={{ calories: goals.dailyCalories, protein: goals.dailyProtein, carbs: goals.dailyCarbs, fat: goals.dailyFat }}
                loggedMealTypes={loggedMealTypes}
                onSaveMeal={handleSavePlannedMeal}
              />

              {/* Plan del día desde la despensa (null si está vacía) */}
              <PantryPlanSection userId={userId} goals={pantryGoals} />

              {/* Plan semanal */}
              <div className="border-t border-border pt-5">
                <WeeklyMealPlan
                  activePlan={weeklyPlan}
                  planDays={weeklyPlanDays}
                  isLoading={weeklyLoading}
                  goals={goals}
                  getDailyTotals={getDailyTotals}
                  onGenerate={generateWeeklyPlan}
                  onRegenerateDay={regenerateWeeklyDay}
                  onLogMeal={logWeeklyMeal}
                  onDeleteMeal={deleteWeeklyMeal}
                  onArchive={archiveWeeklyPlan}
                  onRefresh={refreshWeeklyPlan}
                  userId={userId}
                  hasPantry={pantryPlan.hasPantry}
                  onGenerateFromPantry={() => pantryPlan.generateWeek(pantryGoals)}
                />
              </div>
            </>
          )}

          {/* Coach & tendencia (collapsible) */}
          {activeTab === 'today' && (
          <div>
            <button
              onClick={() => setShowInsights(v => !v)}
              className="w-full flex items-center justify-between border-t border-border py-3 text-[10px] tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>{t('nutrition.coach.title', 'Coach')}</span>
                {dailyInsight?.overallScore && (
                  <QualityScoreBadge score={dailyInsight.overallScore} size="sm" />
                )}
                {badges.length > 0 && (
                  <span className="font-mono text-[9px] text-amber-400 normal-case tracking-normal">{badges.length} 🏅</span>
                )}
              </span>
              <svg
                className={cn('size-4 transition-transform duration-200', showInsights && 'rotate-180')}
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>

            {showInsights && (
              <div className="space-y-6 pb-4 pt-1">
                {/* Coach tip */}
                {dailyInsight?.coachMessage && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-lg leading-none shrink-0">💬</div>
                      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                        {dailyInsight.coachMessage}
                      </p>
                    </div>
                  </div>
                )}

                {entries.some(e => e.qualityScore) && (
                  <CoachPanel
                    entries={entries}
                    dailyInsight={dailyInsight}
                    weeklyInsight={weeklyInsight}
                    badges={badges}
                    generatingWeekly={generatingWeekly}
                  />
                )}

                <MealSuggestions remaining={remaining} />

                <WeeklyNutritionChart
                  history={weeklyHistory}
                  calorieGoal={goals.dailyCalories}
                />

                {dailyTotals.calories > 0 && isToday && (
                  <DailySummaryCard
                    date={selectedDate}
                    totals={dailyTotals}
                    goals={goals}
                    waterMl={waterTotal}
                    waterGoal={waterGoal}
                    entries={entries}
                    dailyQualityScore={dailyQualityScore}
                  />
                )}
              </div>
            )}
          </div>
          )}

          {/* FAB for meal logging */}
          <div id="tour-meal-logger">
            <MealLogger
              onAnalyze={handleAnalyze}
              onSave={handleSaveEntry}
              userId={userId}
              dailyTotals={dailyTotals}
              goals={goals}
              getRecentEntries={getRecentEntries}
              onSendToBackground={canSubmit ? handleSendToBackground : undefined}
              onSaved={pantryDepletion.runMatch}
            />
          </div>

          {/* F4 (#173): confirmación de descuento de despensa post meal-log */}
          <PantryDepleteDialog
            rows={pantryDepletion.rows}
            onConfirm={pantryDepletion.confirm}
            onDismiss={pantryDepletion.dismiss}
          />
        </div>
      )}
    </div>
  )
}
