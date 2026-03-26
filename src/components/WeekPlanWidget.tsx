import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { localDay } from '../lib/dateUtils'
import { WEEK_DAYS as FALLBACK_WEEK_DAYS } from '../data/workouts'
import { CARDIO_ACTIVITY } from '../lib/style-tokens'
import type { WeekDay } from '../types'

interface WeekPlanWidgetProps {
  selectedPhase: number
  isWorkoutDone: (workoutKey: string) => boolean
  weekDays?: WeekDay[]
}

export default function WeekPlanWidget({ selectedPhase, isWorkoutDone, weekDays: weekDaysProp }: WeekPlanWidgetProps) {
  const navigate = useNavigate()
  const WEEK_DAYS = weekDaysProp || FALLBACK_WEEK_DAYS
  const todayId = (['dom','lun','mar','mie','jue','vie','sab'] as const)[localDay()]

  return (
    <div className="mb-8">
      <div className="font-mono text-[10px] text-muted-foreground tracking-[3px] mb-3">
        SEMANA DE ENTRENAMIENTO — F{selectedPhase}
      </div>
      {/* Mobile: horizontal scroll — Desktop: 7-col grid */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 md:grid md:grid-cols-7 md:overflow-visible md:pb-0 snap-x snap-mandatory">
        {WEEK_DAYS.map(day => {
          const workoutKey = `p${selectedPhase}_${day.id}`
          const done    = day.type !== 'rest' && day.type !== 'cardio' && isWorkoutDone(workoutKey)
          const isToday = day.id === todayId
          const isRest  = day.type === 'rest'
          const isCardio = day.type === 'cardio'

          return (
            <button
              key={day.id}
              onClick={() => !isRest && navigate(isCardio ? `/workout?day=${day.id}` : `/workout?day=${day.id}`)}
              disabled={isRest && !isCardio}
              className={cn(
                'relative rounded-lg border text-center transition-all duration-200',
                'snap-start shrink-0 w-[48px] py-2.5 px-1',
                'md:w-auto md:py-3 md:px-1.5',
                done    && 'border-emerald-500/30 bg-emerald-500/5',
                isCardio && !done && 'border-emerald-400/30 bg-emerald-400/5',
                isToday && !done && !isCardio && 'border-[hsl(var(--lime))]/30 bg-[hsl(var(--lime))]/5',
                !done && !isToday && !isCardio && 'border-border bg-card',
                isRest && !isCardio
                  ? 'opacity-45 cursor-default'
                  : 'cursor-pointer hover:border-[hsl(var(--lime))]/50 hover:bg-[hsl(var(--lime))]/5 active:scale-95',
              )}
            >
              {isToday && (
                <div className="absolute top-[5px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[hsl(var(--lime))]" />
              )}
              <div className={cn(
                'font-mono text-[10px] tracking-[2px] mb-1.5',
                isToday ? 'mt-1.5 text-[hsl(var(--lime))]' : 'text-muted-foreground',
              )}>
                {day.name.slice(0, 3).toUpperCase()}
              </div>
              {isCardio ? (
                <div className="text-lg">{CARDIO_ACTIVITY[day.cardioConfig?.activityType || 'running']?.icon || '🏃'}</div>
              ) : isRest ? (
                <div className="text-base text-muted-foreground">—</div>
              ) : done ? (
                <div className="text-lg text-emerald-400">✓</div>
              ) : (
                <div className={cn(
                  'w-[18px] h-[18px] rounded mx-auto border',
                  isToday ? 'border-[hsl(var(--lime))]/40' : 'border-border',
                )} />
              )}
              <div className={cn(
                'text-[10px] mt-1.5 leading-tight',
                done           ? 'text-emerald-400' :
                isCardio       ? 'text-emerald-400' :
                isToday        ? 'text-[hsl(var(--lime))]' :
                                 'text-muted-foreground/50',
              )}>
                {isCardio ? CARDIO_ACTIVITY[day.cardioConfig?.activityType || 'running']?.label || 'Cardio' : day.focus.split(' ')[0]}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
