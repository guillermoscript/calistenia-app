import { useTranslation } from 'react-i18next'
import type { MealDayPlan, Recipe } from '@calistenia/core/types'
import { Kicker } from '../../ui/kicker'
import { PlanMealRow } from './PlanMealRow'

interface PlanResultProps {
  plan: MealDayPlan
  /** "hoy" / "mañana" / a formatted date — the caller owns the clock. */
  dateLabel: string
  isToday: boolean
  onOpenRecipe?: (label: string, recipe: Recipe) => void
  onLogMeal?: (mealId: string) => void
  loggingMealId?: string | null
  onRegenerate?: () => void
  onLogAll?: () => void
  isLoggingAll?: boolean
}

/**
 * A saved day plan. Under the "food first" decision this renders above the
 * composer, which folds away — the plan you already asked for should not sit
 * behind two selectors and a button every time you open the tab.
 */
export function PlanResult(props: PlanResultProps) {
  const { t } = useTranslation()
  const {
    plan, dateLabel, isToday, onOpenRecipe, onLogMeal, loggingMealId,
    onRegenerate, onLogAll, isLoggingAll,
  } = props

  const total = plan.meals.reduce(
    (a, m) => ({
      calories: a.calories + m.calories,
      protein: a.protein + m.protein,
      carbs: a.carbs + m.carbs,
      fat: a.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

  const sourceLabel = plan.source === 'pantry' ? t('plan.base.pantry') : t('plan.base.buy')
  const pending = plan.meals.some(m => !m.logged)

  return (
    <div>
      <Kicker className="mb-2">
        {isToday
          ? t('plan.result.kickerToday', { source: sourceLabel })
          : t('plan.result.kicker', { date: dateLabel })}
      </Kicker>

      {plan.meals.map(meal => (
        <PlanMealRow
          key={meal.id}
          meal={meal}
          onOpenRecipe={onOpenRecipe}
          onLog={onLogMeal}
          isLogging={loggingMealId === meal.id}
        />
      ))}

      <div className="flex items-baseline justify-between pt-3">
        <Kicker>{t('plan.result.total')}</Kicker>
        <span className="font-bebas text-[22px] leading-none tabular-nums text-foreground">
          {total.calories}
          <span className="font-mono text-[10px] text-muted-foreground">
            {' '}/ {plan.goal_snapshot.calories} kcal
          </span>
        </span>
      </div>

      {plan.notes && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{plan.notes}</p>
      )}

      {(onRegenerate || onLogAll) && (
        <div className="flex gap-2 mt-4">
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="flex-1 rounded-[9px] border border-border py-2.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground hover:text-foreground hover:border-lime/30 transition-colors"
            >
              {t('plan.actions.another')}
            </button>
          )}
          {onLogAll && pending && (
            <button
              type="button"
              onClick={onLogAll}
              disabled={isLoggingAll}
              className="flex-1 rounded-[9px] border border-lime/30 py-2.5 font-mono text-[10px] uppercase tracking-[2px] text-lime hover:bg-lime/10 disabled:opacity-40 transition-colors"
            >
              {isLoggingAll ? '…' : t('plan.actions.logAll')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
