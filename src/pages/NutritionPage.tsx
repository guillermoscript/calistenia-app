import { useState, useMemo, useCallback } from 'react'
import { Input } from '../components/ui/input'
import NutritionGoalSetup from '../components/nutrition/NutritionGoalSetup'
import NutritionDashboard from '../components/nutrition/NutritionDashboard'
import MealLogger from '../components/nutrition/MealLogger'
import MealSuggestions from '../components/nutrition/MealSuggestions'
import { useNutrition } from '../hooks/useNutrition'
import type { NutritionGoal, NutritionEntry, FoodItem } from '../types'

interface NutritionPageProps {
  userId: string | null
}

export default function NutritionPage({ userId }: NutritionPageProps) {
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
  } = useNutrition(userId)

  const entries = useMemo(() => getEntriesForDate(selectedDate), [getEntriesForDate, selectedDate])
  const dailyTotals = useMemo(() => getDailyTotals(selectedDate), [getDailyTotals, selectedDate])

  const remaining = useMemo(() => {
    if (!goals) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return {
      calories: goals.dailyCalories - dailyTotals.calories,
      protein: goals.dailyProtein - dailyTotals.protein,
      carbs: goals.dailyCarbs - dailyTotals.carbs,
      fat: goals.dailyFat - dailyTotals.fat,
    }
  }, [goals, dailyTotals])

  const handleSaveGoals = useCallback(async (newGoals: NutritionGoal) => {
    await saveGoals(newGoals)
  }, [saveGoals])

  /** Adapter: NutritionGoalSetup passes (weight, height, age, sex, activityLevel, goal) as strings */
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

  /** Adapter for MealLogger onAnalyze */
  const handleAnalyze = useCallback(async (imageFile: File, mealType: string): Promise<{ foods: FoodItem[] }> => {
    const result = await analyzeMeal(imageFile, mealType)
    return { foods: result.foods }
  }, [analyzeMeal])

  /** Adapter for MealLogger onSave */
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
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            const d = new Date(selectedDate)
            d.setDate(d.getDate() - 1)
            setSelectedDate(d.toISOString().split('T')[0])
          }}
          className="size-8 rounded-lg border border-border flex items-center justify-center hover:border-lime/40 text-muted-foreground hover:text-foreground transition-colors"
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
          className="size-8 rounded-lg border border-border flex items-center justify-center hover:border-lime/40 text-muted-foreground hover:text-foreground transition-colors"
        >
          ›
        </button>
        {!isToday && (
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="text-[10px] tracking-widest text-lime hover:text-lime/80 uppercase"
          >
            HOY
          </button>
        )}
      </div>

      {!isReady ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !goals ? (
        <NutritionGoalSetup onSave={handleSaveGoals} calculateMacros={handleCalculateMacros} />
      ) : (
        <div className="space-y-8">
          <NutritionDashboard
            dailyTotals={dailyTotals}
            goals={goals}
            entries={entries}
            onDeleteEntry={deleteEntry}
          />

          <MealSuggestions remaining={remaining} />

          {/* FAB for meal logging */}
          <MealLogger onAnalyze={handleAnalyze} onSave={handleSaveEntry} />
        </div>
      )}
    </div>
  )
}
