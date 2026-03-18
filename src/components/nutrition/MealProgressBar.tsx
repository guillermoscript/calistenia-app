import MacroBar from './MacroBar'
import type { DailyTotals, NutritionGoal } from '../../types'

interface MealProgressBarProps {
  dailyTotals: DailyTotals
  mealTotals: DailyTotals
  goals: NutritionGoal | null
}

export default function MealProgressBar({ dailyTotals, mealTotals, goals }: MealProgressBarProps) {
  if (!goals) {
    return (
      <div className="p-3 bg-muted/30 rounded-lg border border-border/40 text-center">
        <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
          Configura tus metas para ver el progreso
        </span>
      </div>
    )
  }

  const combined = {
    calories: dailyTotals.calories + mealTotals.calories,
    protein: dailyTotals.protein + mealTotals.protein,
    carbs: dailyTotals.carbs + mealTotals.carbs,
    fat: dailyTotals.fat + mealTotals.fat,
  }

  return (
    <div className="p-3 bg-muted/30 rounded-lg border border-border/40 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground tracking-widest uppercase">Progreso del día</span>
        <span className="text-[9px] text-muted-foreground">(incluye esta comida)</span>
      </div>
      <MacroBar
        label="Calorías"
        current={combined.calories}
        target={goals.dailyCalories}
        unit=" kcal"
        color="bg-lime-400"
      />
      <MacroBar
        label="Proteína"
        current={combined.protein}
        target={goals.dailyProtein}
        color="bg-sky-500"
      />
      <MacroBar
        label="Carbos"
        current={combined.carbs}
        target={goals.dailyCarbs}
        color="bg-amber-400"
      />
      <MacroBar
        label="Grasa"
        current={combined.fat}
        target={goals.dailyFat}
        color="bg-pink-500"
      />
    </div>
  )
}
