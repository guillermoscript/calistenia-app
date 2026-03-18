import { useState, useMemo } from 'react'
import { cn } from '../lib/utils'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import type { ProgressMap, SessionDone } from '../types'

interface CalendarPageProps {
  progress: ProgressMap
  onGoToWorkout: () => void
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  // Monday-based: 0=Mon..6=Sun
  const startOffset = (first.getDay() + 6) % 7
  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= lastDay; d++) days.push(d)
  return days
}

function formatDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function CalendarPage({ progress, onGoToWorkout }: CalendarPageProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate())
  const days = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth])

  // Build a map of date → sessions for this month
  const sessionsByDate = useMemo(() => {
    const map: Record<string, SessionDone[]> = {}
    Object.entries(progress).forEach(([key, val]) => {
      if (!key.startsWith('done_')) return
      const session = val as SessionDone
      if (!session.date) return
      if (!map[session.date]) map[session.date] = []
      map[session.date].push(session)
    })
    return map
  }, [progress])

  const selectedSessions = selectedDate ? sessionsByDate[selectedDate] || [] : []

  // Stats for current month
  const monthStats = useMemo(() => {
    let totalSessions = 0
    let activeDays = 0
    days.forEach(d => {
      if (d === null) return
      const date = formatDate(viewYear, viewMonth, d)
      const count = sessionsByDate[date]?.length || 0
      if (count > 0) { totalSessions += count; activeDays++ }
    })
    return { totalSessions, activeDays }
  }, [days, viewYear, viewMonth, sessionsByDate])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }
  const goToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedDate(todayStr)
  }

  // Workout key to readable title
  const parseWorkoutKey = (key: string) => {
    const [phaseStr, day] = key.split('_')
    const phase = phaseStr.replace('p', '')
    const dayNames: Record<string, string> = {
      lun: 'Lunes', mar: 'Martes', mie: 'Miércoles',
      jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
    }
    return `Fase ${phase} — ${dayNames[day] || day}`
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Planificacion</div>
      <div className="font-bebas text-4xl md:text-5xl mb-6">CALENDARIO</div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="outline" size="sm" onClick={prevMonth} className="h-8 px-3 text-xs">
          ‹
        </Button>
        <div className="text-center">
          <div className="font-bebas text-2xl">{MONTH_NAMES[viewMonth]} {viewYear}</div>
          <div className="text-[10px] text-muted-foreground tracking-widest">
            {monthStats.activeDays} días activos · {monthStats.totalSessions} sesiones
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goToday} className="h-8 px-3 text-[10px] tracking-widest">
            HOY
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth} className="h-8 px-3 text-xs">
            ›
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <Card className="mb-6">
        <CardContent className="p-4 md:p-6">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[10px] text-muted-foreground tracking-widest font-mono">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (d === null) return <div key={`empty-${i}`} />
              const date = formatDate(viewYear, viewMonth, d)
              const sessions = sessionsByDate[date] || []
              const isToday = date === todayStr
              const isSelected = date === selectedDate
              const hasSession = sessions.length > 0
              const isFuture = date > todayStr

              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={cn(
                    'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all text-sm relative',
                    isFuture && 'text-muted-foreground/40',
                    isToday && !isSelected && 'border border-lime/40',
                    isSelected && 'border-2 border-lime bg-lime/10',
                    hasSession && !isSelected && 'bg-lime/15 text-lime',
                    !hasSession && !isToday && !isSelected && 'hover:bg-muted',
                  )}
                >
                  <span className={cn(
                    'font-mono text-[13px]',
                    hasSession && 'font-bold',
                  )}>
                    {d}
                  </span>
                  {hasSession && (
                    <div className="flex gap-0.5">
                      {sessions.slice(0, 3).map((_, j) => (
                        <div key={j} className="size-1 rounded-full bg-lime" />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDate && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </div>
                <div className="text-sm">
                  {selectedSessions.length > 0
                    ? `${selectedSessions.length} sesión${selectedSessions.length > 1 ? 'es' : ''}`
                    : 'Sin entrenamientos'
                  }
                </div>
              </div>
              {selectedDate === todayStr && selectedSessions.length === 0 && (
                <Button
                  onClick={onGoToWorkout}
                  size="sm"
                  className="bg-lime text-lime-foreground hover:bg-lime/90 text-[10px] font-bold tracking-widest"
                >
                  ENTRENAR
                </Button>
              )}
            </div>

            {selectedSessions.length > 0 ? (
              <div className="space-y-2">
                {selectedSessions.map((s, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 bg-muted/30 rounded-lg border border-border"
                  >
                    <div className="text-sm font-medium">{parseWorkoutKey(s.workoutKey)}</div>
                    {s.note && (
                      <div className="text-xs text-muted-foreground mt-1 italic">{s.note}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : selectedDate <= todayStr ? (
              <div className="text-xs text-muted-foreground">Día de descanso o sin registro.</div>
            ) : (
              <div className="text-xs text-muted-foreground">Día futuro — aún sin planificar.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
