import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { PHASE_COLORS } from '../../lib/style-tokens'
import type { FeedItem } from '../../hooks/useActivityFeed'

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr.replace(' ', 'T')).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d`
}

interface ActivityFeedWidgetProps {
  items: FeedItem[]
  onNavigate: () => void
}

export default function ActivityFeedWidget({ items, onNavigate }: ActivityFeedWidgetProps) {
  const { t } = useTranslation()
  if (items.length === 0) return null

  const recent = items.slice(0, 3)

  return (
    <button
      onClick={onNavigate}
      className="text-left w-full p-4 bg-card border border-border rounded-xl border-l-[3px] border-l-sky-500 hover:border-sky-500/50 transition-colors"
    >
      <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">{t('widgets.recentActivity')}</div>
      <div className="flex flex-col gap-2.5">
        {recent.map(item => {
          const phaseColor = PHASE_COLORS[item.phase]
          return (
            <div key={item.id} className="flex items-center gap-2.5">
              <div className="size-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-foreground shrink-0">
                {item.displayName[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] truncate">
                  <span className="font-medium">{item.displayName}</span>
                  <span className="text-muted-foreground"> {t('widgets.completed')} </span>
                  <span className={cn('font-medium', phaseColor?.text || 'text-lime')}>{item.workoutTitle}</span>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(item.completedAt)}</span>
            </div>
          )
        })}
      </div>
    </button>
  )
}
