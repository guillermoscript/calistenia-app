/**
 * Hito de racha SEMANAL en el inicio (#855, épica #852): 4, 8, 12, 26 y 52
 * semanas seguidas cumpliendo el objetivo (`WEEKLY_STREAK_MILESTONES`, #853).
 * Sustituye al hito de días (7/14/30/60/100). Cada hito se enseña una vez por
 * usuario y dispositivo.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from './ui/button'
import { shareContent } from '../lib/share'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { localizedWebUrl } from '@calistenia/core/lib/app-urls'
import { WEEKLY_STREAK_MILESTONES } from '@calistenia/core/lib/weeklyStreak'

const MILESTONE_KEY_PREFIX = 'calistenia_weekly_milestone'

function milestoneKey(weeks: number, userId: string): string {
  return `${MILESTONE_KEY_PREFIX}_${weeks}_${userId}`
}

function isMilestoneShown(weeks: number, userId: string): boolean {
  try {
    return localStorage.getItem(milestoneKey(weeks, userId)) === 'true'
  } catch {
    return true
  }
}

function markMilestoneShown(weeks: number, userId: string): void {
  try {
    localStorage.setItem(milestoneKey(weeks, userId), 'true')
  } catch {
    // Sin storage se vuelve a enseñar en la próxima visita; no pasa nada.
  }
}

/** El hito más alto alcanzado que aún no se ha enseñado, o `null`. */
export function getActiveWeeklyMilestone(weeks: number, userId: string): number | null {
  const reached = WEEKLY_STREAK_MILESTONES.filter(m => weeks >= m)
  const top = reached[reached.length - 1]
  return top && !isMilestoneShown(top, userId) ? top : null
}

interface StreakMilestoneProps {
  weeks: number
  userId: string
  referralCode?: string | null
  onDismiss: () => void
}

export default function StreakMilestone({ weeks, userId, referralCode, onDismiss }: StreakMilestoneProps) {
  const { t, i18n } = useTranslation()

  const handleShare = useCallback(async () => {
    await shareContent({
      title: t('home.streak.milestone', { count: weeks }),
      text: t('home.streak.milestoneShareText', { count: weeks }),
      url: referralCode ? localizedWebUrl(`/invite/${referralCode}`, i18n.language) : localizedWebUrl('/', i18n.language),
    })
  }, [weeks, t, i18n.language, referralCode])

  const handleDismiss = useCallback(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.streakMilestone, {
      surface: 'streak', source: 'streak_card', weeks,
    })
    markMilestoneShown(weeks, userId)
    onDismiss()
  }, [weeks, userId, onDismiss])

  return (
    <div className="relative rounded-xl border border-lime/40 bg-card p-4 motion-safe:animate-fade-in" role="status">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-1 top-1 flex size-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        aria-label={t('common.close')}
      >
        <X className="size-4" />
      </button>
      <div className="flex flex-col gap-3 pr-10">
        <div className="text-sm font-medium text-foreground">{t('home.streak.milestone', { count: weeks })}</div>
        <Button variant="outline" onClick={handleShare} className="h-11 self-start rounded-[10px] text-[13px]">
          {t('streak.milestone.share')}
        </Button>
      </div>
    </div>
  )
}
