import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { todayStr as todayStrFn, toLocalDateStr } from '../../lib/dateUtils'
import { isFreeSession } from '../../lib/progressUtils'
import type { ProgressMap, Settings, ExerciseLog } from '../../types'

interface ProgressSummaryProps {
  progress: ProgressMap
  settings: Settings
  /** Filter stats by session type. Default 'all'. */
  filter?: 'program' | 'free' | 'all'
}

export default function ProgressSummary({ progress, settings, filter = 'all' }: ProgressSummaryProps) {
  const { t } = useTranslation()
  const stats = useMemo(() => {
    const today = new Date()
    const todayStr = todayStrFn()

    // Current week (Mon-Sun)
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)

    const thisWeekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      thisWeekDates.push(toLocalDateStr(d))
    }

    // Previous week
    const prevMonday = new Date(monday)
    prevMonday.setDate(monday.getDate() - 7)
    const prevWeekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(prevMonday)
      d.setDate(prevMonday.getDate() + i)
      prevWeekDates.push(toLocalDateStr(d))
    }

    // Current month
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const monthEnd = toLocalDateStr(nextMonth)

    // Previous month
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevMonthStartStr = toLocalDateStr(prevMonthStart)

    const doneKeys = Object.keys(progress).filter(k => {
      if (!k.startsWith('done_')) return false
      if (filter === 'all') return true
      const wk = k.split('_').slice(2).join('_')
      return filter === 'free' ? isFreeSession(wk) : !isFreeSession(wk)
    })

    const sessionsThisWeek = doneKeys.filter(k =>
      thisWeekDates.some(d => k.includes(d))
    ).length

    const sessionsPrevWeek = doneKeys.filter(k =>
      prevWeekDates.some(d => k.includes(d))
    ).length

    const sessionsThisMonth = doneKeys.filter(k => {
      const date = k.split('_')[1]
      return date >= monthStart && date < monthEnd
    }).length

    const sessionsPrevMonth = doneKeys.filter(k => {
      const date = k.split('_')[1]
      return date >= prevMonthStartStr && date < monthStart
    }).length

    // Total sets this week
    const setsThisWeek = Object.values(progress)
      .filter((v): v is ExerciseLog => {
        const log = v as ExerciseLog
        if (!log.exerciseId || !log.sets || !thisWeekDates.includes(log.date)) return false
        if (filter === 'all') return true
        return filter === 'free' ? isFreeSession(log.workoutKey) : !isFreeSession(log.workoutKey)
      })
      .reduce((acc, log) => acc + log.sets.length, 0)

    // Count free sessions this week (for breakdown display)
    const freeSessionsThisWeek = filter === 'all'
      ? Object.keys(progress).filter(k =>
          k.startsWith('done_') &&
          thisWeekDates.some(d => k.includes(d)) &&
          isFreeSession(k.split('_').slice(2).join('_'))
        ).length
      : 0

    return {
      sessionsThisWeek,
      sessionsPrevWeek,
      sessionsThisMonth,
      sessionsPrevMonth,
      setsThisWeek,
      weeklyGoal: settings.weeklyGoal || 5,
      freeSessionsThisWeek,
    }
  }, [progress, settings, filter])

  const weekDiff = stats.sessionsThisWeek - stats.sessionsPrevWeek
  const monthDiff = stats.sessionsThisMonth - stats.sessionsPrevMonth

  const goalPct = filter !== 'free' ? Math.min((stats.sessionsThisWeek / stats.weeklyGoal) * 100, 100) : 0
  const goalMet = stats.sessionsThisWeek >= stats.weeklyGoal

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <div>
        <div className={cn('font-bebas text-[40px] leading-none', filter === 'free' ? 'text-violet-400' : 'text-lime')}>
          {stats.sessionsThisWeek}
          {filter !== 'free' && <span className="text-lg text-muted-foreground">/{stats.weeklyGoal}</span>}
        </div>
        {filter !== 'free' && (
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2 max-w-[80px]">
            <div
              className={cn('h-full rounded-full transition-all duration-500', goalMet ? 'bg-emerald-500' : 'bg-lime')}
              style={{ width: `${goalPct}%` }}
            />
          </div>
        )}
        <div className="text-[10px] text-muted-foreground tracking-[1.5px] mt-1.5 uppercase">
          {filter === 'free' ? t('progress.summary.freePerWeek') : t('progress.summary.sessionsPerWeek')}
        </div>
        {weekDiff !== 0 && (
          <div className={cn('text-[11px] mt-1 font-medium', weekDiff > 0 ? 'text-emerald-500' : 'text-red-400')}>
            {weekDiff > 0 ? '\u2191' : '\u2193'} {Math.abs(weekDiff)} {t('progress.summary.vsLastWeek')}
          </div>
        )}
      </div>

      <div>
        <div className={cn('font-bebas text-[40px] leading-none', filter === 'free' ? 'text-violet-400' : 'text-foreground')}>
          {stats.sessionsThisMonth}
        </div>
        <div className="text-[10px] text-muted-foreground tracking-[1.5px] mt-1 uppercase">
          {filter === 'free' ? t('progress.summary.freePerMonth') : t('progress.summary.sessionsPerMonth')}
        </div>
        {monthDiff !== 0 && (
          <div className={cn('text-[11px] mt-1 font-medium', monthDiff > 0 ? 'text-emerald-500' : 'text-red-400')}>
            {monthDiff > 0 ? '\u2191' : '\u2193'} {Math.abs(monthDiff)} {t('progress.summary.vsLastMonth')}
          </div>
        )}
      </div>

      <div>
        <div className={cn('font-bebas text-[40px] leading-none', filter === 'free' ? 'text-violet-400' : 'text-foreground')}>
          {stats.setsThisWeek}
        </div>
        <div className="text-[10px] text-muted-foreground tracking-[1.5px] mt-1 uppercase">
          {filter === 'free' ? t('progress.summary.freeSets') : t('progress.summary.setsPerWeek')}
        </div>
      </div>
    </div>
  )
}
