import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import type { Recipe, WeeklyPlanDay } from '@calistenia/core/types'
import { cn } from '../../../lib/utils'
import { Kicker } from '../../ui/kicker'
import { PlanMealRow } from './PlanMealRow'

interface PlanWeekStripProps {
  days: WeeklyPlanDay[]
  /** kcal target the week was generated against, for the per-day comparison. */
  goalCalories: number
  onOpenRecipe?: (label: string, recipe: Recipe) => void
  onLogMeal?: (dayId: string, mealId: string) => void
  loggingMealId?: string | null
  onRegenerateDay?: (dayId: string) => void
  regeneratingDayId?: string | null
  onArchive?: () => void
}

/**
 * The week as seven pills; one day open at a time.
 *
 * The old weekly view stacked seven day cards, each with its own header and its
 * own meal cards — three components and a screenful of scrolling to answer
 * "what am I eating Thursday". Reusing PlanMealRow also means a meal looks the
 * same whether it came from a day plan or from here.
 */
export function PlanWeekStrip(props: PlanWeekStripProps) {
  const { t, i18n } = useTranslation()
  const {
    days, goalCalories, onOpenRecipe, onLogMeal, loggingMealId,
    onRegenerateDay, regeneratingDayId, onArchive,
  } = props

  const today = todayStr()
  const sorted = useMemo(() => [...days].sort((a, b) => a.day_index - b.day_index), [days])
  const locale = i18n.language === 'en' ? 'en-US' : 'es-ES'

  // Abre el día de hoy si la semana en curso lo contiene; si no, el primero.
  const [openDate, setOpenDate] = useState<string>(
    () => sorted.find(d => d.date.slice(0, 10) === today)?.date ?? sorted[0]?.date ?? '',
  )

  if (sorted.length === 0) return null

  const open = sorted.find(d => d.date === openDate) ?? sorted[0]

  const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, opts)
    } catch {
      return date.slice(0, 10)
    }
  }

  const kcalOf = (day: WeeklyPlanDay) => day.meals.reduce((a, m) => a + m.calories, 0)

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <Kicker>{t('plan.week.kicker')}</Kicker>
        {onArchive && (
          <button
            type="button"
            onClick={onArchive}
            className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground hover:text-destructive transition-colors"
          >
            {t('plan.actions.discard')}
          </button>
        )}
      </div>

      <div className="flex gap-1.5" role="tablist">
        {sorted.map(day => {
          const on = day.date === open.date
          const isToday = day.date.slice(0, 10) === today
          return (
            <button
              key={day.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setOpenDate(day.date)}
              className={cn(
                'flex-1 rounded-lg border py-1.5 text-center font-mono text-[9.5px] uppercase tracking-[1px] transition-colors',
                on
                  ? 'border-lime bg-lime text-[#1a2000]'
                  : isToday
                    ? 'border-border text-lime hover:border-lime/40'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-lime/30',
              )}
            >
              {fmt(day.date, { weekday: 'short' }).slice(0, 3)}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <span className="font-bebas text-xl tracking-[1px] text-foreground capitalize">
            {fmt(open.date, { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {kcalOf(open)} / {goalCalories} kcal
          </span>
        </div>

        {open.meals.map(meal => (
          <PlanMealRow
            key={meal.id}
            meal={meal}
            onOpenRecipe={onOpenRecipe}
            onLog={onLogMeal ? mealId => onLogMeal(open.id, mealId) : undefined}
            isLogging={loggingMealId === meal.id}
          />
        ))}

        {open.notes && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{open.notes}</p>
        )}

        {onRegenerateDay && (
          <button
            type="button"
            onClick={() => onRegenerateDay(open.id)}
            disabled={regeneratingDayId != null}
            className="mt-3 w-full rounded-[9px] border border-border py-2.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground hover:text-foreground hover:border-lime/30 disabled:opacity-40 transition-colors"
          >
            {regeneratingDayId === open.id ? '…' : t('plan.week.regenerateDay')}
          </button>
        )}
      </div>
    </div>
  )
}
