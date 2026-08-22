import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { localDay } from '@calistenia/core/lib/dateUtils'
import { DAY_BY_INDEX, nextTrainingDay } from '@calistenia/core/lib/training-day'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { WeekDay, ProgramMeta } from '@calistenia/core/types'

interface TodayWorkoutHeroProps {
  weekDays: WeekDay[]
  phase: number
  activeProgram: ProgramMeta | null
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  today_str: string
  onStart: (dayId: string) => void
}

export default function TodayWorkoutHero({
  weekDays, phase, activeProgram, isWorkoutDone, today_str, onStart,
}: TodayWorkoutHeroProps) {
  const { t } = useTranslation()

  const todayDayId = DAY_BY_INDEX[localDay()]
  const todayDay = weekDays.find(d => d.id === todayDayId)
  const todayIsRest = todayDay?.type === 'rest'
  // #574: en descanso el héroe era un callejón sin salida; ofrece el próximo entreno.
  const nextDayId = todayIsRest ? nextTrainingDay(weekDays, todayDayId) : null
  const nextDay = nextDayId ? weekDays.find(d => d.id === nextDayId) : undefined
  const restClickable = todayIsRest && !!nextDay
  const todayIsCardio = todayDay?.type === 'cardio'
  const todayIsYoga = todayDay?.type === 'yoga'
  const todayWorkoutKey = `p${phase || 1}_${todayDayId}`
  const todayDone = isWorkoutDone(todayWorkoutKey, today_str)

  return (
    <div
      className={cn(
        'mb-6 p-5 rounded-xl border-2 transition-all',
        todayDone
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : todayIsYoga
            ? 'border-purple-400/30 bg-purple-400/5 cursor-pointer hover:border-purple-400/50 active:scale-[0.99]'
            : todayIsCardio
              ? 'border-emerald-400/30 bg-emerald-400/5 cursor-pointer hover:border-emerald-400/50 active:scale-[0.99]'
              : todayIsRest
                ? cn('border-border bg-card', restClickable && 'cursor-pointer hover:border-foreground/30 active:scale-[0.99]')
                : 'border-[hsl(var(--lime))]/30 bg-[hsl(var(--lime))]/5 cursor-pointer hover:border-[hsl(var(--lime))]/50 active:scale-[0.99]',
      )}
      onClick={() => {
        if (todayDone) return
        if (todayIsYoga) onStart(todayDayId)
        else if (todayIsCardio) onStart(todayDayId)
        else if (!todayIsRest) onStart(todayDayId)
        else if (nextDayId) onStart(nextDayId)
      }}
      role={(!todayIsRest || restClickable) && !todayDone ? 'button' : undefined}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">
            {todayDone ? t('dashboard.todayWorkout') : todayIsYoga ? t('dashboard.todayYoga') : todayIsCardio ? t('dashboard.todayCardio') : todayIsRest ? t('dashboard.todayRest') : t('dashboard.todayWorkout')}
          </div>
          <div className="font-bebas text-2xl md:text-3xl leading-none">
            {todayDone ? (
              <span className="text-emerald-500">{t('dashboard.completed')}</span>
            ) : todayIsYoga ? (
              <span className="text-purple-400">{t('dashboard.yoga')}</span>
            ) : todayIsCardio ? (
              <span className="text-emerald-400">{t(`cardio.${todayDay?.cardioConfig?.activityType || 'running'}`)}</span>
            ) : todayIsRest ? (
              <span className="text-muted-foreground">{t('dashboard.restDay')}</span>
            ) : (
              <span className="text-[hsl(var(--lime))]">{todayDay?.focusKey ? t(todayDay.focusKey) : todayDay?.focus || t('dashboard.train')}</span>
            )}
          </div>
          {activeProgram && (
            <div className="text-xs text-muted-foreground mt-1">
              {activeProgram.name} · {t('workout.phaseLabel', { phase: phase || 1 })}
            </div>
          )}
          {restClickable && nextDay && (
            <div className="text-xs text-[hsl(var(--lime))] mt-2">
              {t('dashboard.seeNextWorkout', { day: nextDay.nameKey ? t(nextDay.nameKey) : nextDay.name })} →
            </div>
          )}
        </div>
        {todayDone ? (
          <div className="size-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <svg className="size-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        ) : todayIsYoga ? (
          <div className="size-12 rounded-full bg-purple-400/10 flex items-center justify-center shrink-0">
            <span className="text-2xl">🧘</span>
          </div>
        ) : todayIsCardio ? (
          <div className="text-3xl shrink-0">{CARDIO_ACTIVITY[todayDay?.cardioConfig?.activityType || 'running']?.icon || '🏃'}</div>
        ) : todayIsRest ? (
          <div className="text-3xl shrink-0">😴</div>
        ) : (
          <div className="size-12 rounded-full bg-[hsl(var(--lime))]/10 flex items-center justify-center shrink-0">
            <svg className="size-6 text-[hsl(var(--lime))]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
