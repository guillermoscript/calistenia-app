import type { WeeklyStat } from '@calistenia/core/lib/training-stats'
import { cn } from '../../../lib/utils'

interface WeeklyBarsChartProps {
  weekly: WeeklyStat[]
}

/** 12 barras verticales de series por semana; etiqueta DD/MM cada 4 barras. */
export default function WeeklyBarsChart({ weekly }: WeeklyBarsChartProps) {
  const maxSets = Math.max(...weekly.map(w => w.sets), 1)
  const lastIdx = weekly.length - 1

  return (
    <div className="flex items-end gap-1.5 h-28 px-1">
      {weekly.map((w, i) => {
        const height = w.sets > 0 ? Math.max((w.sets / maxSets) * 100, 4) : 0
        const isCurrent = i === lastIdx
        const showLabel = i % 4 === 0
        const [, m, d] = w.weekStart.split('-')
        return (
          <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            {w.sets > 0 && (
              <span className={cn('text-[9px] font-mono tabular-nums leading-none', isCurrent ? 'text-lime' : 'text-muted-foreground')}>
                {w.sets}
              </span>
            )}
            <div className="w-full flex-1 flex items-end">
              <div
                className={cn('w-full rounded-t-sm transition-all duration-300', isCurrent ? 'bg-lime' : 'bg-lime/20')}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className={cn('text-[8px] font-mono truncate w-full text-center', isCurrent ? 'text-foreground' : 'text-muted-foreground/60')}>
              {showLabel ? `${d}/${m}` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
