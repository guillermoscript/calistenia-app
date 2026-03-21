import { cn } from '../../lib/utils'
import type { LeaderboardEntry } from '../../hooks/useLeaderboard'

const MEDALS = ['', '', '']

interface LeaderboardWidgetProps {
  entries: LeaderboardEntry[]
  onNavigate: () => void
}

export default function LeaderboardWidget({ entries, onNavigate }: LeaderboardWidgetProps) {
  if (entries.length === 0) return null

  const top3 = entries.slice(0, 3)

  return (
    <button
      onClick={onNavigate}
      className="text-left w-full p-4 bg-card border border-border rounded-xl border-l-[3px] border-l-amber-400 hover:border-amber-400/50 transition-colors"
    >
      <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">Ranking semanal</div>
      <div className="flex flex-col gap-2">
        {top3.map((entry, i) => (
          <div
            key={entry.userId}
            className={cn(
              'flex items-center gap-2.5',
              entry.isCurrentUser && 'text-lime',
            )}
          >
            <span className="text-sm w-6 text-center shrink-0">
              {MEDALS[i] || `${i + 1}`}
            </span>
            <span className={cn('text-sm flex-1 min-w-0 truncate', entry.isCurrentUser ? 'font-medium' : 'text-muted-foreground')}>
              {entry.displayName}
              {entry.isCurrentUser && <span className="text-xs opacity-60 ml-1">(tu)</span>}
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
