import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { PHASE_COLORS } from '../../lib/style-tokens'
import type { BodyPhoto } from '../../hooks/useBodyPhotos'

interface PhotoRevealAnimationProps {
  before?: BodyPhoto
  after: BodyPhoto
  phaseBefore: number
  phaseAfter: number
  onDismiss: () => void
}

export default function PhotoRevealAnimation({
  before, after, phaseBefore, phaseAfter, onDismiss,
}: PhotoRevealAnimationProps) {
  const { t } = useTranslation()
  const [stage, setStage] = useState<'enter' | 'before' | 'crossfade' | 'after'>('enter')
  const colorsAfter = PHASE_COLORS[phaseAfter]

  useEffect(() => {
    if (!before) {
      // No before photo — just show scale-in and auto-dismiss
      setStage('after')
      const timer = setTimeout(onDismiss, 2500)
      return () => clearTimeout(timer)
    }

    // Sequence: enter → before (1s) → crossfade (1.5s) → after (2s) → dismiss
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setStage('before'), 100))
    timers.push(setTimeout(() => setStage('crossfade'), 1200))
    timers.push(setTimeout(() => setStage('after'), 2700))
    timers.push(setTimeout(onDismiss, 5000))
    return () => timers.forEach(clearTimeout)
  }, [before, onDismiss])

  return (
    <div
      onClick={onDismiss}
      className={cn(
        'fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center cursor-pointer',
        'animate-[fade-in_0.3s_ease-out]',
      )}
    >
      {/* Title */}
      <div className={cn(
        'text-center mb-6 transition-all duration-500',
        stage === 'enter' ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0',
      )}>
        <div className="font-bebas text-3xl text-white mb-1">
          {t('progress.phasePhotos.revealTitle')}
        </div>
      </div>

      {/* Photo container */}
      <div className="relative w-[280px] aspect-[3/4] rounded-xl overflow-hidden shadow-2xl">
        {before ? (
          <>
            {/* Before photo */}
            <img
              src={before.url}
              alt=""
              className={cn(
                'absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out',
                stage === 'crossfade' || stage === 'after' ? 'opacity-0' : 'opacity-100',
              )}
            />
            {/* After photo */}
            <img
              src={after.url}
              alt=""
              className={cn(
                'absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out',
                stage === 'crossfade' || stage === 'after' ? 'opacity-100' : 'opacity-0',
              )}
            />
          </>
        ) : (
          /* First checkpoint — scale-in */
          <img
            src={after.url}
            alt=""
            className="w-full h-full object-cover animate-[scale-in_0.6s_cubic-bezier(0.16,1,0.3,1)]"
          />
        )}

        {/* Phase label overlay */}
        {before && (
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
            <div className={cn(
              'font-bebas text-xl transition-all duration-700',
              stage === 'after' || stage === 'crossfade'
                ? colorsAfter.text
                : 'text-white/80',
            )}>
              {stage === 'after' || stage === 'crossfade'
                ? t('progress.phasePhotos.phase', { phase: phaseAfter })
                : t('progress.phasePhotos.phase', { phase: phaseBefore })
              }
            </div>
          </div>
        )}
      </div>

      {/* Tap to dismiss */}
      <div className={cn(
        'mt-6 text-[11px] text-white/40 tracking-wider transition-opacity duration-1000',
        stage === 'enter' ? 'opacity-0' : 'opacity-100',
      )}>
        {t('progress.phasePhotos.tapToDismiss')}
      </div>
    </div>
  )
}
