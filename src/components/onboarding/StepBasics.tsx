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
