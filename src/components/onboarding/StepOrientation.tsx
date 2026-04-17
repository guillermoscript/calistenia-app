import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

interface Props {
  onFinish: () => void
  onBack: () => void
}

export function StepOrientation({ onFinish, onBack }: Props) {
  const { t } = useTranslation()

  const HOW_IT_WORKS = [
    { step: 1, label: t('onboarding.step1Label'), desc: t('onboarding.step1Desc'), accent: 'text-[hsl(var(--lime))]', bg: 'bg-[hsl(var(--lime))]/10' },
    { step: 2, label: t('onboarding.step2Label'), desc: t('onboarding.step2Desc'), accent: 'text-sky-400', bg: 'bg-sky-400/10' },
    { step: 3, label: t('onboarding.step3Label'), desc: t('onboarding.step3Desc'), accent: 'text-amber-400', bg: 'bg-amber-400/10' },
  ]

  const EXTRAS = [
    { icon: '🍽️', label: t('onboarding.nutritionExtra'), desc: t('onboarding.nutritionExtraDesc') },
    { icon: '🏃', label: t('onboarding.cardioExtra'), desc: t('onboarding.cardioExtraDesc') },
    { icon: '👥', label: t('onboarding.socialExtra'), desc: t('onboarding.socialExtraDesc') },
  ]

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.howItWorksTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.dailyRoutine')}</div>
      </div>

      <div className="space-y-3 mb-6">
        {HOW_IT_WORKS.map((item) => (
          <div key={item.step} className="flex items-start gap-3">
            <div className={cn('size-8 rounded-full flex items-center justify-center shrink-0 font-bebas text-lg', item.bg, item.accent)}>
              {item.step}
            </div>
            <div className="pt-0.5">
              <div className={cn('font-medium text-sm', item.accent)}>{item.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4 mb-6">
        <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">{t('onboarding.alsoCanDo')}</div>
        <div className="grid grid-cols-3 gap-2">
          {EXTRAS.map((extra) => (
            <div key={extra.label} className="text-center p-2.5 rounded-lg bg-card border border-border">
              <div className="text-lg mb-1">{extra.icon}</div>
              <div className="text-[11px] font-medium">{extra.label}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5 leading-snug">{extra.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <Button
        onClick={onFinish}
        className="w-full h-12 font-bebas text-xl tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
      >
        {t('onboarding.goTrain')}
      </Button>

      <button
        onClick={onBack}
        className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        {t('onboarding.backToProgram')}
      </button>
    </div>
  )
}
