import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import i18n from '../lib/i18n'
import { useNotificationsContext } from '../contexts/NotificationsContext'
import type { AppNotification } from '../hooks/useNotifications'
import { cn } from '../lib/utils'
import { Loader } from '../components/ui/loader'
import { Button } from '../components/ui/button'

function relativeTime(dateStr: string, t: TFunction): string {
  const now = Date.now()
  const then = new Date(dateStr.replace(' ', 'T')).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return t('feed.now')
  if (diffMin < 60) return t('feed.minutesAgo', { count: diffMin })
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return t('feed.hoursAgo', { count: diffH })
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return t('common.yesterday')
  if (diffD <= 7) return t('common.daysAgo', { count: diffD })
  return new Date(dateStr.replace(' ', 'T')).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
}

function getNotificationMessage(n: AppNotification, t: TFunction): string {
  switch (n.type) {
    case 'follow':
      return t('notif.follow', { name: n.actorName })
    case 'reaction':
      return t('notif.reaction', { name: n.actorName, emoji: n.data?.emoji || '' })
    case 'comment':
      return t('notif.comment', { name: n.actorName })
    case 'comment_reply':
      return t('notif.commentReply', { name: n.actorName })
    case 'challenge_invite':
      return t('notif.challengeInvite', { name: n.actorName })
    case 'challenge_join':
      return t('notif.challengeJoin', { name: n.actorName })
    case 'challenge_complete':
      return t('notif.challengeComplete', { title: n.data?.challengeTitle || '' })
    case 'achievement':
      return `${n.data?.achievementIcon || '🏅'} ${t('notif.achievement', { name: n.data?.achievementName || t('notif.anAchievement') })}`
    case 'streak':
      return t('notif.streak', { days: n.data?.days || '' })
    default:
      return t('notif.default', { name: n.actorName })
  }
}

function getNotificationRoute(n: AppNotification): string {
  switch (n.type) {
    case 'follow':
      return `/u/${n.actorId}`
    case 'reaction':
    case 'comment':
    case 'comment_reply':
      return '/feed'
    case 'challenge_invite':
    case 'challenge_join':
    case 'challenge_complete':
      return `/challenges/${n.referenceId}`
    case 'achievement':
      return '/profile'
    case 'streak':
      return '/progress'
    default:
      return '/'
  }
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    notifications,
    loading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationsContext()

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const handleTap = (n: AppNotification) => {
    if (!n.read) {
      markAsRead(n.id)
    }
    navigate(getNotificationRoute(n))
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('notif.section')}</div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-bebas text-4xl md:text-5xl">{t('notif.title')}</h1>
        {notifications.some(n => !n.read) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t('notif.markAllRead')}
          </Button>
        )}
      </div>

      {loading && (
        <Loader label={t('notif.loading')} className="py-12" />
      )}

      {!loading && notifications.length === 0 && (
        <div className="text-center py-16 motion-safe:animate-scale-in">
          <div className="text-3xl mb-3">
            <svg className="size-10 mx-auto text-muted-foreground/40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v2.5L2 10.5v1h12v-1l-1.5-2V6c0-2.5-2-4.5-4.5-4.5z" />
              <path d="M6 12.5a2 2 0 0 0 4 0" />
            </svg>
          </div>
          <div className="text-sm text-muted-foreground mb-1">{t('notif.empty')}</div>
          <div className="text-xs text-muted-foreground">{t('notif.emptyHint')}</div>
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {notifications.map((n, i) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleTap(n)}
              className={cn(
                'w-full text-left rounded-lg px-4 py-3 transition-colors motion-safe:animate-fade-in',
                n.read
                  ? 'bg-card hover:bg-accent/50'
                  : 'bg-lime-400/5 border-l-2 border-lime-400 hover:bg-lime-400/10',
              )}
              style={{ animationDelay: `${Math.min(i, 15) * 40}ms`, animationFillMode: 'both' }}
            >
              <div className="flex items-start gap-3">
                {/* Actor avatar */}
                <div className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-semibold text-foreground shrink-0 mt-0.5">
                  {n.actorName?.[0]?.toUpperCase() ?? '?'}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'text-sm leading-snug',
                    n.read ? 'text-muted-foreground' : 'text-foreground',
                  )}>
                    {getNotificationMessage(n, t)}
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {relativeTime(n.created, t)}
                  </div>
                </div>
                {/* Unread dot */}
                {!n.read && (
                  <div className="size-2 rounded-full bg-lime-400 shrink-0 mt-2" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
