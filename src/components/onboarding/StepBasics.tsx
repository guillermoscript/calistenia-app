import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'

export interface BasicsValues {
  weight: string
  height: string
  age: string
  sex: string
  level: string
  goal: string
}

interface Props {
  values: BasicsValues
  onChange: (next: BasicsValues) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepBasics({ values, onChange, saving, onBack, onContinue, onSkip }: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof BasicsValues>(key: K, v: BasicsValues[K]) =>
    onChange({ ...values, [key]: v })

  const LEVELS = [
    { value: 'principiante', label: t('onboarding.beginner'), desc: t('onboarding.beginnerDesc') },
    { value: 'intermedio', label: t('onboarding.intermediate'), desc: t('onboarding.intermediateDesc') },
    { value: 'avanzado', label: t('onboarding.advanced'), desc: t('onboarding.advancedDesc') },
  ]
  const SEX_OPTIONS = [
    { value: 'male', label: t('onboarding.male') },
    { value: 'female', label: t('onboarding.female') },
  ]

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.aboutYou')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.aboutYouDesc')}</div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-weight" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.weight')}</Label>
              <Input id="ob-weight" type="number" step="0.1" min="0" placeholder="75"
                value={values.weight} onChange={(e) => set('weight', e.target.value)} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-height" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.height')}</Label>
              <Input id="ob-height" type="number" min="0" placeholder="175"
                value={values.height} onChange={(e) => set('height', e.target.value)} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-age" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.age')}</Label>
              <Input id="ob-age" type="number" min="13" max="99" placeholder="28"
                value={values.age} onChange={(e) => set('age', e.target.value)} className="h-10" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.sex')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {SEX_OPTIONS.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set('sex', s.value)}
                  aria-pressed={values.sex === s.value}
                  className={cn(
                    'h-10 rounded-md border text-sm transition-colors',
                    values.sex === s.value
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.level')}</Label>
            <div className="flex flex-col gap-2">
              {LEVELS.map(l => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => set('level', l.value)}
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
