import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useNotificationsContext } from '../contexts/NotificationsContext'
import { useAuthState } from '../contexts/AuthContext'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import type { FollowRequest } from '@calistenia/core/hooks/useFollows'
import type { AppNotification } from '@calistenia/core/hooks/useNotifications'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'
import { timeAgoShort } from '@calistenia/core/lib/dateUtils'
import { cn } from '../lib/utils'
import { Loader } from '../components/ui/loader'
import { EmptyState } from '../components/ui/empty-state'
import { Button } from '../components/ui/button'

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/**
 * `l` localiza los campos i18n que viajan dentro de `data` (#633). El servidor no
 * sabe en qué idioma tiene la app el destinatario, así que guarda el mapa
 * `{es, en}` entero y lo resuelve aquí quien lo pinta.
 */
function getNotificationMessage(
  n: AppNotification,
  t: TFunction,
  l: (field: TranslatableField | undefined | null) => string,
): string {
  switch (n.type) {
    case 'follow':
      return t('notif.follow', { name: n.actorName })
    case 'follow_request':
      return t('notif.followRequest', { name: n.actorName })
    case 'follow_accepted':
      return t('notif.followAccepted', { name: n.actorName })
    case 'reaction': {
      // Reacción a un comentario vs. a la sesión (el hook marca data.onComment).
      const emoji = n.data?.emoji || ''
      if (n.data?.onComment) {
        const base = t('notif.reactionComment', { name: n.actorName, emoji })
        return n.data?.commentPreview ? `${base}: «${n.data.commentPreview}»` : base
      }
      return t('notif.reaction', { name: n.actorName, emoji })
    }
    case 'comment': {
      const base = t('notif.comment', { name: n.actorName })
      return n.data?.preview ? `${base}: «${n.data.preview}»` : base
    }
    case 'comment_reply': {
      const base = t('notif.commentReply', { name: n.actorName })
      return n.data?.preview ? `${base}: «${n.data.preview}»` : base
    }
    case 'challenge_join':
      return t('notif.challengeJoin', { name: n.actorName })
    case 'challenge_complete':
      return t('notif.challengeComplete', { title: n.data?.challengeTitle || '' })
    case 'achievement':
      return `${n.data?.achievementIcon || '🏅'} ${t('notif.achievement', { name: n.data?.achievementName || t('notif.anAchievement') })}`
    case 'streak':
      return t('notif.streak', { days: n.data?.days || '' })
    case 'referral_signup':
      return t('notif.referralSignup', { name: n.data?.referredName || n.actorName })
    case 'referral_bonus':
      return t('notif.referralBonus', { name: n.data?.referredName || n.actorName })
    case 'friend_streak':
      return t('notif.friendStreak', { name: n.actorName, days: n.data?.days || '' })
    case 'friend_achievement':
      return t('notif.friendAchievement', { name: n.actorName, achievement: n.data?.achievementName || t('notif.anAchievement') })
    case 'friend_workout':
      return t('notif.friendWorkout', { name: n.actorName })
    case 'friend_joined':
      return t('notif.friendJoined', { name: n.actorName })
    case 'program_deleted':
      // El nombre puede venir vacío (programa sin `name`): el copy se sostiene
      // igual, así que no hay fallback que inventar aquí.
      return t('notif.programDeleted', { name: l(n.data?.programName) })
    default:
      return t('notif.default', { name: n.actorName })
  }
}

function getNotificationRoute(n: AppNotification): string {
  switch (n.type) {
    case 'follow':
    case 'follow_request':
    case 'follow_accepted':
      return `/u/${n.actorId}`
    case 'reaction':
    case 'comment':
    case 'comment_reply': {
      // referenceId = id de la sesión (el post) → abrir ese post + resaltarlo.
      // Si apunta a un comentario concreto, pasamos ?comment= para resaltarlo.
      if (!n.referenceId) return '/feed'
      const commentId = n.data?.commentId
      return `/feed?session=${n.referenceId}${commentId ? `&comment=${commentId}` : ''}`
    }
    case 'challenge_join':
    case 'challenge_complete':
      return `/challenges/${n.referenceId}`
    case 'achievement':
      return '/profile'
    case 'streak':
      return '/progress'
    case 'referral_signup':
    case 'referral_bonus':
      return '/referrals'
    case 'friend_streak':
    case 'friend_achievement':
    case 'friend_workout':
    case 'friend_joined':
      return `/u/${n.actorId}`
    case 'program_deleted':
      // `referenceId` guarda el id del programa borrado como rastro, pero NO se
      // navega a él: el registro ya no existe y `/programs/:id` daría un 404.
      // El catálogo es la acción útil que le queda al usuario: buscarse otro.
      return '/programs'
    default:
      return '/'
  }
}

/** Aceptar / rechazar una solicitud de seguimiento (#422). Fuera del botón de
 *  la fila: dos `<button>` no se pueden anidar. */
function RequestActions({ request, onAccept, onReject, t }: {
  request: FollowRequest
  onAccept: (id: string) => Promise<boolean>
  onReject: (id: string) => Promise<boolean>
  t: TFunction
}) {
  const [busy, setBusy] = useState(false)
  const run = async (fn: (id: string) => Promise<boolean>) => {
    setBusy(true)
    await fn(request.id)
    setBusy(false)
  }
  return (
    <div className="flex gap-2 mt-2">
      <Button size="sm" variant="limeSolid" disabled={busy} onClick={() => run(onAccept)} className="h-8 text-[10px] tracking-widest uppercase">
        {t('privacy.accept')}
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(onReject)} className="h-8 text-[10px] tracking-widest uppercase">
        {t('privacy.reject')}
      </Button>
    </div>
  )
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const l = useLocalize()
  const navigate = useNavigate()
  const { user } = useAuthState()
  // Bandeja de solicitudes (#422): la fila de `follows` vive en useFollows;
  // la notificación solo sabe quién la pidió.
  const { pendingIncoming, acceptRequest, rejectRequest } = useFollows(user?.id ?? null)
  const requestByActor = useMemo(
    () => new Map(pendingIncoming.map(r => [r.user.id, r])),
    [pendingIncoming],
  )
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
        <div className="flex items-center gap-1">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings/notifications')}
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label={t('notifSettings.title')}
            title={t('notifSettings.title')}
          >
            <GearIcon className="size-4" />
          </Button>
        </div>
      </div>

      {loading && (
        <Loader label={t('notif.loading')} className="py-12" />
      )}

      {pendingIncoming.length > 0 && (
        <section className="mb-6" aria-label={t('privacy.requestsTitle')}>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('privacy.requestsTitle')}</div>
          <div className="flex flex-col gap-1.5">
            {pendingIncoming.map(r => (
              <div key={r.id} className="rounded-lg px-4 py-3 bg-lime-400/5 border-l-2 border-lime-400">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => navigate(`/u/${r.user.id}`)} className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-semibold text-foreground shrink-0 mt-0.5 overflow-hidden">
                    {r.user.avatarUrl ? <img src={r.user.avatarUrl} alt="" className="size-full object-cover" /> : (r.user.displayName[0]?.toUpperCase() ?? '?')}
                  </button>
                  <div className="flex-1 min-w-0">
                    <button type="button" onClick={() => navigate(`/u/${r.user.id}`)} className="text-sm leading-snug text-foreground text-left">
                      {t('notif.followRequest', { name: r.user.displayName })}
                    </button>
                    <div className="text-[11px] text-muted-foreground/60 mt-0.5">{timeAgoShort(r.created)}</div>
                    <RequestActions request={r} onAccept={acceptRequest} onReject={rejectRequest} t={t} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && notifications.length === 0 && pendingIncoming.length === 0 && (
        <EmptyState
          icon={(
            <svg className="size-10 mx-auto text-muted-foreground/40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v2.5L2 10.5v1h12v-1l-1.5-2V6c0-2.5-2-4.5-4.5-4.5z" />
              <path d="M6 12.5a2 2 0 0 0 4 0" />
            </svg>
          )}
          title={t('notif.empty')}
          hint={t('notif.emptyHint')}
        />
      )}

      {!loading && notifications.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {notifications.map((n, i) => {
            // Solicitud aún sin resolver → la fila lleva aceptar/rechazar.
            const request = n.type === 'follow_request' ? requestByActor.get(n.actorId) : undefined
            return (
            <div
              key={n.id}
              className={cn(
                'w-full rounded-lg motion-safe:animate-fade-in',
                n.read
                  ? 'bg-card hover:bg-accent/50'
                  : 'bg-lime-400/5 border-l-2 border-lime-400 hover:bg-lime-400/10',
              )}
              style={{ animationDelay: `${Math.min(i, 15) * 40}ms`, animationFillMode: 'both' }}
            >
            <button
              type="button"
              onClick={() => handleTap(n)}
              className="w-full text-left px-4 py-3 transition-colors"
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
                    {getNotificationMessage(n, t, l)}
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {timeAgoShort(n.created)}
                  </div>
                </div>
                {/* Unread dot */}
                {!n.read && (
                  <div className="size-2 rounded-full bg-lime-400 shrink-0 mt-2" />
                )}
              </div>
            </button>
            {request && (
              <div className="px-4 pb-3 pl-16">
                <RequestActions request={request} onAccept={acceptRequest} onReject={rejectRequest} t={t} />
              </div>
            )}
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
