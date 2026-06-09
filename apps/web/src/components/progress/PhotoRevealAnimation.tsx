import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { PHASE_COLORS } from '../../lib/style-tokens'
import type { BodyPhoto } from '../../hooks/useBodyPhotos'

const FALLBACK_COLORS = PHASE_COLORS[1]

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
  const [stage, setStage] = useState<'enter' | 'before' | 'crossfade' | 'after' | 'success'>('enter')
  const colorsAfter = PHASE_COLORS[phaseAfter] ?? FALLBACK_COLORS

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const dismiss = useCallback(() => onDismiss(), [onDismiss])

  // Keyboard dismiss (Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dismiss])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    if (prefersReducedMotion) {
      setStage('success')
      timers.push(setTimeout(dismiss, 3000))
      return () => timers.forEach(clearTimeout)
    }

    if (!before) {
      setStage('after')
      timers.push(setTimeout(() => setStage('success'), 800))
      timers.push(setTimeout(dismiss, 4000))
    } else {
      timers.push(setTimeout(() => setStage('before'), 100))
      timers.push(setTimeout(() => setStage('crossfade'), 1200))
      timers.push(setTimeout(() => setStage('after'), 2700))
      timers.push(setTimeout(() => setStage('success'), 3200))
      timers.push(setTimeout(dismiss, 6000))
    }

    return () => timers.forEach(clearTimeout)
  }, [before, dismiss, prefersReducedMotion])

  const isRevealed = stage === 'crossfade' || stage === 'after' || stage === 'success'

  return (
    <div
      role="dialog"
      aria-label={t('progress.phasePhotos.savedTitle', { defaultValue: 'Checkpoint guardado' })}
      onClick={dismiss}
      className={cn(
        'fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center cursor-pointer px-4',
        'animate-[fade-in_0.3s_ease-out]',
      )}
    >
      {/* Title */}
      <div className={cn(
        'text-center mb-6 transition-[opacity,transform] duration-500',
        stage === 'enter' ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0',
      )}>
        <div className="font-bebas text-2xl sm:text-3xl text-white mb-1">
          {stage === 'success'
            ? t('progress.phasePhotos.savedTitle', { defaultValue: 'Checkpoint guardado' })
            : t('progress.phasePhotos.revealTitle')}
        </div>
      </div>

      {/* Photo container */}
      <div className="relative w-full max-w-[280px] aspect-[3/4] rounded-xl overflow-hidden shadow-2xl">
        {before ? (
          <>
            <img
              src={before.url}
              alt={t('progress.phasePhotos.phase', { phase: phaseBefore })}
              className={cn(
                'absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out',
                isRevealed ? 'opacity-0' : 'opacity-100',
              )}
            />
            <img
              src={after.url}
              alt={t('progress.phasePhotos.phase', { phase: phaseAfter })}
              className={cn(
                'absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out',
                isRevealed ? 'opacity-100' : 'opacity-0',
              )}
            />
          </>
        ) : (
          <img
            src={after.url}
            alt={t('progress.phasePhotos.phase', { phase: phaseAfter })}
            className={cn(
              'w-full h-full object-cover',
              !prefersReducedMotion && 'animate-[scale-in_0.6s_cubic-bezier(0.16,1,0.3,1)]',
            )}
          />
        )}

        {/* Success check overlay */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-500',
          stage === 'success' ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}>
          <div
            className={cn(
              'size-16 sm:size-20 rounded-full bg-lime-500 flex items-center justify-center',
              stage === 'success' ? 'animate-[scale-in_0.4s_cubic-bezier(0.16,1,0.3,1)]' : 'scale-0',
            )}
          >
            <svg className="size-8 sm:size-10 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline
                points="20 6 9 17 4 12"
                strokeDasharray="24"
                strokeDashoffset={stage === 'success' ? '0' : '24'}
                style={{ transition: 'stroke-dashoffset 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.2s' }}
              />
            </svg>
          </div>
        </div>

        {/* Phase label overlay */}
        <div className="absolute bottom-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-t from-black/70 to-transparent">
          <div className={cn(
            'font-bebas text-lg sm:text-xl transition-colors duration-700',
            isRevealed ? colorsAfter.text : before ? 'text-white/80' : colorsAfter.text,
          )}>
            {before && !isRevealed
              ? t('progress.phasePhotos.phase', { phase: phaseBefore })
              : t('progress.phasePhotos.phase', { phase: phaseAfter })
            }
          </div>
        </div>
      </div>

      {/* Success message */}
      <div className={cn(
        'mt-4 text-center transition-[opacity,transform] duration-500 max-w-xs px-2',
        stage === 'success' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      )}>
        <div className="text-sm text-white/70">
          {!before
            ? t('progress.phasePhotos.firstCheckpoint', { defaultValue: 'Primer checkpoint registrado. Vas a ver tu progreso fase a fase.' })
            : t('progress.phasePhotos.comparisonSaved', { defaultValue: 'Tu progreso queda registrado.' })}
        </div>
      </div>

      {/* Tap to dismiss */}
      <div className={cn(
        'mt-4 text-[11px] text-white/40 tracking-wider transition-opacity duration-1000',
        stage === 'enter' ? 'opacity-0' : 'opacity-100',
      )}>
        {t('progress.phasePhotos.tapToDismiss')}
      </div>
    </div>
  )
}
