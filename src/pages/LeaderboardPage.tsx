import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLeaderboard, type LeaderboardCategory, type LeaderboardEntry } from '../hooks/useLeaderboard'
import { cn } from '../lib/utils'
import { op } from '../lib/analytics'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'

type TimeFilter = 'week' | 'month'

const MEDALS = ['', '', '']

interface LeaderboardPageProps {
  userId: string
}

export default function LeaderboardPage({ userId }: LeaderboardPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { entries, loading, error, load } = useLeaderboard(userId)

  const CATEGORIES: { id: LeaderboardCategory; label: string; unit: string; hasTimeFilter: boolean }[] = [
    { id: 'sessions_week', label: t('leaderboard.sessions'), unit: '', hasTimeFilter: true },
    { id: 'streak', label: t('leaderboard.streak'), unit: t('leaderboard.streakUnit'), hasTimeFilter: false },
    { id: 'pr_pullups', label: 'Pull-ups', unit: 'reps', hasTimeFilter: false },
    { id: 'pr_pushups', label: 'Push-ups', unit: 'reps', hasTimeFilter: false },
    { id: 'pr_lsit', label: 'L-sit', unit: 's', hasTimeFilter: false },
    { id: 'pr_handstand', label: 'Handstand', unit: 's', hasTimeFilter: false },
  ]
  const [category, setCategory] = useState<LeaderboardCategory>('sessions_week')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')

  useEffect(() => { load(); op.track('leaderboard_viewed') }, [load])

  // Map time filter to actual category for sessions
  const activeCategory: LeaderboardCategory =
    category === 'sessions_week' && timeFilter === 'month' ? 'sessions_month' : category

  const currentEntries = entries[activeCategory] || []
  const catDef = CATEGORIES.find(c => c.id === category)
  const hasAnyFollows = Object.values(entries).some(arr => arr.length > 1)

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('leaderboard.section')}</div>
      <h1 className="font-bebas text-4xl md:text-5xl mb-6">{t('leaderboard.title')}</h1>

      {/* Category pills */}
      <div id="tour-leaderboard-categories" className="flex gap-1.5 flex-wrap mb-4">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            aria-pressed={category === cat.id}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] tracking-wide font-medium transition-all duration-200 border',
              category === cat.id
                ? 'text-lime border-current bg-accent/50'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Time filter for sessions */}
      {catDef?.hasTimeFilter && (
        <div className="flex gap-1.5 mb-6">
          <button
            onClick={() => setTimeFilter('week')}
            aria-pressed={timeFilter === 'week'}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] tracking-wide font-medium transition-all duration-200 border',
              timeFilter === 'week' ? 'text-amber-400 border-current bg-accent/50' : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {t('leaderboard.thisWeek')}
          </button>
          <button
            onClick={() => setTimeFilter('month')}
            aria-pressed={timeFilter === 'month'}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] tracking-wide font-medium transition-all duration-200 border',
              timeFilter === 'month' ? 'text-amber-400 border-current bg-accent/50' : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {t('leaderboard.thisMonth')}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Loader label={t('leaderboard.loading')} className="py-12" />
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-500 py-8 text-center">{error}</div>
      )}

      {/* Empty — not following anyone */}
      {!loading && !error && !hasAnyFollows && (
        <div className="text-center py-16 motion-safe:animate-scale-in">
          <div className="text-3xl mb-3">🏆</div>
          <div className="text-sm text-muted-foreground mb-4">{t('leaderboard.followToSee')}</div>
          <Button onClick={() => navigate('/friends')} className="bg-lime text-lime-foreground hover:bg-lime/90">
            {t('leaderboard.findFriends')}
          </Button>
        </div>
      )}

      {/* Ranking list */}
      {!loading && !error && currentEntries.length > 0 && (
        <div id="tour-leaderboard-list" className="flex flex-col gap-1.5">
          {currentEntries.map((entry, i) => (
            <div
              key={entry.userId}
              className="motion-safe:animate-fade-in"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <RankRow
                entry={entry}
                position={i + 1}
                unit={catDef?.unit || ''}
                onTap={() => navigate(`/u/${entry.userId}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rank Row ─────────────────────────────────────────────────────────────────

interface RankRowProps {
  entry: LeaderboardEntry
  position: number
  unit: string
  onTap: () => void
}

function RankRow({ entry, position, unit, onTap }: RankRowProps) {
  const { t } = useTranslation()
  const medal = MEDALS[position - 1]

  return (
    <button
      onClick={onTap}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors',
        entry.isCurrentUser
          ? 'bg-lime/10 border border-lime/30 border-l-[3px] border-l-lime'
          : 'bg-card border border-border hover:border-lime/20',
      )}
    >
      {/* Position */}
      <div className="w-8 text-center shrink-0">
        {medal ? (
          <span className="text-lg">{medal}</span>
        ) : (
          <span className="text-sm text-muted-foreground font-mono">{position}</span>
        )}
      </div>

      {/* Avatar */}
      {entry.avatarUrl ? (
        <img src={entry.avatarUrl} alt={entry.displayName} className="size-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0">
          {entry.displayName[0]?.toUpperCase() || '?'}
        </div>
      )}

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-medium truncate', entry.isCurrentUser && 'text-lime')}>
          {entry.displayName}
          {entry.isCurrentUser && <span className="text-xs text-muted-foreground ml-1">{t('leaderboard.you')}</span>}
        </div>
      </div>

      {/* Value */}
      <div className="text-right shrink-0">
        <span className={cn('font-bebas text-2xl', entry.isCurrentUser ? 'text-lime' : 'text-foreground')}>
          {entry.value}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>}
      </div>
    </button>
  )
}
