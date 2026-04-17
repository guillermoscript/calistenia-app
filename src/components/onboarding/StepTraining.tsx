import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'

export const FOCUS_AREA_IDS = [
  'full_body', 'upper_body', 'core', 'legs',
  'pull_up', 'handstand', 'planche', 'muscle_up',
] as const

export const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayId = typeof DAY_IDS[number]

export type FocusAreaId = typeof FOCUS_AREA_IDS[number]
export type Intensity = 'light' | 'moderate' | 'intense'

export interface TrainingValues {
  level: string  // principiante | intermedio | avanzado
  focus_areas: FocusAreaId[]
  training_days: DayId[]
  intensity: Intensity | ''
  goal: string
}

interface Props {
  values: TrainingValues
  onChange: (next: TrainingValues) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepTraining({ values, onChange, saving, onBack, onContinue, onSkip }: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof TrainingValues>(key: K, v: TrainingValues[K]) =>
    onChange({ ...values, [key]: v })

  const toggleFocus = (id: FocusAreaId) => {
    const next = values.focus_areas.includes(id)
      ? values.focus_areas.filter(x => x !== id)
      : [...values.focus_areas, id]
    set('focus_areas', next)
  }
  const toggleDay = (id: DayId) => {
    const next = values.training_days.includes(id)
      ? values.training_days.filter(x => x !== id)
      : [...values.training_days, id]
    set('training_days', next)
  }

  const LEVELS = [
    { value: 'principiante', label: t('onboarding.beginner'), desc: t('onboarding.beginnerDesc') },
    { value: 'intermedio', label: t('onboarding.intermediate'), desc: t('onboarding.intermediateDesc') },
    { value: 'avanzado', label: t('onboarding.advanced'), desc: t('onboarding.advancedDesc') },
  ]

  const INTENSITY: { value: Intensity; label: string; desc: string }[] = [
    { value: 'light', label: t('onboarding.intensityLight'), desc: t('onboarding.intensityLightDesc') },
    { value: 'moderate', label: t('onboarding.intensityModerate'), desc: t('onboarding.intensityModerateDesc') },
    { value: 'intense', label: t('onboarding.intensityIntense'), desc: t('onboarding.intensityIntenseDesc') },
  ]

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.trainingTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.trainingDesc')}</div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 flex flex-col gap-5">
          {/* Level */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.level')}</Label>
            <div className="flex flex-col gap-2">
              {LEVELS.map(l => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => set('level', l.value)}
                  aria-pressed={values.level === l.value}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-md border text-left transition-colors',
                    values.level === l.value
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/5'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  <div className={cn(
                    'w-3 h-3 rounded-full border-2 shrink-0',
                    values.level === l.value ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]' : 'border-muted-foreground/40'
                  )} />
                  <div>
                    <p className={cn('text-sm', values.level === l.value ? 'text-[hsl(var(--lime))]' : 'text-foreground')}>{l.label}</p>
                    <p className="text-xs text-muted-foreground">{l.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Focus areas */}
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.focusAreas')}</Label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_AREA_IDS.map(id => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleFocus(id)}
                  aria-pressed={values.focus_areas.includes(id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-xs transition-colors',
                    values.focus_areas.includes(id)
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  {t(`onboarding.focus.${id}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Training days */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.trainingDays')}</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_IDS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={values.training_days.includes(d)}
                  className={cn(
                    'h-10 rounded-md border text-xs font-medium transition-colors',
                    values.training_days.includes(d)
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  {t(`onboarding.days.${d}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Intensity */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.intensity')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {INTENSITY.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('intensity', opt.value)}
                  aria-pressed={values.intensity === opt.value}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-center transition-colors',
                    values.intensity === opt.value
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

          {/* Goal (free text) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ob-goal" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.goal')}</Label>
            <textarea
              id="ob-goal"
              value={values.goal}
              onChange={(e) => set('goal', e.target.value)}
              placeholder={t('onboarding.goalPlaceholder')}
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1 h-11 font-mono text-xs tracking-wide">
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
