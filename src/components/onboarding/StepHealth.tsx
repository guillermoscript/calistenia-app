import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'

export const CONDITION_IDS = ['heart', 'hypertension', 'diabetes', 'asthma', 'joint', 'back', 'other'] as const
export const INJURY_IDS = ['shoulder', 'wrist', 'elbow', 'knee', 'ankle', 'lower_back', 'other'] as const

export type ConditionId = typeof CONDITION_IDS[number]
export type InjuryId = typeof INJURY_IDS[number]

export interface HealthValues {
  medical_conditions: ConditionId[]
  injuries: InjuryId[]
}

interface Props {
  values: HealthValues
  onChange: (next: HealthValues) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkipAsNone: () => void  // "No issues" shortcut: clears both arrays and advances
}

export function StepHealth({ values, onChange, saving, onBack, onContinue, onSkipAsNone }: Props) {
  const { t } = useTranslation()

  const toggleCondition = (id: ConditionId) => {
    const next = values.medical_conditions.includes(id)
      ? values.medical_conditions.filter(c => c !== id)
      : [...values.medical_conditions, id]
    onChange({ ...values, medical_conditions: next })
  }
  const toggleInjury = (id: InjuryId) => {
    const next = values.injuries.includes(id)
      ? values.injuries.filter(i => i !== id)
      : [...values.injuries, id]
    onChange({ ...values, injuries: next })
  }

  const Chip = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'px-3 py-1.5 rounded-full border text-xs transition-colors',
        active
          ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.healthTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.healthDesc')}</div>
      </div>

      {/* Prominent "No issues" shortcut — most users tap this and move on */}
      <Button
        onClick={onSkipAsNone}
        disabled={saving}
        variant="outline"
        className="w-full h-12 mb-4 border-2 border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 font-bebas text-base tracking-wide"
      >
        ✓ {t('onboarding.noIssuesLabel')}
      </Button>

      <Card className="mb-4">
        <CardContent className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.medicalConditions')}</Label>
            <div className="flex flex-wrap gap-2">
              {CONDITION_IDS.map(id => (
                <Chip
                  key={id}
                  active={values.medical_conditions.includes(id)}
                  label={t(`onboarding.conditions.${id}`)}
                  onClick={() => toggleCondition(id)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.injuriesLabel')}</Label>
            <div className="flex flex-wrap gap-2">
              {INJURY_IDS.map(id => (
                <Chip
                  key={id}
                  active={values.injuries.includes(id)}
                  label={t(`onboarding.injuries.${id}`)}
                  onClick={() => toggleInjury(id)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground leading-snug mb-4 px-2">
        {t('onboarding.healthDisclaimer')}
      </p>

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
    </div>
  )
}
