import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'

interface SectionTransitionProps {
  type: 'warmup-to-main' | 'main-to-cooldown'
  onContinue: () => void
  onSkip?: () => void
}

export default function SectionTransition({ type, onContinue, onSkip }: SectionTransitionProps) {
  const { t } = useTranslation()

  const isWarmupDone = type === 'warmup-to-main'

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 gap-7 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-300">
      <style>{`
        @keyframes sectionPop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="size-20 rounded-full bg-muted border border-border flex items-center justify-center text-4xl leading-none"
        style={{ animation: 'sectionPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
      >
        {isWarmupDone ? '✓' : '❄'}
      </div>

      <div className="text-center max-w-[320px]">
        <div className="font-bebas text-3xl tracking-[2px] mb-2 text-foreground">
          {isWarmupDone
            ? t('warmupCooldown.transitions.warmupComplete')
            : t('warmupCooldown.transitions.mainComplete')
          }
        </div>
        <div className="font-mono text-[10px] text-muted-foreground tracking-[2px] uppercase">
          {isWarmupDone
            ? t('warmupCooldown.sections.main')
            : t('warmupCooldown.sections.cooldown')
          }
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        <Button
          onClick={onContinue}
          className="w-full bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-xl tracking-[2px] py-3.5"
        >
          {isWarmupDone
            ? t('warmupCooldown.transitions.start')
            : t('warmupCooldown.transitions.continue')
          }
        </Button>

        {!isWarmupDone && onSkip && (
          <Button
            variant="outline"
            onClick={onSkip}
            className="w-full font-mono text-[11px] tracking-wide text-muted-foreground hover:text-foreground"
          >
            {t('warmupCooldown.skip.cooldown')}
          </Button>
        )}
      </div>
    </div>
  )
}
