import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'

export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'very_active'
export type Pace = 'gradual' | 'balanced' | 'aggressive'

export interface GoalsValues {
  goal_weight: string
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

function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null
  const m = heightCm / 100
  return Number((weightKg / (m * m)).toFixed(1))
}

function bmiCategoryKey(v: number): 'bmiUnderweight' | 'bmiNormal' | 'bmiOverweight' | 'bmiObese' {
  if (v < 18.5) return 'bmiUnderweight'
  if (v < 25) return 'bmiNormal'
  if (v < 30) return 'bmiOverweight'
  return 'bmiObese'
}

function bmiColor(v: number): string {
  if (v < 18.5 || (v >= 25 && v < 30)) return 'text-amber-400'
  if (v >= 30) return 'text-red-500'
  return 'text-emerald-500'
}

export function StepGoals({
  values, onChange, currentWeightKg, currentHeightCm, saving,
  onBack, onContinue, onSkip,
}: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof GoalsValues>(key: K, v: GoalsValues[K]) =>
    onChange({ ...values, [key]: v })

  const goalWeightNum = values.goal_weight ? parseFloat(values.goal_weight) : null
  const currentBmi = useMemo(() => bmi(currentWeightKg, currentHeightCm), [currentWeightKg, currentHeightCm])
  const goalBmi = useMemo(() => bmi(goalWeightNum, currentHeightCm), [goalWeightNum, currentHeightCm])

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
          {/* Goal weight */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ob-goal-weight" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.goalWeight')}</Label>
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
                  <span className={bmiColor(currentBmi)}>
                    {t('onboarding.bmiCurrent', { bmi: currentBmi })} ({t(`onboarding.${bmiCategoryKey(currentBmi)}`)})
                  </span>
                )}
                {goalBmi && (
                  <span className={bmiColor(goalBmi)}>
                    {t('onboarding.bmiGoal', { bmi: goalBmi })} ({t(`onboarding.${bmiCategoryKey(goalBmi)}`)})
                  </span>
                )}
              </div>
            )}
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
