import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, type AppNotification } from '../hooks/useNotifications'
import { cn } from '../lib/utils'
import { Loader } from '../components/ui/loader'
import { Button } from '../components/ui/button'

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr.replace(' ', 'T')).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Ayer'
  if (diffD <= 7) return `Hace ${diffD} dias`
  return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function getNotificationMessage(n: AppNotification): string {
  switch (n.type) {
    case 'follow':
      return `${n.actorName} te empezo a seguir`
    case 'reaction':
      return `${n.actorName} reacciono ${n.data?.emoji || ''} a tu sesion`
    case 'comment':
      return `${n.actorName} comento en tu sesion`
    case 'comment_reply':
      return `${n.actorName} respondio a tu comentario`
    case 'challenge_invite':
      return `${n.actorName} te invito a un desafio`
    default:
      return `${n.actorName} interactuo contigo`
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
      return `/challenges/${n.referenceId}`
    default:
      return '/'
  }
}

interface NotificationsPageProps {
  userId: string
}

export default function NotificationsPage({ userId }: NotificationsPageProps) {
  const navigate = useNavigate()
  const {
    notifications,
    loading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications(userId)

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
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Social</div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-bebas text-4xl md:text-5xl">NOTIFICACIONES</h1>
        {notifications.some(n => !n.read) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Marcar todas como leidas
          </Button>
        )}
      </div>

      {loading && (
        <Loader label="Cargando notificaciones..." className="py-12" />
      )}

      {!loading && notifications.length === 0 && (
        <div className="text-center py-16 motion-safe:animate-scale-in">
          <div className="text-3xl mb-3">
            <svg className="size-10 mx-auto text-muted-foreground/40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v2.5L2 10.5v1h12v-1l-1.5-2V6c0-2.5-2-4.5-4.5-4.5z" />
              <path d="M6 12.5a2 2 0 0 0 4 0" />
            </svg>
          </div>
          <div className="text-sm text-muted-foreground mb-1">Sin notificaciones</div>
          <div className="text-xs text-muted-foreground">Cuando alguien interactue contigo, aparecera aqui</div>
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
                    {getNotificationMessage(n)}
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {relativeTime(n.created)}
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
