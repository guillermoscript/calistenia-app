import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/utils'

interface WeekdayBarsChartProps {
  /** 7, índice 0 = lunes. */
  weekdays: number[]
}

/** 7 mini-barras de sesiones por día de la semana; la mayor resaltada en lima. */
export default function WeekdayBarsChart({ weekdays }: WeekdayBarsChartProps) {
  const { t } = useTranslation()
  const initials = t('stats.weekdayInitials').split(',')
  const max = Math.max(...weekdays, 1)
  const maxValue = Math.max(...weekdays)

  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-2">{t('stats.weekdays')}</div>
      <div className="flex items-end gap-1.5 h-16 px-1">
        {weekdays.map((n, i) => {
          const height = n > 0 ? Math.max((n / max) * 100, 6) : 0
          const isMax = n > 0 && n === maxValue
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex-1 flex items-end">
                <div
                  className={cn('w-full rounded-t-sm transition-all duration-300', isMax ? 'bg-lime' : n > 0 ? 'bg-lime/20' : 'bg-muted')}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className={cn('text-[9px] font-mono', isMax ? 'text-lime' : 'text-muted-foreground')}>
                {initials[i] ?? ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
