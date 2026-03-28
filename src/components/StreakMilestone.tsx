import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from './ui/button'
import { shareContent } from '../lib/share'

const MILESTONES = [7, 14, 30, 60, 100] as const

const MILESTONE_KEY_PREFIX = 'calistenia_streak_milestone'

function milestoneKey(days: number, userId: string): string {
  return `${MILESTONE_KEY_PREFIX}_${days}_${userId}`
}

export function isMilestoneShown(days: number, userId: string): boolean {
  return localStorage.getItem(milestoneKey(days, userId)) === 'true'
}

export function markMilestoneShown(days: number, userId: string): void {
  localStorage.setItem(milestoneKey(days, userId), 'true')
}

/** Find the highest reached milestone that hasn't been shown yet */
export function getActiveMilestone(streak: number, userId: string): number | null {
  return [...MILESTONES].reverse().find(m => streak >= m && !isMilestoneShown(m, userId)) ?? null
}

interface StreakMilestoneProps {
  streak: number
  userId: string
  userName: string
  referralCode?: string | null
  onDismiss: () => void
}

export default function StreakMilestone({ streak, userId, userName, referralCode, onDismiss }: StreakMilestoneProps) {
  const { t } = useTranslation()

  const subtitleKey = `streak.milestone.subtitle${streak}` as const

  const handleShare = useCallback(async () => {
    await shareContent({
      title: t('streak.milestone.title', { days: streak }),
      text: t('streak.milestone.shareText', { days: streak }),
      url: referralCode ? `https://gym.guille.tech/invite/${referralCode}` : window.location.origin,
    })
  }, [streak, t, referralCode])

  const handleDismiss = useCallback(() => {
    markMilestoneShown(streak, userId)
    onDismiss()
  }, [streak, userId, onDismiss])

  return (
    <div
      className="relative border-l-4 border-lime bg-card rounded-lg p-4 mb-5 shadow-sm"
      style={{ animation: 'fadeUp 0.4s ease-out both' }}
    >
      <style>{`
        @keyframes fadeUp {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="text-2xl flex-shrink-0">🔥</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-foreground text-sm">
            {t('streak.milestone.title', { days: streak })}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t(subtitleKey)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="mt-3 text-[10px] font-mono tracking-wider border-lime/25 text-lime hover:bg-lime/10 h-8"
          >
            {t('streak.milestone.share')}
          </Button>
        </div>
      </div>
    </div>
  )
}
