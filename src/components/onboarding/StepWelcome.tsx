import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

interface Props {
  firstName: string
  needsProfile: boolean
  onStart: () => void
  onSkipAll: () => void
}

export function StepWelcome({ firstName, needsProfile, onStart, onSkipAll }: Props) {
  const { t } = useTranslation()

  return (
    <div className="text-center animate-[fadeUp_0.5s_ease]">
      <div className="font-bebas text-6xl md:text-7xl text-[hsl(var(--lime))] mb-2 leading-none">
        CALISTENIA
      </div>
      <div className="text-muted-foreground text-sm mb-6">
        {firstName ? t('onboarding.welcomeMsg', { name: firstName }) : t('onboarding.welcomeDefault')}
      </div>

      <div className="flex items-center justify-center gap-2 mb-6">
        {[
          { icon: '📋', label: t('onboarding.programLabel') },
          { icon: '→', label: '' },
          { icon: '📅', label: t('onboarding.dayLabel') },
          { icon: '→', label: '' },
          { icon: '💪', label: t('onboarding.exercises') },
          { icon: '→', label: '' },
          { icon: '📈', label: t('onboarding.progress') },
        ].map((item, i) => (
          <div key={i} className="flex flex-col items-center">
            <span className={cn('text-lg', item.label ? '' : 'text-muted-foreground/40 text-sm')}>{item.icon}</span>
            {item.label && <span className="text-[9px] text-muted-foreground mt-0.5">{item.label}</span>}
          </div>
        ))}
      </div>

      <Card className="mb-6 text-left">
        <CardContent className="p-5">
          <div className="text-sm text-muted-foreground leading-relaxed">
            <p className="mb-2">
              <strong className="text-foreground">{t('onboarding.howItWorks')}</strong> {t('onboarding.howItWorksDetail')}
            </p>
            <p className="text-xs">
              {needsProfile ? t('onboarding.needsProfileHint') : t('onboarding.justChooseProgram')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={onStart}
        className="w-full h-12 font-bebas text-xl tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
      >
        {needsProfile ? t('onboarding.startBtn') : t('onboarding.chooseProgramBtn')}
      </Button>

      <button
        onClick={onSkipAll}
        className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {t('onboarding.skipAll')}
      </button>
    </div>
  )
}
