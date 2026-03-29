import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { WeeklyPlanDay } from '../../types'

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

interface Props {
  planDays: WeeklyPlanDay[]
  selectedDayIndex: number
  onSelectDay: (index: number) => void
  todayIndex: number
}

export default function WeeklyPlanHeader({ planDays, selectedDayIndex, onSelectDay, todayIndex }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
      {DAY_KEYS.map((key, i) => {
        const day = planDays.find(d => d.day_index === i)
        const totalCal = day?.meals.reduce((s, m) => s + m.calories, 0) ?? 0
        const allLogged = day ? day.meals.length > 0 && day.meals.every(m => m.logged) : false
        const isSelected = selectedDayIndex === i
        const isToday = todayIndex === i

        return (
          <button
            key={key}
            onClick={() => onSelectDay(i)}
            className={cn(
              'flex-1 min-w-[44px] rounded-lg py-2 px-1 text-center transition-colors',
              isSelected
                ? 'bg-lime-400/15 border border-lime-400/40'
                : 'bg-card border border-border hover:border-lime-400/20',
            )}
          >
            <div className={cn(
              'text-[10px] font-medium uppercase tracking-wider',
              isToday ? 'text-lime-400' : 'text-muted-foreground',
            )}>
              {t(`weekday.short.${key}`)}
            </div>
            <div className={cn(
              'text-xs mt-0.5 font-bebas',
              allLogged ? 'text-emerald-400' : 'text-foreground',
            )}>
              {allLogged ? '✓' : totalCal > 0 ? `${totalCal}` : '—'}
            </div>
          </button>
        )
      })}
    </div>
  )
}
