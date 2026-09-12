import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import PRShareCard from './PRShareCard'
import type { PREvent } from '@calistenia/core/hooks/useProgress'
import { resolveExerciseDisplayName } from '@calistenia/core/lib/exercise-resolver'
import { useSessionIdentity } from '../hooks/useSessionIdentity'

const PR_KEY_NAMES: Record<string, string> = {
  pr_pullups: 'Pull-ups',
  pr_pushups: 'Push-ups',
  pr_lsit: 'L-Sit',
  pr_pistol: 'Pistol Squat',
  pr_handstand: 'Handstand',
}

interface PRCelebrationProps {
  prEvent: PREvent
  /** Nombre ya resuelto del ejercicio (lo conoce quien registró la serie). */
  exerciseName?: string
  /** Ejercicio por tiempo: `newValue` son SEGUNDOS, no repeticiones (#690). */
  isTimer?: boolean
  onDismiss: () => void
}

export default function PRCelebration({ prEvent, exerciseName: exerciseNameProp, isTimer, onDismiss }: PRCelebrationProps) {
  const { t, i18n } = useTranslation()
  // La identidad se lee aquí en lugar de bajarla como props desde la página:
  // el AuthProvider ya está montado por encima (#475).
  const { userName, avatarUrl, referralCode } = useSessionIdentity()
  const [showShareCard, setShowShareCard] = useState(false)

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  // Último peldaño: el catálogo, que traduce un id canónico; una clave de slot
  // («lun_1_9») no resuelve y sale tal cual, pero ese caso ya lo cubre la prop.
  const exerciseName =
    exerciseNameProp ||
    PR_KEY_NAMES[prEvent.prKey] ||
    resolveExerciseDisplayName(undefined, prEvent.exerciseId, i18n.language)

  const handleShareClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowShareCard(true)
  }, [])

  return (
    // a11y: capa de descarte por clic; se auto-cierra sola por temporizador, así
    // que no atrapa a quien navega con teclado. (Sin regla jsx-a11y activa: #484)
    <div
      onClick={onDismiss}
      className="absolute inset-x-0 top-0 z-20 px-4 pt-[calc(12px+env(safe-area-inset-top,0px))]"
      style={{ animation: 'prSlideDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
    >
      <style>{`
        @keyframes prSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes prPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.15); }
        }
      `}</style>

      <div className="bg-card border border-lime/30 rounded-xl p-4 shadow-lg shadow-lime/5">
        <div className="flex items-center gap-3">
          {/* Trophy */}
          <div
            className="text-3xl flex-shrink-0"
            style={{ animation: 'prPulse 0.6s ease-in-out 0.3s 2' }}
          >
            🏆
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-wider text-lime uppercase">
                {t('pr.celebration')}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground truncate">{exerciseName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              <span className="text-muted-foreground/70">{prEvent.oldValue || '—'}</span>
              <span className="mx-1.5 text-lime">→</span>
              <span className="text-lime font-bold">{prEvent.newValue}</span>
              <span className="ml-1 text-muted-foreground/70">
                {prEvent.kind === 'weight'
                  ? `kg × ${prEvent.reps ?? 1}`
                  : isTimer
                    ? t('pr.seconds', { count: prEvent.newValue })
                    : t('pr.reps', { count: prEvent.newValue })}
              </span>
            </div>
          </div>

          {/* Share button */}
          {showShareCard ? (
            <PRShareCard
              prEvent={prEvent}
              exerciseName={exerciseName}
              userName={userName}
              avatarUrl={avatarUrl}
              referralCode={referralCode}
            />
          ) : (
            <Button
              variant="lime"
              size="sm"
              onClick={handleShareClick}
              className="flex-shrink-0 text-[10px] font-mono tracking-wider"
            >
              {t('pr.share')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
