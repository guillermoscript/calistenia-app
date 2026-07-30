import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import { planDates, targetDateFor } from '@calistenia/core/lib/meal-plan-spec'
import { buyIngredientCount, planSources } from '@calistenia/core/lib/plan-shopping'
import { usePlanGeneration } from '@calistenia/core/hooks/usePlanGeneration'
import { useMealPlans } from '@calistenia/core/hooks/useMealPlans'
import { usePantryCoverage } from '@calistenia/core/hooks/usePantryCoverage'
import { useWeeklyMealPlan } from '@calistenia/core/hooks/useWeeklyMealPlan'
import type { DailyTotals, NutritionGoal, Recipe } from '@calistenia/core/types'
import { useBackgroundJobs } from '../../../hooks/useBackgroundJobs'
import { RecipeDetailDialog } from '../../pantry/RecipeDetailDialog'
import { Kicker } from '../../ui/kicker'
import { PlanComposer, PlanHorizonAxis } from './PlanComposer'
import { PlanResult } from './PlanResult'
import { PlanWeekStrip } from './PlanWeekStrip'

interface PlanTabProps {
  userId: string | null
  goals: NutritionGoal
  /** Consumed today — only the 'today' horizon subtracts it. */
  todayTotals: DailyTotals
  loggedMealTypes: string[]
  pantryCount: number
  onOpenPantry: () => void
  onOpenShoppingList: () => void
}

/**
 * The whole PLANIFICAR tab.
 *
 * It lives outside NutritionPage on purpose: the tab needs six hooks and a
 * dialog of its own, and folding that into an 870-line page is how the previous
 * version ended up with five components each generating plans their own way.
 * The native twin (PR3) ports this file, not the page.
 */
export function PlanTab(props: PlanTabProps) {
  const { userId, goals, todayTotals, loggedMealTypes, pantryCount, onOpenPantry, onOpenShoppingList } = props
  const { t, i18n } = useTranslation()

  const { addJob, pendingCount, pending } = useBackgroundJobs()
  // Solo el semanal pasa por la cola; si ya hay uno en vuelo, generar otro
  // duplicaría el trabajo y el segundo pisaría al primero al completarse.
  const planJobPending = pending.some(
    j => j.type === 'generate-weekly-meal-plan' || j.type === 'generate-pantry-plan',
  )

  const { dayPlans, planForDate, logMeal } = useMealPlans(userId)
  const {
    activePlan: weeklyPlan,
    planDays: weeklyDays,
    regenerateDay,
    logMeal: logWeeklyMeal,
    archivePlan: archiveWeekly,
    refresh: refreshWeekly,
  } = useWeeklyMealPlan(userId)

  const dailyGoals: DailyTotals = useMemo(() => ({
    calories: goals.dailyCalories,
    protein: goals.dailyProtein,
    carbs: goals.dailyCarbs,
    fat: goals.dailyFat,
  }), [goals])

  const plan = usePlanGeneration({
    userId,
    goals: dailyGoals,
    goalType: goals.goal,
    todayTotals,
    loggedMealTypes,
    pendingJobs: pendingCount,
    planJobPending,
    onJobSubmitted: (jobId, dispatch) => {
      // Lo que rompía el semanal nativo: el job id se descartaba y nadie
      // refrescaba el plan al completarse.
      addJob(jobId, dispatch.endpoint === 'pantry-week' ? 'generate-pantry-plan' : 'generate-weekly-meal-plan')
      toast.info(t('plan.jobQueued'))
    },
  })

  // "¿Hasta dónde me alcanza la despensa?" — cacheada por firma del inventario,
  // así que no gasta una llamada al modelo mientras no cambie lo que hay.
  const coverage = usePantryCoverage(userId, dailyGoals, pantryCount > 0)

  const today = todayStr()
  const dates = useMemo(() => planDates(), [today])
  const targetDate = targetDateFor(plan.horizon, dates)

  const dayPlan = plan.horizon === 'week' ? undefined : planForDate(targetDate)
  const hasResult = plan.horizon === 'week' ? weeklyDays.length > 0 : !!dayPlan

  // "Comida primero": con un plan en pantalla el compositor se pliega y solo se
  // reabre si el usuario lo pide. El eje de horizonte se queda fuera del pliegue
  // para poder saltar de HOY a MAÑANA sin desplegar nada.
  const [forceOpen, setForceOpen] = useState(false)
  useEffect(() => { setForceOpen(false) }, [plan.horizon, dayPlans.length, weeklyDays.length])

  const [openRecipe, setOpenRecipe] = useState<{ label: string; recipe: Recipe } | null>(null)
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null)
  const [isLoggingAll, setIsLoggingAll] = useState(false)
  const [regeneratingDayId, setRegeneratingDayId] = useState<string | null>(null)

  // El semanal llega por job: cuando la cola se vacía, el plan del servidor ya
  // está y hay que traerlo — sin esto la tira de semana se queda vieja.
  const wasPending = useRef(planJobPending)
  useEffect(() => {
    if (wasPending.current && !planJobPending) void refreshWeekly()
    wasPending.current = planJobPending
  }, [planJobPending, refreshWeekly])

  const buyCount = useMemo(
    () => buyIngredientCount(planSources(dayPlans, weeklyDays), today),
    [dayPlans, weeklyDays, today],
  )

  const dateLabel = useCallback((date: string) => {
    if (date === dates.today) return t('plan.horizon.today').toLowerCase()
    if (date === dates.tomorrow) return t('plan.horizon.tomorrow').toLowerCase()
    try {
      return new Date(`${date}T12:00:00`).toLocaleDateString(
        i18n.language === 'en' ? 'en-US' : 'es-ES',
        { weekday: 'short', day: 'numeric', month: 'short' },
      )
    } catch {
      return date
    }
  }, [dates, t, i18n.language])

  const handleOpenRecipe = useCallback((label: string, recipe: Recipe) => {
    setOpenRecipe({ label, recipe })
  }, [])

  const handleLogDayMeal = useCallback(async (mealId: string) => {
    if (!dayPlan) return
    setLoggingMealId(mealId)
    try {
      await logMeal(dayPlan.id, mealId)
    } catch {
      toast.error(t('nutrition.logger.saveError'))
    } finally {
      setLoggingMealId(null)
    }
  }, [dayPlan, logMeal, t])

  const handleLogAll = useCallback(async () => {
    if (!dayPlan) return
    setIsLoggingAll(true)
    try {
      // En serie: cada logMeal reescribe el array `meals` del plan entero, así
      // que en paralelo la última escritura borraría las anteriores.
      for (const meal of dayPlan.meals.filter(m => !m.logged)) {
        await logMeal(dayPlan.id, meal.id)
      }
    } catch {
      toast.error(t('nutrition.logger.saveError'))
    } finally {
      setIsLoggingAll(false)
    }
  }, [dayPlan, logMeal, t])

  const handleLogWeeklyMeal = useCallback(async (dayId: string, mealId: string) => {
    setLoggingMealId(mealId)
    try {
      await logWeeklyMeal(dayId, mealId)
    } catch {
      toast.error(t('nutrition.logger.saveError'))
    } finally {
      setLoggingMealId(null)
    }
  }, [logWeeklyMeal, t])

  const handleRegenerateDay = useCallback(async (dayId: string) => {
    setRegeneratingDayId(dayId)
    try {
      await regenerateDay(dayId)
    } catch {
      toast.error(t('plan.blocked.queueFull'))
    } finally {
      setRegeneratingDayId(null)
    }
  }, [regenerateDay, t])

  return (
    <>
      {/* Despensa — el inventario que alimenta "LO QUE TENGO" */}
      <div>
        <button
          onClick={onOpenPantry}
          className="w-full flex items-end justify-between gap-3 border-b border-border pb-3.5 hover:opacity-80 transition-opacity text-left group"
        >
          <span className="space-y-1.5">
            <Kicker as="span" className="block">{t('pantry.title')}</Kicker>
            {pantryCount > 0 ? (
              <span className="block font-bebas text-3xl leading-none tabular-nums text-foreground">
                {pantryCount}
                <span className="font-mono text-[10px] tracking-[2px] text-muted-foreground ml-[7px]">
                  {t('nutrition.planHub.foods').toUpperCase()}
                </span>
              </span>
            ) : (
              <span className="block text-[12.5px] text-muted-foreground">{t('nutrition.planHub.empty')}</span>
            )}
          </span>
          <Kicker as="span" tone="lime" size="xs" className="pb-0.5 group-hover:text-lime/80 transition-colors">
            {t('nutrition.planHub.manage')} <span aria-hidden>›</span>
          </Kicker>
        </button>

        {/* Alcance real del inventario. Antes era un botón más entre los
            generadores y su resultado se borraba al pulsar cualquier otro. */}
        {pantryCount > 0 && coverage.coverage && (
          <div className="flex items-baseline gap-2 pt-2.5 font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
            <span className="font-bebas text-[22px] leading-none tracking-[.5px] text-lime">
              {coverage.coverage.total_meals}
            </span>
            <span>{t('plan.reach.meals')}</span>
            <span>· {t('plan.reach.days', { count: coverage.coverage.days_covered })}</span>
            <button
              type="button"
              onClick={() => void coverage.refetch()}
              disabled={coverage.isLoading}
              className="ml-auto text-lime hover:text-lime/80 disabled:opacity-40"
            >
              {coverage.isLoading ? '…' : t('plan.reach.recalc')}
            </button>
          </div>
        )}
      </div>

      {/* Eje 1 fuera del pliegue: cambiar de horizonte no debería costar un despliegue. */}
      <PlanHorizonAxis horizon={plan.horizon} onChange={plan.setHorizon} />

      {/* Resultado por encima del compositor: la comida es lo que se vino a ver. */}
      {dayPlan && (
        <PlanResult
          plan={dayPlan}
          dateLabel={dateLabel(dayPlan.target_date)}
          isToday={dayPlan.target_date === dates.today}
          onOpenRecipe={handleOpenRecipe}
          onLogMeal={handleLogDayMeal}
          loggingMealId={loggingMealId}
          onRegenerate={plan.canGenerate ? plan.generate : undefined}
          onLogAll={handleLogAll}
          isLoggingAll={isLoggingAll}
        />
      )}

      {plan.horizon === 'week' && weeklyPlan && weeklyDays.length > 0 && (
        <PlanWeekStrip
          days={weeklyDays}
          goalCalories={goals.dailyCalories}
          onOpenRecipe={handleOpenRecipe}
          onLogMeal={handleLogWeeklyMeal}
          loggingMealId={loggingMealId}
          onRegenerateDay={handleRegenerateDay}
          regeneratingDayId={regeneratingDayId}
          onArchive={() => { void archiveWeekly() }}
        />
      )}

      {/* Lo que el propio plan dice que falta comprar. Es la señal barata: la
          lista real sale del diff contra el inventario en buildShoppingList. */}
      {buyCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-r-lg border border-l-2 border-border border-l-amber-400 px-3.5 py-2.5">
          <span className="text-[12.5px] leading-snug text-foreground">
            {t('plan.buyStrip.text', { count: buyCount })}
          </span>
          <button
            type="button"
            onClick={onOpenShoppingList}
            className="shrink-0 font-mono text-[10px] uppercase tracking-[2px] text-lime hover:text-lime/80 transition-colors"
          >
            {t('plan.buyStrip.cta')}
          </button>
        </div>
      )}

      <PlanComposer
        horizon={plan.horizon}
        requestedBase={plan.requestedBase}
        onBaseChange={plan.setBase}
        base={plan.base}
        budget={plan.budget}
        blocker={plan.blocker}
        canGenerate={plan.canGenerate}
        isGenerating={plan.isGenerating}
        error={plan.error}
        onGenerate={plan.generate}
        pantryCount={pantryCount}
        loggedKcal={Math.round(todayTotals.calories)}
        onOpenPantry={onOpenPantry}
        collapsed={hasResult && !forceOpen}
        onExpand={() => setForceOpen(true)}
        busySlot={planJobPending ? (
          <div>
            {[1, 0.7, 0.45].map(o => (
              <div key={o} className="h-[46px] rounded-[9px] bg-foreground/[0.055] mb-2" style={{ opacity: o }} />
            ))}
            <div className="text-center font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('plan.background')}
            </div>
          </div>
        ) : undefined}
      />

      <RecipeDetailDialog
        open={openRecipe != null}
        onOpenChange={v => { if (!v) setOpenRecipe(null) }}
        label={openRecipe?.label ?? ''}
        recipe={openRecipe?.recipe ?? null}
        userId={userId}
      />
    </>
  )
}
