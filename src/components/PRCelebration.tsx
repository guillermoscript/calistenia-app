import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import PRShareCard from './PRShareCard'
import type { PREvent } from '../hooks/useProgress'

const PR_KEY_NAMES: Record<string, string> = {
  pr_pullups: 'Pull-ups',
  pr_pushups: 'Push-ups',
  pr_lsit: 'L-Sit',
  pr_pistol: 'Pistol Squat',
  pr_handstand: 'Handstand',
}

interface PRCelebrationProps {
  prEvent: PREvent
  userName?: string
  avatarUrl?: string | null
  referralCode?: string | null
  onDismiss: () => void
}

export default function PRCelebration({ prEvent, userName, avatarUrl, referralCode, onDismiss }: PRCelebrationProps) {
  const { t } = useTranslation()
  const [showShareCard, setShowShareCard] = useState(false)

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const exerciseName = PR_KEY_NAMES[prEvent.prKey] || prEvent.exerciseId

  const handleShareClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowShareCard(true)
  }, [])

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
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
              <span className="ml-1 text-muted-foreground/70">{t('pr.reps', { count: prEvent.newValue })}</span>
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
              variant="outline"
              size="sm"
              onClick={handleShareClick}
              className="flex-shrink-0 text-[10px] font-mono tracking-wider border-lime/25 text-lime hover:bg-lime/10"
            >
              {t('pr.share')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
