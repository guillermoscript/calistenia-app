import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import WeeklyPlanHeader from './WeeklyPlanHeader'
import WeeklyPlanDayView from './WeeklyPlanDayView'
import { RecipeDetailDialog } from '../pantry/RecipeDetailDialog'
import { useBackgroundJobs } from '../../hooks/useBackgroundJobs'
import type { WeeklyMealPlan as WeeklyMealPlanType, WeeklyPlanDay, WeeklyPlannedMeal, NutritionGoal, DailyTotals, Recipe } from '@calistenia/core/types'

interface Props {
  activePlan: WeeklyMealPlanType | null
  planDays: WeeklyPlanDay[]
  isLoading: boolean
  goals: NutritionGoal | null
  getDailyTotals: (date: string) => DailyTotals
  onGenerate: (goals: NutritionGoal) => Promise<string>
  onRegenerateDay: (dayId: string) => Promise<void>
  onLogMeal: (dayId: string, mealId: string) => Promise<void>
  onDeleteMeal: (dayId: string, mealId: string) => Promise<void>
  onArchive: () => Promise<void>
  onRefresh: () => Promise<void>
  /** F2 (#171): generación pantry-aware — solo si hay despensa. */
  userId?: string | null
  hasPantry?: boolean
  onGenerateFromPantry?: () => Promise<void>
}

function getTodayDayIndex(): number {
  const dow = new Date().getDay() // 0=Sun
  return dow === 0 ? 6 : dow - 1  // 0=Mon
}

export default function WeeklyMealPlan({
  activePlan,
  planDays,
  isLoading,
  goals,
  getDailyTotals,
  onGenerate,
  onRegenerateDay,
  onLogMeal,
  onDeleteMeal,
  onArchive,
  onRefresh,
  userId = null,
  hasPantry,
  onGenerateFromPantry,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const todayIndex = getTodayDayIndex()
  const [selectedDayIndex, setSelectedDayIndex] = useState(todayIndex)
  const [generating, setGenerating] = useState(false)
  const [generatingPantry, setGeneratingPantry] = useState(false)
  const [pantryError, setPantryError] = useState(false)
  const [openRecipe, setOpenRecipe] = useState<{ label: string; recipe: Recipe } | null>(null)
  const { addJob, canSubmit, pending } = useBackgroundJobs()

  // Plan pantry-aware: si alguna comida trae ingredientes "buy", ofrecer la shopping list
  const hasBuyItems = planDays.some(d =>
    (d.meals ?? []).some(m => m.recipe?.ingredients?.some(i => i.from === 'buy')),
  )

  const handleGenerateFromPantry = useCallback(async () => {
    if (!onGenerateFromPantry) return
    setGeneratingPantry(true)
    setPantryError(false)
    try {
      await onGenerateFromPantry()
    } catch {
      setPantryError(true)
    } finally {
      setGeneratingPantry(false)
    }
  }, [onGenerateFromPantry])

  const handleOpenRecipe = useCallback((meal: WeeklyPlannedMeal) => {
    if (meal.recipe) setOpenRecipe({ label: meal.label, recipe: meal.recipe })
  }, [])

  const pantryErrorBanner = pantryError ? (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
      {t('pantryPlan.error')}
    </div>
  ) : null

  const recipeDialog = (
    <RecipeDetailDialog
      open={openRecipe !== null}
      onOpenChange={(v) => { if (!v) setOpenRecipe(null) }}
      label={openRecipe?.label ?? ''}
      recipe={openRecipe?.recipe ?? null}
      userId={userId}
    />
  )

  // Check if there's a pending weekly plan job
  const hasPendingJob = pending.some(j => j.type === 'generate-weekly-meal-plan')

  // Refresh plan when a weekly job transitions from pending → gone
  const hadPendingJobRef = useRef(false)
  useEffect(() => {
    if (hasPendingJob) {
      hadPendingJobRef.current = true
    } else if (hadPendingJobRef.current) {
      hadPendingJobRef.current = false
      onRefresh()
    }
  }, [hasPendingJob, onRefresh])

  const handleGenerate = useCallback(async () => {
    if (!goals) {
      toast.error(t('nutrition.weeklyPlan.setGoalsFirst'))
      return
    }
    if (!canSubmit) {
      toast.warning(t('bgJobs.limitReached'))
      return
    }
    setGenerating(true)
    try {
      const jobId = await onGenerate(goals)
      if (addJob(jobId, 'generate-weekly-meal-plan')) {
        toast.info(t('nutrition.weeklyPlan.generating'), {
          description: t('nutrition.weeklyPlan.generatingDesc'),
          duration: 5000,
        })
      }
    } catch {
      toast.error(t('nutrition.weeklyPlan.generateError'))
    } finally {
      setGenerating(false)
    }
  }, [goals, canSubmit, onGenerate, addJob, t])

  const selectedDay = planDays.find(d => d.day_index === selectedDayIndex)

  // Get actual totals for the selected day
  const selectedDayDate = selectedDay?.date?.split('T')[0] ?? ''
  const actualTotals = selectedDayDate ? getDailyTotals(selectedDayDate) : undefined

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    )
  }

  // No active plan — show CTA
  if (!activePlan) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">{t('nutrition.weeklyPlan.aiLabel')}</div>
            <div className="font-bebas text-2xl mt-0.5">{t('nutrition.weeklyPlan.title')}</div>
          </div>
        </div>

        {hasPendingJob ? (
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground mb-3">{t('nutrition.weeklyPlan.generating')}</div>
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed border-lime-400/20">
            <CardContent className="p-5 text-center">
              <div className="text-2xl mb-2">📋</div>
              <div className="text-sm text-foreground font-medium">{t('nutrition.weeklyPlan.noActivePlan')}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t('nutrition.weeklyPlan.noActivePlanDesc')}
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || generatingPantry || !goals}
                variant="outline"
                size="sm"
                className="mt-3 border-lime-400/30 text-lime-400 hover:bg-lime-400/10 font-bebas tracking-widest"
              >
                {generating ? '...' : t('nutrition.weeklyPlan.generate')}
              </Button>
              {hasPantry && onGenerateFromPantry && (
                <Button
                  onClick={handleGenerateFromPantry}
                  disabled={generating || generatingPantry}
                  variant="outline"
                  size="sm"
                  className="mt-3 ml-2 border-lime-400/30 text-lime-400 hover:bg-lime-400/10 font-bebas tracking-widest"
                >
                  {generatingPantry ? t('pantryPlan.generatingWeek') : t('pantryPlan.fromPantry')}
                </Button>
              )}
              {pantryErrorBanner && <div className="mt-3 text-left">{pantryErrorBanner}</div>}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // Active plan — show week view
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">{t('nutrition.weeklyPlan.aiLabel')}</div>
          <div className="font-bebas text-2xl mt-0.5">{t('nutrition.weeklyPlan.title')}</div>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {hasBuyItems && (
            <Button
              onClick={() => navigate('/pantry/shopping')}
              size="sm"
              variant="outline"
              className="border-lime-400/30 text-lime-400 hover:bg-lime-400/10 font-bebas tracking-widest h-9 px-3"
            >
              {t('shopping.listButton')}
            </Button>
          )}
          {hasPantry && onGenerateFromPantry && (
            <Button
              onClick={handleGenerateFromPantry}
              disabled={generating || generatingPantry || hasPendingJob}
              size="sm"
              variant="outline"
              className="border-lime-400/30 text-lime-400 hover:bg-lime-400/10 font-bebas tracking-widest h-9 px-3"
            >
              {generatingPantry ? '...' : t('pantryPlan.fromPantryShort')}
            </Button>
          )}
          <Button
            onClick={handleGenerate}
            disabled={generating || generatingPantry || hasPendingJob || !canSubmit}
            size="sm"
            className="bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas tracking-widest h-9 px-4"
          >
            {hasPendingJob ? '...' : t('nutrition.weeklyPlan.regenerate')}
          </Button>
        </div>
      </div>

      {pantryErrorBanner}

      <div className="space-y-3">
        <WeeklyPlanHeader
          planDays={planDays}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={setSelectedDayIndex}
          todayIndex={todayIndex}
        />

        {selectedDay ? (
          <WeeklyPlanDayView
            day={selectedDay}
            actualTotals={actualTotals}
            onLogMeal={onLogMeal}
            onDeleteMeal={onDeleteMeal}
            onRegenerateDay={onRegenerateDay}
            onOpenRecipe={handleOpenRecipe}
          />
        ) : (
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              {t('nutrition.weeklyPlan.noDayData')}
            </CardContent>
          </Card>
        )}
      </div>

      {recipeDialog}
    </div>
  )
}
