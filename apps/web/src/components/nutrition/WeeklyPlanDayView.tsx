import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import WeeklyPlanMealCard from './WeeklyPlanMealCard'
import type { WeeklyPlanDay, DailyTotals } from '../../types'

interface Props {
  day: WeeklyPlanDay
  actualTotals?: DailyTotals
  onLogMeal: (dayId: string, mealId: string) => Promise<void>
  onDeleteMeal: (dayId: string, mealId: string) => Promise<void>
  onRegenerateDay: (dayId: string) => Promise<void>
}

export default function WeeklyPlanDayView({ day, actualTotals, onLogMeal, onDeleteMeal, onRegenerateDay }: Props) {
  const { t } = useTranslation()
  const [regenerating, setRegenerating] = useState(false)

  const planned: DailyTotals = {
    calories: day.meals.reduce((s, m) => s + m.calories, 0),
    protein: day.meals.reduce((s, m) => s + m.protein, 0),
    carbs: day.meals.reduce((s, m) => s + m.carbs, 0),
    fat: day.meals.reduce((s, m) => s + m.fat, 0),
  }

  const actual = actualTotals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }

  return (
    <div className="space-y-3">
      {/* Plan vs Actual comparison */}
      <div className="rounded-lg bg-card border border-border p-3 text-[11px] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('nutrition.weeklyPlan.planned')}</span>
          <span className="tabular-nums text-foreground">
            {Math.round(planned.calories)} kcal
            <span className="text-muted-foreground ml-2">
              {Math.round(planned.protein)}P · {Math.round(planned.carbs)}C · {Math.round(planned.fat)}G
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('nutrition.weeklyPlan.actual')}</span>
          <span className="tabular-nums text-foreground">
            {Math.round(actual.calories)} kcal
            <span className="text-muted-foreground ml-2">
              {Math.round(actual.protein)}P · {Math.round(actual.carbs)}C · {Math.round(actual.fat)}G
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <span className="text-muted-foreground">{t('nutrition.weeklyPlan.pending')}</span>
          <span className="tabular-nums text-lime-400 font-medium">
            {Math.max(0, Math.round(planned.calories - actual.calories))} kcal
            <span className="text-lime-400/70 ml-2">
              {Math.max(0, Math.round(planned.protein - actual.protein))}P · {Math.max(0, Math.round(planned.carbs - actual.carbs))}C · {Math.max(0, Math.round(planned.fat - actual.fat))}G
            </span>
          </span>
        </div>
      </div>

      {/* Day notes */}
      {day.notes && (
        <div className="text-xs text-muted-foreground italic px-1">
          {day.notes}
        </div>
      )}

      {/* Meals */}
      {day.meals.map(meal => (
        <WeeklyPlanMealCard
          key={meal.id}
          meal={meal}
          onLog={() => onLogMeal(day.id, meal.id)}
          onDelete={() => onDeleteMeal(day.id, meal.id)}
        />
      ))}

      {/* Regenerate day button */}
      <Button
        variant="outline"
        size="sm"
        disabled={regenerating}
        onClick={async () => {
          setRegenerating(true)
          try { await onRegenerateDay(day.id) } finally { setRegenerating(false) }
        }}
        className="w-full border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-lime-400/30 font-bebas tracking-widest"
      >
        {regenerating ? (
          <span className="flex items-center gap-2">
            <span className="flex gap-0.5">
              <span className="size-1.5 rounded-full bg-foreground animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-foreground animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-foreground animate-bounce [animation-delay:300ms]" />
            </span>
            {t('nutrition.weeklyPlan.regenerating')}
          </span>
        ) : t('nutrition.weeklyPlan.regenerateDay')}
      </Button>
    </div>
  )
}
