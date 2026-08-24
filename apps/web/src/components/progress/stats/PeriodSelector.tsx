import { useTranslation } from 'react-i18next'
import { STATS_PERIODS, type StatsPeriod } from '@calistenia/core/lib/training-stats'
import { cn } from '../../../lib/utils'

interface PeriodSelectorProps {
  value: StatsPeriod
  onChange: (period: StatsPeriod) => void
}

/** Selector segmentado de periodo, mismo markup que el toggle semana/mes de CardioStats. */
export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-lg" role="tablist" aria-label={t('stats.title')}>
      {STATS_PERIODS.map(period => (
        <button
          key={period}
          role="tab"
          aria-selected={value === period}
          onClick={() => onChange(period)}
          className={cn(
            'flex-1 py-2 rounded-md text-xs font-mono tracking-widest transition-all focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:outline-none',
            value === period ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
          )}
        >
          {t(`stats.period.${period}`)}
        </button>
      ))}
    </div>
  )
}
