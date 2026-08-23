import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { describeFeedItem } from '@calistenia/core/lib/feed-item'
import type { FeedItem } from '@calistenia/core/types'
import { timeAgoShort } from '@calistenia/core/lib/dateUtils'

interface ActivityFeedWidgetProps {
  items: FeedItem[]
  /** "Ver todo" → muro completo. */
  onNavigate: () => void
  /** Fila → detalle de esa actividad. */
  onOpenSession: (item: FeedItem) => void
  /** Nombre/avatar → perfil del autor. */
  onOpenUser: (userId: string) => void
}

/**
 * Resumen de las últimas tres actividades de los seguidos.
 *
 * Decía "<nombre> completó <título>" para TODO, así que una carrera de un amigo
 * se leía como "Ana completó Carrera" y un reto como "Ana completó 100
 * flexiones al día". Ahora la frase la pone `describeFeedItem`, la misma que el
 * muro y la app nativa, y cada tipo dice lo suyo.
 */
export default function ActivityFeedWidget({ items, onNavigate, onOpenSession, onOpenUser }: ActivityFeedWidgetProps) {
  const { t } = useTranslation()
  if (items.length === 0) return null

  const recent = items.slice(0, 3)

  return (
    <div className="p-4 bg-card border border-border rounded-xl border-l-[3px] border-l-sky-500">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('widgets.recentActivity')}</div>
        <button
          onClick={onNavigate}
          className="text-[10px] text-muted-foreground hover:text-lime transition-colors shrink-0"
        >
          {t('dashboard.seeAll')}
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {recent.map(item => {
          const view = describeFeedItem(item)
          return (
            // La fila entera abre la actividad; el nombre se superpone para ir al
            // perfil. Overlay en vez de anidar botones (HTML inválido).
            <div key={item.id} className="relative flex items-center gap-2.5 -mx-1.5 px-1.5 py-1 rounded-md hover:bg-muted/40 transition-colors">
              <button
                onClick={() => onOpenSession(item)}
                aria-label={`${item.displayName} · ${view.title}`}
                className="absolute inset-0 rounded-md"
              />
              <button
                onClick={() => onOpenUser(item.userId)}
                aria-label={item.displayName}
                className="relative size-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-foreground shrink-0 overflow-hidden hover:ring-2 hover:ring-lime/30 transition-all"
              >
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  item.displayName[0]?.toUpperCase() || '?'
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] truncate">
                  <button
                    onClick={() => onOpenUser(item.userId)}
                    className="relative font-medium hover:text-lime transition-colors"
                  >
                    {item.displayName}
                  </button>
                  <span className="text-muted-foreground"> {view.verb} </span>
                  <span className={cn('font-medium', view.accent.text)}>{view.title}</span>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgoShort(item.completedAt)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
