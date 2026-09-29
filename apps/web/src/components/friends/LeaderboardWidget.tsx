import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'
import { RANK_MEDALS } from '@calistenia/core/lib/challenges'

interface LeaderboardWidgetProps {
  entries: LeaderboardEntry[]
  onNavigate: () => void
  /** Cabecera; por defecto «Ranking semanal». */
  title?: string
  /** Mi fila cuando quedo fuera de los 3 primeros, con mi puesto real. */
  me?: (LeaderboardEntry & { position: number }) | null
}

export default function LeaderboardWidget({ entries, onNavigate, title, me }: LeaderboardWidgetProps) {
  const { t } = useTranslation()
  if (entries.length === 0) return null

  const rows = entries.slice(0, 3).map((entry, i) => ({ entry, position: i + 1 }))
  if (me) rows.push({ entry: me, position: me.position })

  return (
    <button
      onClick={onNavigate}
      className="text-left w-full p-4 bg-card border border-border rounded-xl border-l-[3px] border-l-amber-400 hover:border-amber-400/50 transition-colors"
    >
      <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">{title ?? t('widgets.weeklyRanking')}</div>
      <div className="flex flex-col gap-2">
        {rows.map(({ entry, position }) => (
          <div
            key={entry.userId}
            className={cn(
              'flex items-center gap-2.5',
              entry.isCurrentUser && 'text-lime',
            )}
          >
            <span className="text-sm w-6 text-center shrink-0">
              {RANK_MEDALS[position - 1] || `${position}`}
            </span>
            <span className={cn('text-sm flex-1 min-w-0 truncate', entry.isCurrentUser ? 'font-medium' : 'text-muted-foreground')}>
              {entry.displayName}
              {entry.isCurrentUser && <span className="text-xs opacity-60 ml-1">{t('leaderboard.you')}</span>}
            </span>
            <span className={cn('font-bebas text-xl', entry.isCurrentUser ? 'text-lime' : 'text-foreground')}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </button>
  )
}
