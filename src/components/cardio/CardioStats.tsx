import { useState } from 'react'
import { formatPace, formatDuration } from '../../lib/geo'
import type { CardioAggregateStats, PersonalRecords } from '../../hooks/useCardioStats'
import { cn } from '../../lib/utils'

interface CardioStatsProps {
  weeklyStats: CardioAggregateStats
  monthlyStats: CardioAggregateStats
  records: PersonalRecords
}

export default function CardioStats({ weeklyStats, monthlyStats, records }: CardioStatsProps) {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const stats = period === 'week' ? weeklyStats : monthlyStats

  const hasRecords = records.best1km || records.longestDistance || records.bestPace

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg" role="tablist" aria-label="Periodo de estadísticas">
        <button
          role="tab"
          aria-selected={period === 'week'}
          onClick={() => setPeriod('week')}
          className={cn(
            'flex-1 py-2 rounded-md text-xs font-mono tracking-widest transition-all focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:outline-none',
            period === 'week' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
          )}
        >
          ESTA SEMANA
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
          ESTE MES
        </button>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl text-lime tabular-nums">{stats.totalDistance.toFixed(1)}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">KM TOTAL</div>
        </div>
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl tabular-nums">{stats.totalSessions}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">SESIONES</div>
        </div>
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl text-sky-500 tabular-nums">{formatDuration(stats.totalDuration)}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">TIEMPO TOTAL</div>
        </div>
        <div className="text-center p-3 bg-muted/60 rounded-xl">
          <div className="font-bebas text-2xl text-amber-400 tabular-nums">{stats.totalCalories}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">CALORÍAS</div>
        </div>
      </div>

      {/* Personal records */}
      {hasRecords && (
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">
            Marcas Personales
          </div>
          <div className="space-y-2">
            {records.best1km && (
              <RecordRow label="Mejor 1 km" value={formatPace(records.best1km)} unit="min/km" accent="text-lime" />
            )}
            {records.best5km && (
              <RecordRow label="Mejor 5 km" value={formatPace(records.best5km)} unit="min/km" accent="text-lime" />
            )}
            {records.best10km && (
              <RecordRow label="Mejor 10 km" value={formatPace(records.best10km)} unit="min/km" accent="text-lime" />
            )}
            {records.longestDistance && (
              <RecordRow label="Mayor distancia" value={records.longestDistance.toFixed(2)} unit="km" accent="text-sky-500" />
            )}
            {records.highestElevation && (
              <RecordRow label="Mayor desnivel" value={String(records.highestElevation)} unit="m" accent="text-amber-400" />
            )}
            {records.bestPace && (
              <RecordRow label="Mejor ritmo" value={formatPace(records.bestPace)} unit="min/km" accent="text-pink-500" />
            )}
          </div>
        </div>
      )}
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
