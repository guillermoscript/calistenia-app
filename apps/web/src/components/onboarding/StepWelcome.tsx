import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { DISCOVERY_SOURCES, type DiscoverySourceId } from '@calistenia/core/lib/discovery-source'

interface Props {
  firstName: string
  needsProfile: boolean
  /** «¿Cómo conociste la app?» (#586): null = sin contestar. */
  discoverySource: DiscoverySourceId | null
  onDiscoverySourceChange: (source: DiscoverySourceId | null) => void
  onStart: () => void
  onSkipAll: () => void
}

export function StepWelcome({
  firstName, needsProfile, discoverySource, onDiscoverySourceChange, onStart, onSkipAll,
}: Props) {
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

      {/* Una sola pregunta, opcional, antes del CTA: aquí todavía la contesta
          casi todo el mundo; al final del onboarding llega menos de la mitad. */}
      <div className="mb-6 text-left">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium">{t('onboarding.discoveryTitle')}</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('onboarding.discoveryOptional')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('onboarding.discoveryTitle')}>
          {DISCOVERY_SOURCES.map((option) => {
            const active = discoverySource === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onDiscoverySourceChange(active ? null : option.id)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-colors',
                  active
                    ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                {t(option.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      <Button
        variant="limeSolid"
        onClick={onStart}
        className="w-full h-12 font-bebas text-xl tracking-wide"
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
