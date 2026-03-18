import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Input } from '../components/ui/input'
import NutritionGoalSetup from '../components/nutrition/NutritionGoalSetup'
import NutritionDashboard from '../components/nutrition/NutritionDashboard'
import MealLogger from '../components/nutrition/MealLogger'
import MealSuggestions from '../components/nutrition/MealSuggestions'
import WeeklyNutritionChart from '../components/nutrition/WeeklyNutritionChart'
import DailyMealPlan from '../components/nutrition/DailyMealPlan'
import DailySummaryCard from '../components/nutrition/DailySummaryCard'
import { useNutrition } from '../hooks/useNutrition'
import { useWater } from '../hooks/useWater'
import WaterTracker from '../components/WaterTracker'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import type { NutritionGoal, NutritionEntry, FoodItem, Sex } from '../types'

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

  const { todayTotal: waterTotal, goal: waterGoal, addWater, setGoal: setWaterGoal } = useWater(userId)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  const {
    goals,
    isReady,
    saveGoals,
    saveEntry,
    deleteEntry,
    analyzeMeal,
    calculateMacros,
    getDailyTotals,
    getEntriesForDate,
    getWeeklyHistory,
    getRecentEntries,
  } = useNutrition(userId)

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

  const handleAnalyze = useCallback(async (imageFile: File, mealType: string): Promise<{ foods: FoodItem[] }> => {
    const result = await analyzeMeal(imageFile, mealType)
    return { foods: result.foods }
  }, [analyzeMeal])

  const handleSaveEntry = useCallback(async (entry: Omit<NutritionEntry, 'id' | 'user'>) => {
    await saveEntry({ ...entry, user: userId || undefined })
  }, [saveEntry, userId])

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Alimentacion</div>
      <div className="font-bebas text-4xl md:text-5xl mb-6">NUTRICION</div>

      {/* Date picker */}
      <div id="tour-nutrition-date" className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            const d = new Date(selectedDate)
            d.setDate(d.getDate() - 1)
            setSelectedDate(d.toISOString().split('T')[0])
          }}
          className="size-8 rounded-lg border border-border flex items-center justify-center hover:border-lime-400/40 text-muted-foreground hover:text-foreground transition-colors"
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
          onClick={() => {
            const d = new Date(selectedDate)
            d.setDate(d.getDate() + 1)
            setSelectedDate(d.toISOString().split('T')[0])
          }}
          className="size-8 rounded-lg border border-border flex items-center justify-center hover:border-lime-400/40 text-muted-foreground hover:text-foreground transition-colors"
        >
          ›
        </button>
        {!isToday && (
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="text-[10px] tracking-widest text-lime-400 hover:text-lime-400/80 uppercase"
          >
            HOY
          </button>
        )}
      </div>

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
            <Card className="border-lime-400/30 bg-lime-400/5">
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium text-lime-400">
                    Entraste a Fase {trainingPhase} de entrenamiento
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Tu nivel de actividad puede haber cambiado. ¿Quieres recalcular tus macros?
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => setPhaseChangeBanner(false)}
                    variant="outline"
                    className="text-[10px] tracking-widest h-8"
                  >
                    Ignorar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setPhaseChangeBanner(false)
                      // Temporarily hide goals to show setup wizard
                      saveGoals({ ...goals, dailyCalories: -1 })
                    }}
                    className="bg-lime-400 hover:bg-lime-300 text-zinc-900 text-[10px] font-bebas tracking-widest h-8 px-3"
                  >
                    Recalcular
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* US-15: Missed goals alert */}
          {missedGoalsAlert && (
            <Card className="border-amber-400/30 bg-amber-400/5">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <span className="text-xl shrink-0">📉</span>
                  <div>
                    <div className="text-sm font-medium text-amber-400">Llevas días sin alcanzar tu meta</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      En los últimos días tu ingesta calórica estuvo por debajo del 70% de tu objetivo.
                      Considera usar el <strong>Plan del día</strong> o revisar tus metas.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Water tracker */}
          <WaterTracker todayTotal={waterTotal} goal={waterGoal} onAdd={addWater} onSetGoal={setWaterGoal} />

          {/* Daily dashboard */}
          <div id="tour-nutrition-dashboard">
            <NutritionDashboard
              dailyTotals={dailyTotals}
              goals={goals}
              entries={entries}
              onDeleteEntry={deleteEntry}
            />
          </div>

          {/* US-10: AI Daily meal plan */}
          {isToday && (
            <DailyMealPlan
              remaining={remaining}
              goals={{ calories: goals.dailyCalories, protein: goals.dailyProtein, carbs: goals.dailyCarbs, fat: goals.dailyFat }}
              loggedMealTypes={loggedMealTypes}
            />
          )}

          {/* Macro suggestions */}
          <MealSuggestions remaining={remaining} />

          {/* US-11/12: Weekly history chart */}
          <WeeklyNutritionChart
            history={weeklyHistory}
            calorieGoal={goals.dailyCalories}
          />

          {/* Daily summary shareable card */}
          {dailyTotals.calories > 0 && isToday && (
            <DailySummaryCard
              date={selectedDate}
              totals={dailyTotals}
              goals={goals}
              waterMl={waterTotal}
              waterGoal={waterGoal}
            />
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
            />
          </div>
        </div>
      )}
    </div>
  )
}
