import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { todayStr, addDays, nowLocalForPB } from '../lib/dateUtils'
import { Input } from '../components/ui/input'
import NutritionGoalSetup from '../components/nutrition/NutritionGoalSetup'
import NutritionDashboard from '../components/nutrition/NutritionDashboard'
import MealLogger from '../components/nutrition/MealLogger'
import MealSuggestions from '../components/nutrition/MealSuggestions'
import WeeklyNutritionChart from '../components/nutrition/WeeklyNutritionChart'
import DailyMealPlan, { type PlannedMeal } from '../components/nutrition/DailyMealPlan'
import DailySummaryCard from '../components/nutrition/DailySummaryCard'
import WeeklyMealPlan from '../components/nutrition/WeeklyMealPlan'
import { useNutrition } from '../hooks/useNutrition'
import { useNutritionCoach } from '../hooks/useNutritionCoach'
import { useWeeklyMealPlan } from '../hooks/useWeeklyMealPlan'
import { useBackgroundJobs } from '../hooks/useBackgroundJobs'
import { submitAnalyzeMealJob } from '../lib/ai-jobs-api'
import { toast } from 'sonner'
import { useWater } from '../hooks/useWater'
import WaterTracker from '../components/WaterTracker'
import { CoachPanel } from '../components/nutrition/CoachPanel'
import { BADGE_DEFINITIONS } from '../lib/badge-definitions'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { useMealLoggerActions } from '../hooks/useMealLoggerActions'
import type { NutritionGoal, NutritionEntry, FoodItem, Sex, QualityScore } from '../types'

const LS_LAST_PHASE = 'calistenia_last_nutrition_phase'

interface NutritionPageProps {
  userId: string | null
  trainingPhase?: number
}

interface UserProfileData {
  weight?: number
  height?: number
  age?: number
  sex?: Sex
}

export default function NutritionPage({ userId, trainingPhase }: NutritionPageProps) {
  const [profileData, setProfileData] = useState<UserProfileData>({})
  const [phaseChangeBanner, setPhaseChangeBanner] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
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
        setProfileData({
          weight: user.weight || undefined,
          height: user.height || undefined,
          age: user.age || undefined,
          sex: user.sex || undefined,
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
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>(() =>
    searchParams.get('tab') === 'weekly' ? 'weekly' : 'daily'
  )

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

  const remaining = useMemo(() => {
    if (!goals) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return {
      calories: goals.dailyCalories - dailyTotals.calories,
      protein: goals.dailyProtein - dailyTotals.protein,
      carbs: goals.dailyCarbs - dailyTotals.carbs,
      fat: goals.dailyFat - dailyTotals.fat,
    }
  }, [goals, dailyTotals])

  // US-15: Detect if user has missed goals 2+ of last 3 days
  const missedGoalsAlert = useMemo(() => {
    if (!goals) return false
    const last3 = weeklyHistory.slice(3, 6) // last 3 days before today (index 6)
    const missed = last3.filter(d => d.calories > 0 && d.calories < goals.dailyCalories * 0.7)
    return missed.length >= 2
  }, [weeklyHistory, goals])

  // Compute daily quality score
  const dailyQualityScore = useMemo((): QualityScore | undefined => {
    const scored = entries.filter(e => e.qualityScore)
    if (scored.length < 2) return undefined
    const scoreMap: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 }
    const reverseMap: Record<number, QualityScore> = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E' }
    const totalWeight = scored.reduce((s, e) => s + e.totalCalories, 0)
    if (totalWeight === 0) return undefined
    const weightedAvg = scored.reduce((s, e) => s + scoreMap[e.qualityScore!] * e.totalCalories, 0) / totalWeight
    return reverseMap[Math.round(weightedAvg)]
  }, [entries])

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
    () => [...new Set(entries.map(e => e.mealType))],
    [entries]
  )

  const handleSaveGoals = useCallback(async (newGoals: NutritionGoal) => {
    await saveGoals(newGoals)
    setPhaseChangeBanner(false)
  }, [saveGoals])

  const handleCalculateMacros = useCallback((
    weight: number, height: number, age: number, sex: string, activityLevel: string, goal: string
  ) => {
    const result = calculateMacros(
      weight, height, age, sex as any, activityLevel as any, goal as any
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

      {/* Date picker */}
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

      {/* Tab toggle: daily vs weekly */}
      {isReady && goals && (
        <div className="flex gap-1 mb-6 bg-card border border-border rounded-lg p-1">
          <button
            onClick={() => setActiveTab('daily')}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-bebas tracking-widest transition-colors',
              activeTab === 'daily'
                ? 'bg-lime-400/15 text-lime-400 border border-lime-400/30'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('nutrition.tabs.daily')}
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-bebas tracking-widest transition-colors',
              activeTab === 'weekly'
                ? 'bg-lime-400/15 text-lime-400 border border-lime-400/30'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('nutrition.tabs.weekly')}
          </button>
        </div>
      )}

      {!isReady ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !goals ? (
        <NutritionGoalSetup
          onSave={handleSaveGoals}
          calculateMacros={handleCalculateMacros}
          initialWeight={profileData.weight}
          initialHeight={profileData.height}
          initialAge={profileData.age}
          initialSex={profileData.sex}
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
                      // Temporarily hide goals to show setup wizard
                      saveGoals({ ...goals, dailyCalories: -1 })
                    }}
                    className="bg-lime hover:bg-lime/90 text-lime-foreground text-[10px] font-bebas tracking-widest h-8 px-3"
                  >
                    {t('nutrition.recalculate')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
          <WaterTracker todayTotal={waterTotal} goal={waterGoal} onAdd={isToday ? addWater : undefined} onSetGoal={setWaterGoal} adding={waterAdding} />

          {/* Frequent meals quick-tap */}
          {isToday && frequentMeals.length > 0 && (
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
                        await handleSaveEntry({
                          mealType: entry.mealType,
                          foods: entry.foods,
                          totalCalories: entry.totalCalories,
                          totalProtein: entry.totalProtein,
                          totalCarbs: entry.totalCarbs,
                          totalFat: entry.totalFat,
                          loggedAt: nowLocalForPB(),
                        })
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
          <div id="tour-nutrition-dashboard">
            <NutritionDashboard
              dailyTotals={dailyTotals}
              goals={goals}
              entries={entries}
              onDeleteEntry={deleteEntry}
              onEditEntry={updateEntry}
              onDuplicateEntry={async (entry) => {
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
              }}
              selectedDate={selectedDate}
            />
          </div>

          {/* AI Meal plans — daily or weekly */}
          {activeTab === 'weekly' ? (
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
            />
          ) : isToday ? (
            <DailyMealPlan
              remaining={remaining}
              goals={{ calories: goals.dailyCalories, protein: goals.dailyProtein, carbs: goals.dailyCarbs, fat: goals.dailyFat }}
              loggedMealTypes={loggedMealTypes}
              onSaveMeal={handleSavePlannedMeal}
            />
          ) : null}

          {/* Coach & Insights tab */}
          <div>
            <button
              onClick={() => setShowInsights(v => !v)}
              className="w-full flex items-center justify-between py-3 text-[10px] tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground transition-colors"
            >
              <span>{entries.some(e => e.qualityScore) ? 'Coach' : t('nutrition.suggestionsAndHistory')}</span>
              <svg
                className={cn('size-4 transition-transform duration-200', showInsights && 'rotate-180')}
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>

            {showInsights && (
              <div className="space-y-6 pb-4">
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
                    activeTab={activeTab}
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
                  />
                )}
              </div>
            )}
          </div>

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
            />
          </div>
        </div>
      )}
    </div>
  )
}
