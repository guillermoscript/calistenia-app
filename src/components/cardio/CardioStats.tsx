import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPace, formatDuration } from '../../lib/geo'
import type { CardioAggregateStats, PersonalRecords, WeeklyTrendPoint } from '../../hooks/useCardioStats'
import { cn } from '../../lib/utils'

interface CardioStatsProps {
  weeklyStats: CardioAggregateStats
  monthlyStats: CardioAggregateStats
  records: PersonalRecords
  weeklyTrend?: WeeklyTrendPoint[]
}

export default function CardioStats({ weeklyStats, monthlyStats, records, weeklyTrend }: CardioStatsProps) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const stats = period === 'week' ? weeklyStats : monthlyStats

  const hasRecords = records.best1km || records.longestDistance || records.bestPace

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg" role="tablist" aria-label={t('cardio.statistics')}>
        <button
          role="tab"
          aria-selected={period === 'week'}
          onClick={() => setPeriod('week')}
          className={cn(
            'flex-1 py-2 rounded-md text-xs font-mono tracking-widest transition-all focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:outline-none',
            period === 'week' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
          )}
        >
          {t('cardio.thisWeek')}
        </button>
        <button
          role="tab"
          aria-selected={period === 'month'}
          onClick={() => setPeriod('month')}
          className={cn(
            'flex-1 py-2 rounded-md text-xs font-mono tracking-widest transition-all focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:outline-none',
            period === 'month' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
          )}
        >
          {t('cardio.thisMonth')}
        </button>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl text-lime tabular-nums">{stats.totalDistance.toFixed(1)}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">{t('cardio.totalKm')}</div>
        </div>
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl tabular-nums">{stats.totalSessions}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">{t('cardio.sessions')}</div>
        </div>
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl text-sky-500 tabular-nums">{formatDuration(stats.totalDuration)}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">{t('cardio.totalTime')}</div>
        </div>
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl text-amber-400 tabular-nums">{stats.totalCalories}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">{t('nutrition.calories').toUpperCase()}</div>
        </div>
      </div>

      {/* Weekly distance trend */}
      {weeklyTrend && weeklyTrend.some(w => w.distance > 0) && (
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">
            {t('cardio.weeklyDistance')}
          </div>
          <WeeklyTrendChart data={weeklyTrend} />
        </div>
      )}

      {/* Personal records */}
      {hasRecords && (
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">
            {t('cardio.personalRecords')}
          </div>
          <div className="space-y-2">
            {records.best1km && (
              <RecordRow label={t('cardio.best1km')} value={formatPace(records.best1km)} unit="min/km" accent="text-lime" />
            )}
            {records.best5km && (
              <RecordRow label={t('cardio.best5km')} value={formatPace(records.best5km)} unit="min/km" accent="text-lime" />
            )}
            {records.best10km && (
              <RecordRow label={t('cardio.best10km')} value={formatPace(records.best10km)} unit="min/km" accent="text-lime" />
            )}
            {records.longestDistance && (
              <RecordRow label={t('cardio.longestDistance')} value={records.longestDistance.toFixed(2)} unit="km" accent="text-sky-500" />
            )}
            {records.highestElevation && (
              <RecordRow label={t('cardio.highestElevation')} value={String(records.highestElevation)} unit="m" accent="text-amber-400" />
            )}
            {records.bestPace && (
              <RecordRow label={t('cardio.bestPace')} value={formatPace(records.bestPace)} unit="min/km" accent="text-pink-500" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function WeeklyTrendChart({ data }: { data: WeeklyTrendPoint[] }) {
  const maxDist = Math.max(...data.map(d => d.distance), 1)
  const currentWeekIdx = data.length - 1

  return (
    <div className="flex items-end gap-1.5 h-28 px-1">
      {data.map((week, i) => {
        const barHeight = maxDist > 0 ? (week.distance / maxDist) * 100 : 0
        const isCurrent = i === currentWeekIdx
        const isEmpty = week.distance === 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            {/* Value label on top */}
            {!isEmpty && (
              <span className={cn(
                'text-[9px] font-mono tabular-nums leading-none',
                isCurrent ? 'text-lime' : 'text-muted-foreground'
              )}>
                {week.distance}
              </span>
            )}
            {/* Bar */}
            <div className="w-full flex-1 flex items-end">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all duration-300',
                  isEmpty ? 'bg-muted/30' : isCurrent ? 'bg-lime' : 'bg-lime/30',
                )}
                style={{ height: isEmpty ? '2px' : `${Math.max(barHeight, 8)}%` }}
              />
            </div>
            {/* Week label */}
            <span className={cn(
              'text-[8px] font-mono truncate w-full text-center',
              isCurrent ? 'text-foreground' : 'text-muted-foreground/60'
            )}>
              {week.weekLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function RecordRow({ label, value, unit, accent }: { label: string; value: string; unit: string; accent: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 rounded-lg">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-bebas text-lg tabular-nums', accent)}>
        {value} <span className="text-xs text-muted-foreground">{unit}</span>
      </span>
    </div>
  )
}
