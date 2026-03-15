import { useMemo } from 'react'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import type { ProgressMap, Settings, ExerciseLog } from '../../types'

interface ProgressSummaryProps {
  progress: ProgressMap
  settings: Settings
}

export default function ProgressSummary({ progress, settings }: ProgressSummaryProps) {
  const stats = useMemo(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Current week (Mon-Sun)
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)

    const thisWeekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      thisWeekDates.push(d.toISOString().split('T')[0])
    }

    // Previous week
    const prevMonday = new Date(monday)
    prevMonday.setDate(monday.getDate() - 7)
    const prevWeekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(prevMonday)
      d.setDate(prevMonday.getDate() + i)
      prevWeekDates.push(d.toISOString().split('T')[0])
    }

    // Current month
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const monthEnd = nextMonth.toISOString().split('T')[0]

    // Previous month
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevMonthStartStr = prevMonthStart.toISOString().split('T')[0]

    const doneKeys = Object.keys(progress).filter(k => k.startsWith('done_'))

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
        return !!log.exerciseId && !!log.sets && thisWeekDates.includes(log.date)
      })
      .reduce((acc, log) => acc + log.sets.length, 0)

    return {
      sessionsThisWeek,
      sessionsPrevWeek,
      sessionsThisMonth,
      sessionsPrevMonth,
      setsThisWeek,
      weeklyGoal: settings.weeklyGoal || 5,
    }
  }, [progress, settings])

  const weekDiff = stats.sessionsThisWeek - stats.sessionsPrevWeek
  const monthDiff = stats.sessionsThisMonth - stats.sessionsPrevMonth

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <Card>
        <CardContent className="p-5">
          <div className={cn('font-bebas text-[40px] leading-none', 'text-lime')}>
            {stats.sessionsThisWeek}
            <span className="text-lg text-muted-foreground">/{stats.weeklyGoal}</span>
          </div>
          <div className="text-[10px] text-muted-foreground tracking-[1.5px] mt-1 uppercase">Sesiones esta semana</div>
          {weekDiff !== 0 && (
            <div className={cn('text-[11px] mt-1', weekDiff > 0 ? 'text-emerald-500' : 'text-red-400')}>
              {weekDiff > 0 ? '+' : ''}{weekDiff} vs semana anterior
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className={cn('font-bebas text-[40px] leading-none', 'text-sky-500')}>
            {stats.sessionsThisMonth}
          </div>
          <div className="text-[10px] text-muted-foreground tracking-[1.5px] mt-1 uppercase">Sesiones este mes</div>
          {monthDiff !== 0 && (
            <div className={cn('text-[11px] mt-1', monthDiff > 0 ? 'text-emerald-500' : 'text-red-400')}>
              {monthDiff > 0 ? '+' : ''}{monthDiff} vs mes anterior
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className={cn('font-bebas text-[40px] leading-none', 'text-amber-400')}>
            {stats.setsThisWeek}
          </div>
          <div className="text-[10px] text-muted-foreground tracking-[1.5px] mt-1 uppercase">Series esta semana</div>
        </CardContent>
      </Card>
    </div>
  )
}
