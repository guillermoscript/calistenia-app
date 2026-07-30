import { useTranslation } from 'react-i18next'
import type { PlanBase, PlanBudget as Budget, PlanHorizon } from '@calistenia/core/lib/meal-plan-spec'
import { cn } from '../../../lib/utils'

const LABEL_KEYS: Record<PlanHorizon, string> = {
  today: 'plan.budget.label.today',
  tomorrow: 'plan.budget.label.tomorrow',
  week: 'plan.budget.label.week',
}

interface PlanBudgetProps {
  horizon: PlanHorizon
  /** Resolved base — what will actually run, so the sentence never lies. */
  base: PlanBase
  budget: Budget | null
  /** kcal already logged today, for the "today" footnote. */
  loggedKcal: number
  covered: boolean
}

/**
 * What the two axes add up to, in one sentence and one number.
 *
 * The sentence exists because a 3×2 matrix is not self-explanatory: "MAÑANA +
 * LO QUE COMPRO" reads as a setting, not as a promise. The number below it is
 * the payload — the old screen sent two contradictory budgets from two adjacent
 * buttons and printed neither.
 */
export function PlanBudget({ horizon, base, budget, loggedKcal, covered }: PlanBudgetProps) {
  const { t } = useTranslation()

  const foot = horizon === 'today'
    ? t('plan.budget.foot.today', { kcal: loggedKcal })
    : horizon === 'tomorrow'
      ? t('plan.budget.foot.tomorrow')
      : budget
        ? t('plan.budget.foot.week', { total: budget.calories * 7 })
        : ''

  return (
    <div className="border-l-2 border-lime pl-3.5 py-0.5">
      <p className="text-[13.5px] leading-relaxed text-foreground">
        {t(`plan.brief.${horizon}.${base}`)}
      </p>

      {budget && (
        <>
          <div className="mt-2 flex items-baseline gap-2.5 flex-wrap">
            <span className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
              {t(LABEL_KEYS[horizon])}
            </span>
            <span
              className={cn(
                'font-bebas text-3xl leading-none tabular-nums',
                covered ? 'text-emerald-400' : 'text-lime',
              )}
            >
              {budget.calories}
            </span>
            {covered ? (
              <span className="font-mono text-[10.5px] tracking-[1px] text-muted-foreground">
                {t('plan.budget.covered')}
              </span>
            ) : (
              <span className="font-mono text-[10.5px] tracking-[1px] tabular-nums">
                <span className="text-sky-500">{budget.protein} P</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-amber-400">{budget.carbs} C</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-pink-500">{budget.fat} G</span>
              </span>
            )}
          </div>

          {foot && (
            <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
              {foot}
            </div>
          )}
        </>
      )}
    </div>
  )
}
