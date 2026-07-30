import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PLAN_BASES,
  PLAN_HORIZONS,
  type PlanBase,
  type PlanBlocker,
  type PlanBudget as Budget,
  type PlanHorizon,
} from '@calistenia/core/lib/meal-plan-spec'
import { cn } from '../../../lib/utils'
import { Kicker } from '../../ui/kicker'
import { PlanBudget } from './PlanBudget'

const HORIZON_KEYS: Record<PlanHorizon, string> = {
  today: 'plan.horizon.today',
  tomorrow: 'plan.horizon.tomorrow',
  week: 'plan.horizon.week',
}

const BASE_KEYS: Record<PlanBase, string> = {
  pantry: 'plan.base.pantry',
  buy: 'plan.base.buy',
}

const BLOCKER_KEYS: Record<PlanBlocker, string> = {
  noGoals: 'plan.blocked.noGoals',
  jobPending: 'plan.blocked.jobPending',
  queueFull: 'plan.blocked.queueFull',
  todayCovered: 'plan.blocked.todayCovered',
  emptyPantry: 'plan.blocked.emptyPantry',
}

/**
 * One segmented axis. Both axes share it on purpose: they are peers, and the
 * underline treatment is spoken for by the HOY/PLANIFICAR tab bar right above.
 */
function Seg<T extends string>({ label, options, value, onChange, labelFor, disabledOptions }: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labelFor: (v: T) => string
  disabledOptions?: readonly T[]
}) {
  return (
    <div>
      <Kicker className="mb-2">{label}</Kicker>
      <div className="flex gap-1.5" role="group" aria-label={label}>
        {options.map(o => {
          const disabled = disabledOptions?.includes(o) ?? false
          const on = value === o
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o)}
              aria-pressed={on}
              className={cn(
                'flex-1 rounded-lg border px-1 py-2 font-bebas text-[15px] tracking-[1.5px] transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime',
                on
                  ? 'border-lime bg-lime/15 text-lime'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-lime/30',
                disabled && 'opacity-35 cursor-not-allowed hover:text-muted-foreground hover:border-border',
              )}
            >
              {labelFor(o)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Axis 1 — when. Rendered above the result so the user can flip HOY/MAÑANA/SEMANA
 * without reopening the composer.
 */
export function PlanHorizonAxis({ horizon, onChange }: {
  horizon: PlanHorizon
  onChange: (h: PlanHorizon) => void
}) {
  const { t } = useTranslation()
  return (
    <Seg
      label={t('plan.axis.when')}
      options={PLAN_HORIZONS}
      value={horizon}
      onChange={onChange}
      labelFor={h => t(HORIZON_KEYS[h])}
    />
  )
}

interface PlanComposerProps {
  horizon: PlanHorizon
  requestedBase: PlanBase
  onBaseChange: (b: PlanBase) => void
  base: PlanBase
  budget: Budget | null
  blocker: PlanBlocker | null
  canGenerate: boolean
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  pantryCount: number
  loggedKcal: number
  onOpenPantry: () => void
  /** "Food first": with a plan on screen this folds to a single disclosure row. */
  collapsed: boolean
  onExpand: () => void
  /** Skeletons + "keep it in the background" while a week job is in flight. */
  busySlot?: ReactNode
}

/**
 * Axis 2 + the brief + the button.
 *
 * The screen this replaces had 11 controls for 6 capabilities, two of which
 * called the same endpoint. Here the only way to change what gets generated is
 * to move one of the two axes, and `resolveDispatch` in core owns the mapping,
 * so the UI cannot reintroduce a duplicate button.
 */
export function PlanComposer(props: PlanComposerProps) {
  const { t } = useTranslation()
  const {
    horizon, requestedBase, onBaseChange, base, budget, blocker,
    canGenerate, isGenerating, error, onGenerate,
    pantryCount, loggedKcal, onOpenPantry, collapsed, onExpand, busySlot,
  } = props

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="w-full flex items-center justify-between border-t border-border pt-3 text-left group"
      >
        <Kicker className="group-hover:text-foreground transition-colors">
          {t('plan.composer.reopen')}
        </Kicker>
        <span className="font-mono text-[10px] text-muted-foreground" aria-hidden>▾</span>
      </button>
    )
  }

  // Sin despensa el eje no se oculta: se deshabilita con el motivo a la vista.
  // La versión vieja hacía `return null` y la sección entera desaparecía.
  const pantryDisabled = pantryCount === 0

  const note = blocker
    ? t(BLOCKER_KEYS[blocker])
    : horizon === 'week'
      ? t('plan.cta.noteAsync')
      : t('plan.cta.noteImmediate')

  return (
    <div className="space-y-4">
      <Seg
        label={t('plan.axis.with')}
        options={PLAN_BASES}
        value={requestedBase}
        onChange={onBaseChange}
        labelFor={b => t(BASE_KEYS[b])}
        disabledOptions={pantryDisabled ? (['pantry'] as const) : undefined}
      />

      {pantryDisabled && (
        <div className="font-mono text-[10px] uppercase tracking-[1.2px] leading-relaxed text-muted-foreground">
          {t('plan.blocked.emptyPantry')}{' · '}
          <button type="button" onClick={onOpenPantry} className="text-lime hover:text-lime/80">
            {t('plan.emptyHint.cta')}
          </button>
        </div>
      )}

      <PlanBudget
        horizon={horizon}
        base={base}
        budget={budget}
        loggedKcal={loggedKcal}
        covered={blocker === 'todayCovered'}
      />

      <div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className={cn(
            'w-full rounded-[10px] py-3 font-bebas text-[19px] tracking-[2.5px] text-[#1a2000] transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-lime',
            canGenerate ? 'bg-lime hover:bg-lime/90' : 'bg-lime/25 text-muted-foreground cursor-not-allowed',
          )}
        >
          {isGenerating ? t('plan.cta.busy') : horizon === 'week' ? t('plan.cta.week') : t('plan.cta.day')}
        </button>

        <div className="mt-2 text-center font-mono text-[9.5px] uppercase tracking-[1.5px] text-muted-foreground">
          {note}
        </div>
      </div>

      {busySlot}

      {error && (
        <div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-[12.5px] text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}
