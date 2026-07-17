import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'
import { calculateBmi, bmiCategoryKey, bmiColorClass, parseDecimal, calculateWhtr, whtrCategoryKey, whtrColorClass } from '@calistenia/core/lib/bmi'
import { primaryGoalImpliesWeightChange } from '@calistenia/core/lib/primaryGoal'
import type { PrimaryGoal } from '@calistenia/core/types/onboarding'

export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'very_active'
export type Pace = 'gradual' | 'balanced' | 'aggressive'

export interface GoalsValues {
  primary_goal: PrimaryGoal | ''
  goal_weight: string
  waist: string
  activity_level: ActivityLevel | ''
  pace: Pace | ''
}

interface Props {
  values: GoalsValues
  onChange: (next: GoalsValues) => void
  currentWeightKg: number | null  // from the Basics step, for BMI reference
  currentHeightCm: number | null  // from the Basics step, for BMI calc
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepGoals({
  values, onChange, currentWeightKg, currentHeightCm, saving,
  onBack, onContinue, onSkip,
}: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof GoalsValues>(key: K, v: GoalsValues[K]) =>
    onChange({ ...values, [key]: v })

  const goalWeightNum = parseDecimal(values.goal_weight)
  const waistNum = parseDecimal(values.waist)
  const currentBmi = useMemo(() => calculateBmi(currentWeightKg, currentHeightCm), [currentWeightKg, currentHeightCm])
  const goalBmi = useMemo(() => calculateBmi(goalWeightNum, currentHeightCm), [goalWeightNum, currentHeightCm])
  const whtr = useMemo(() => calculateWhtr(waistNum, currentHeightCm), [waistNum, currentHeightCm])

  // El peso objetivo solo se destaca si el objetivo implica cambio de peso.
  const goalWeightOptional = !!values.primary_goal && !primaryGoalImpliesWeightChange(values.primary_goal)

  const PRIMARY_GOALS: { value: PrimaryGoal; label: string }[] = [
    { value: 'ganar_musculo', label: t('onboarding.primaryGoalMuscle') },
    { value: 'perder_grasa', label: t('onboarding.primaryGoalFatLoss') },
    { value: 'recomposicion', label: t('onboarding.primaryGoalRecomp') },
    { value: 'resistencia', label: t('onboarding.primaryGoalEndurance') },
    { value: 'habilidades', label: t('onboarding.primaryGoalSkills') },
    { value: 'salud_general', label: t('onboarding.primaryGoalHealth') },
  ]

  const ACTIVITY: { value: ActivityLevel; label: string; desc: string }[] = [
    { value: 'sedentary', label: t('onboarding.activitySedentary'), desc: t('onboarding.activitySedentaryDesc') },
    { value: 'light', label: t('onboarding.activityLight'), desc: t('onboarding.activityLightDesc') },
    { value: 'active', label: t('onboarding.activityActive'), desc: t('onboarding.activityActiveDesc') },
    { value: 'very_active', label: t('onboarding.activityVeryActive'), desc: t('onboarding.activityVeryActiveDesc') },
  ]

  const PACE: { value: Pace; label: string; desc: string }[] = [
    { value: 'gradual', label: t('onboarding.paceGradual'), desc: t('onboarding.paceGradualDesc') },
    { value: 'balanced', label: t('onboarding.paceBalanced'), desc: t('onboarding.paceBalancedDesc') },
    { value: 'aggressive', label: t('onboarding.paceAggressive'), desc: t('onboarding.paceAggressiveDesc') },
  ]

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.goalsTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.goalsDesc')}</div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 flex flex-col gap-4">
          {/* Primary goal */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.primaryGoal')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRIMARY_GOALS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('primary_goal', opt.value)}
                  aria-pressed={values.primary_goal === opt.value}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors',
                    values.primary_goal === opt.value
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Goal weight */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ob-goal-weight" className="text-[11px] text-muted-foreground tracking-wide uppercase">
              {t('onboarding.goalWeight')}{goalWeightOptional ? ` ${t('onboarding.optionalTag')}` : ''}
            </Label>
            <Input
              id="ob-goal-weight"
              type="number"
              step="0.1"
              min="0"
              placeholder={t('onboarding.goalWeightPlaceholder')}
              value={values.goal_weight}
              onChange={(e) => set('goal_weight', e.target.value)}
              className="h-10"
            />
            {(currentWeightKg || currentBmi) && (
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground mt-0.5">
                {currentWeightKg && (
                  <span>{t('onboarding.currentWeightRef', { weight: currentWeightKg })}</span>
                )}
                {currentBmi && (
                  <span className={bmiColorClass(currentBmi)}>
                    {t('onboarding.bmiCurrent', { bmi: currentBmi })} ({t(`onboarding.${bmiCategoryKey(currentBmi)}`)})
                  </span>
                )}
                {goalBmi && (
                  <span className={bmiColorClass(goalBmi)}>
                    {t('onboarding.bmiGoal', { bmi: goalBmi })} ({t(`onboarding.${bmiCategoryKey(goalBmi)}`)})
                  </span>
                )}
                {currentBmi && (
                  <span className="basis-full">{t('onboarding.bmiOrientative')}</span>
                )}
              </div>
            )}
          </div>

          {/* Waist / WHtR */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ob-waist" className="text-[11px] text-muted-foreground tracking-wide uppercase">
              {t('onboarding.waist')} {t('onboarding.optionalTag')}
            </Label>
            <Input
              id="ob-waist"
              type="number"
              step="0.5"
              min="0"
              placeholder={t('onboarding.waistPlaceholder')}
              value={values.waist}
              onChange={(e) => set('waist', e.target.value)}
              className="h-10"
            />
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground mt-0.5">
              {whtr ? (
                <span className={whtrColorClass(whtr)}>
                  {t('onboarding.whtrValue', { whtr })} ({t(`onboarding.${whtrCategoryKey(whtr)}`)})
                </span>
              ) : (
                <span>{t('onboarding.waistHint')}</span>
              )}
            </div>
          </div>

          {/* Activity level */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.activityLevel')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {ACTIVITY.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('activity_level', opt.value)}
                  aria-pressed={values.activity_level === opt.value}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                    values.activity_level === opt.value
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pace */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.pace')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {PACE.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('pace', opt.value)}
                  aria-pressed={values.pace === opt.value}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-center transition-colors',
                    values.pace === opt.value
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 h-11 font-mono text-xs tracking-wide"
        >
          {t('onboarding.back')}
        </Button>
        <Button
          onClick={onContinue}
          disabled={saving}
          className="flex-1 h-11 font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
        >
          {saving ? t('onboarding.saving') : t('onboarding.continueBtn')}
        </Button>
      </div>

      <button
        onClick={onSkip}
        className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        {t('onboarding.skipForNow')}
      </button>
    </div>
  )
}
