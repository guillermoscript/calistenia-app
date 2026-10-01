import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthState } from '../contexts/AuthContext'
import { useAchievements } from '@calistenia/core/hooks/useAchievements'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import type { AchievementItem } from '@calistenia/core/lib/achievements'
import { Loader } from '../components/ui/loader'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function AchievementCard({ item }: { item: AchievementItem }) {
  const { t } = useTranslation()
  const pct = Math.round((item.progress / item.target) * 100)
  return (
    <li
      data-testid={`achievement-${item.key}`}
      data-unlocked={item.unlocked}
      className={cn(
        'flex items-center gap-4 rounded-xl border bg-card px-4 py-3',
        item.unlocked ? 'border-lime/40' : 'border-border',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full text-2xl',
          item.unlocked ? 'bg-lime/15' : 'bg-muted grayscale opacity-50',
        )}
      >
        {item.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate font-medium">{t(`achievements.${item.key}.name`)}</h2>
          <span className={cn('shrink-0 text-[10px] uppercase tracking-widest', item.unlocked ? 'text-lime' : 'text-muted-foreground')}>
            {item.unlocked ? t('achievements.unlocked') : t('achievements.locked')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t(`achievements.${item.key}.desc`)}</p>
        {item.unlocked ? (
          item.unlockedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('achievements.unlockedOn', { date: utcToLocalDateStr(item.unlockedAt) })}
            </p>
          ) : null
        ) : (
          <div className="mt-2">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={item.target}
              aria-valuenow={item.progress}
            >
              <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(item.metric === 'workouts' ? 'achievements.progressWorkouts' : 'achievements.progressWeeks', {
                done: item.progress,
                target: item.target,
              })}
            </p>
          </div>
        )}
      </div>
    </li>
  )
}

export default function AchievementsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { userId } = useAuthState()
  const { items, unlocked, total, loading, error, refresh } = useAchievements(userId)

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:px-6 md:py-8">
      <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {t('achievements.title')}
      </div>
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground active:scale-95"
          aria-label={t('common.back', { defaultValue: 'Volver' })}
        >
          <BackIcon className="size-4" />
        </button>
        <div>
          <h1 className="font-bebas text-4xl md:text-5xl">{t('achievements.title')}</h1>
          {!loading && !error ? (
            <p className="text-sm text-muted-foreground">{t('achievements.subtitle', { unlocked, total })}</p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Loader label="" className="py-12" />
      ) : error ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <p className="mb-3">{t('achievements.loadError')}</p>
          <Button variant="outline" onClick={() => void refresh()}>{t('achievements.retry')}</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(item => <AchievementCard key={item.key} item={item} />)}
        </ul>
      )}
    </div>
  )
}
