import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import MealLoggerContent from '../components/nutrition/MealLoggerContent'
import { useNutrition } from '../hooks/useNutrition'
import type { NutritionEntry, FoodItem } from '../types'

interface MealLoggerPageProps {
  userId: string | null
}

export default function MealLoggerPage({ userId }: MealLoggerPageProps) {
  const navigate = useNavigate()
  const {
    goals,
    analyzeMeal,
    saveEntry,
    getDailyTotals,
    getRecentEntries,
  } = useNutrition(userId)

  const dailyTotals = useMemo(() => getDailyTotals(), [getDailyTotals])

  const handleAnalyze = useCallback(async (imageFile: File, mealType: string): Promise<{ foods: FoodItem[] }> => {
    const result = await analyzeMeal(imageFile, mealType)
    return { foods: result.foods }
  }, [analyzeMeal])

  const handleSave = useCallback(async (entry: Omit<NutritionEntry, 'id' | 'user'>) => {
    await saveEntry({ ...entry, user: userId || undefined })
  }, [saveEntry, userId])

  const handleSaveSuccess = useCallback(() => {
    setTimeout(() => navigate('/nutrition'), 1200)
  }, [navigate])

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-1 uppercase">Nutricion</div>
          <div className="font-bebas text-3xl md:text-4xl">REGISTRAR COMIDA</div>
        </div>
        <button
          onClick={() => navigate('/nutrition')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>

      <MealLoggerContent
        onAnalyze={handleAnalyze}
        onSave={handleSave}
        userId={userId}
        dailyTotals={dailyTotals}
        goals={goals}
        getRecentEntries={getRecentEntries}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  )
}
