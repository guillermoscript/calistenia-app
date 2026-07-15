/**
 * Sección "Desde tu despensa" — plan pantry-aware (#171), versión web.
 * Puerto 1:1 de apps/mobile/src/components/nutrition/PantryPlanSection.tsx.
 * En mobile "ver receta" navega a /recipe-detail; acá abre un
 * RecipeDetailDialog local (la receta no persiste, viaja en memoria).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePantryPlan } from '@calistenia/core/hooks/usePantryPlan'
import { todayStr, addDays } from '@calistenia/core/lib/dateUtils'
import type { PantryPlanGoals } from '@calistenia/core/lib/pantry-api'
import type { HowManyMealsResult, PantryDayPlanResult, Recipe } from '@calistenia/core/types'
import { cn } from '../../lib/utils'
import { RecipeDetailDialog } from '../pantry/RecipeDetailDialog'

const MEAL_TYPE_COLORS: Record<string, string> = {
  desayuno: 'bg-amber-400',
  almuerzo: 'bg-sky-400',
  cena: 'bg-pink-400',
  snack: 'bg-lime-400',
}

// tz-aware — new Date().toISOString() corre el día en la tarde para tz al oeste de UTC.
function isoDate(offsetDays: number): string {
  return addDays(todayStr(), offsetDays)
}

// El LLM a veces devuelve la frase entera ("te limita el pollo (2 kg)...") aunque el
// prompt pida solo el nombre — sin esto la UI muestra "te limita: te limita el pollo".
function cleanLimiting(raw: string): string {
  return raw.replace(/^te\s+limita:?\s*/i, '').trim()
}

// "2026-07-06" → "dom, 6 jul" (misma convención que formatWeekRange en WeeklyMealPlan)
function formatDayLabel(dateStr: string, lang: string): string {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr
  }
}

interface PantryPlanSectionProps {
  userId: string | null
  goals: PantryPlanGoals
}

export function PantryPlanSection({ userId, goals }: PantryPlanSectionProps) {
  const { t, i18n } = useTranslation()
  const { hasPantry, generateDay, howManyMeals } = usePantryPlan(userId)
  const [target, setTarget] = useState<'today' | 'tomorrow'>('tomorrow') // default Mañana (caso de uso: qué cocino mañana)
  const [loading, setLoading] = useState<'day' | 'howmany' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dayPlan, setDayPlan] = useState<PantryDayPlanResult | null>(null)
  const [howMany, setHowMany] = useState<HowManyMealsResult | null>(null)
  const [openRecipe, setOpenRecipe] = useState<{ label: string; recipe: Recipe } | null>(null)

  if (!hasPantry) return null

  const onGenerateDay = async () => {
    setLoading('day')
    setError(null)
    setHowMany(null)
    try {
      const plan = await generateDay(isoDate(target === 'tomorrow' ? 1 : 0), goals)
      // LLM degenerado sin comidas = fallo, no un plan vacío con TOTAL 0.
      if (!plan.meals?.length) throw new Error('empty plan')
      setDayPlan(plan)
    } catch {
      setError(t('pantryPlan.error'))
    } finally {
      setLoading(null)
    }
  }

  const onHowMany = async () => {
    setLoading('howmany')
    setError(null)
    setDayPlan(null)
    try {
      setHowMany(await howManyMeals(goals))
    } catch {
      setError(t('pantryPlan.error'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="border-t border-border pt-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
        {t('pantryPlan.kicker')}
      </div>

      {/* Controles: Hoy/Mañana + CTAs */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => loading === null && setTarget('tomorrow')}
          className={cn(
            'rounded-lg border px-3 py-2 font-mono text-xs uppercase tracking-wide transition-colors',
            target === 'tomorrow'
              ? 'border-lime-400/50 bg-lime-400/10 text-lime-400'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {t('pantryPlan.tomorrow')}
        </button>
        <button
          type="button"
          onClick={() => loading === null && setTarget('today')}
          className={cn(
            'rounded-lg border px-3 py-2 font-mono text-xs uppercase tracking-wide transition-colors',
            target === 'today'
              ? 'border-lime-400/50 bg-lime-400/10 text-lime-400'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {t('pantryPlan.today')}
        </button>
      </div>
      <button
        type="button"
        onClick={onGenerateDay}
        disabled={loading !== null}
        className={cn(
          'w-full rounded-lg py-2.5 flex items-center justify-center font-bebas text-base tracking-wide text-zinc-900 transition-colors',
          loading ? 'bg-lime-400/50' : 'bg-lime-400 hover:bg-lime-300',
        )}
      >
        {loading === 'day' ? (
          <span className="size-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
        ) : (
          t('pantryPlan.generateDay')
        )}
      </button>
      <button
        type="button"
        onClick={onHowMany}
        disabled={loading !== null}
        className="w-full py-2.5 flex items-center justify-center font-mono text-xs uppercase tracking-wide text-lime-400 hover:text-lime-300 disabled:opacity-50 transition-colors"
      >
        {loading === 'howmany' ? (
          <span className="size-3.5 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin" />
        ) : (
          t('pantryPlan.howMany')
        )}
      </button>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 mt-2">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Resultado: plan del día */}
      {dayPlan && (
        <div className="mt-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {t('pantryPlan.planFor', {
              date: formatDayLabel(dayPlan.target_date ?? isoDate(target === 'tomorrow' ? 1 : 0), i18n.language),
            })}
          </div>
          {dayPlan.meals.map((meal, i) => (
            <button
              type="button"
              key={`${meal.meal_type}-${i}`}
              onClick={() => meal.recipe && setOpenRecipe({ label: meal.label, recipe: meal.recipe })}
              disabled={!meal.recipe}
              className="w-full text-left border-b border-border py-3 disabled:cursor-default"
            >
              <div className="flex items-center gap-2">
                <div className={cn('h-2 w-2 rounded-full shrink-0', MEAL_TYPE_COLORS[meal.meal_type] ?? 'bg-muted')} />
                <span className="text-sm font-medium text-foreground flex-1 truncate">{meal.label}</span>
                <span className="font-mono text-xs text-muted-foreground shrink-0">{meal.calories} kcal</span>
              </div>
              <div className="flex items-center justify-between mt-1 pl-4">
                <span className="font-mono text-[10px] text-muted-foreground">
                  P{meal.protein} · C{meal.carbs} · G{meal.fat}
                </span>
                {meal.recipe && (
                  <span className="font-mono text-[10px] uppercase tracking-wide text-lime-400">{t('pantryPlan.viewRecipe')} →</span>
                )}
              </div>
            </button>
          ))}
          {(() => {
            const total = dayPlan.meals.reduce(
              (a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
              { calories: 0, protein: 0, carbs: 0, fat: 0 },
            )
            return (
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t('pantryPlan.total')}</span>
                  <span className="font-bebas text-lg leading-none text-foreground">
                    {total.calories}
                    <span className="font-mono text-[10px] text-muted-foreground"> / {goals.calories} kcal</span>
                  </span>
                </div>
                <div className="flex justify-end mt-1">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    P{total.protein} · C{total.carbs} · G{total.fat}
                  </span>
                </div>
              </div>
            )
          })()}
          {dayPlan.notes ? <p className="text-xs text-muted-foreground mt-2">{dayPlan.notes}</p> : null}
        </div>
      )}

      {/* Resultado: cuántas comidas — hairline, no card (idioma spec-sheet) */}
      {howMany && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-baseline gap-2">
            <span className="font-bebas text-4xl text-lime-400">{howMany.total_meals}</span>
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {t('pantryPlan.mealsUnit')} · {t('pantryPlan.daysCovered', { days: howMany.days_covered })}
            </span>
          </div>
          <div className="mt-3">
            {howMany.breakdown.map((row, i) => (
              <div key={`${row.meal_label}-${i}`} className="border-t border-border py-2.5 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{row.meal_label}</span>
                  <span className="font-bebas text-base leading-none text-lime-400">×{row.times_possible}</span>
                </div>
                <p className="font-mono text-[10px] text-amber-400 line-clamp-2">
                  {t('pantryPlan.limitedBy', { ingredient: cleanLimiting(row.limiting_ingredient) })}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{howMany.summary}</p>
        </div>
      )}

      <RecipeDetailDialog
        open={openRecipe != null}
        onOpenChange={(v) => {
          if (!v) setOpenRecipe(null)
        }}
        label={openRecipe?.label ?? ''}
        recipe={openRecipe?.recipe ?? null}
        userId={userId}
      />
    </div>
  )
}
