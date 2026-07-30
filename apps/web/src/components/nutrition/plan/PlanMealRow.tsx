import { useTranslation } from 'react-i18next'
import type { Recipe, WeeklyPlannedMeal } from '@calistenia/core/types'
import { cn } from '../../../lib/utils'

const MEAL_DOT: Record<string, string> = {
  desayuno: 'bg-amber-400',
  almuerzo: 'bg-sky-400',
  cena: 'bg-pink-400',
  snack: 'bg-lime',
}

interface PlanMealRowProps {
  meal: WeeklyPlannedMeal
  onOpenRecipe?: (label: string, recipe: Recipe) => void
  onLog?: (mealId: string) => void
  isLogging?: boolean
}

/**
 * One planned meal. Same row whatever produced it — pantry or free, day or week
 * — because the user is looking at food, not at which endpoint ran.
 *
 * A logged meal loses its macro line entirely instead of dimming: once you have
 * eaten it, the numbers are history and belong in HOY, not here.
 */
export function PlanMealRow({ meal, onOpenRecipe, onLog, isLogging }: PlanMealRowProps) {
  const { t } = useTranslation()

  const recipe = meal.recipe ?? null
  const canOpen = !!recipe && !!onOpenRecipe

  return (
    <div className="border-b border-border py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'h-[7px] w-[7px] rounded-full shrink-0',
            meal.logged ? 'bg-emerald-400' : MEAL_DOT[meal.meal_type] ?? 'bg-muted',
          )}
        />
        <span
          className={cn(
            'text-[13.5px] font-medium flex-1 truncate',
            meal.logged ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {meal.label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
          {meal.calories} kcal
        </span>
      </div>

      {!meal.logged && (
        <div className="flex items-center justify-between gap-3 pl-4 mt-[3px]">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            P{meal.protein} · C{meal.carbs} · G{meal.fat}
          </span>
          <span className="flex items-center gap-3 shrink-0">
            {canOpen && (
              <button
                type="button"
                onClick={() => onOpenRecipe!(meal.label, recipe!)}
                className="font-mono text-[10px] uppercase tracking-[1px] text-lime hover:text-lime/80 transition-colors"
              >
                {t('plan.meal.recipe')} <span aria-hidden>→</span>
              </button>
            )}
            {onLog && (
              <button
                type="button"
                onClick={() => onLog(meal.id)}
                disabled={isLogging}
                className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground hover:text-lime disabled:opacity-40 transition-colors"
              >
                {isLogging ? '…' : t('plan.meal.log')}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
