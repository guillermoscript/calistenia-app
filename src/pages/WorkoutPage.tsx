import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { WEEK_DAYS as FALLBACK_WEEK_DAYS, PHASES as FALLBACK_PHASES, getWorkout as fallbackGetWorkout } from '../data/workouts'
import { calculateWorkoutDuration } from '../lib/duration'
import ExerciseCard from '../components/ExerciseCard'
import RestTimer from '../components/RestTimer'
import SessionView from '../components/SessionView'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import type { Settings, Phase, WeekDay, DayId, DayType, Workout, ExerciseLog, SetData } from '../types'

// Day type → semantic color classes
const DAY_TYPE: Record<DayType, { badge: string; border: string }> = {
  push:   { badge: 'border-lime/60 text-lime bg-lime/5',          border: 'border-l-lime' },
  pull:   { badge: 'border-sky-500/60 text-sky-600 bg-sky-500/5', border: 'border-l-sky-500' },
  lumbar: { badge: 'border-red-500/60 text-red-500 bg-red-500/5', border: 'border-l-red-500' },
  legs:   { badge: 'border-pink-500/60 text-pink-500 bg-pink-500/5', border: 'border-l-pink-500' },
  full:   { badge: 'border-amber-400/60 text-amber-500 bg-amber-400/5', border: 'border-l-amber-400' },
  rest:   { badge: 'border-border text-muted-foreground bg-transparent', border: 'border-l-border' },
}

interface WorkoutPageProps {
  settings: Settings
  onLogSet: (exerciseId: string, workoutKey: string, setData: Partial<SetData>) => Promise<void>
  onMarkDone: (workoutKey: string, note?: string) => Promise<void>
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  phases: Phase[]
  weekDays: WeekDay[]
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null
  onGoToDashboard: () => void
}

type ViewMode = 'list' | 'session'

export default function WorkoutPage({
  settings, onLogSet, onMarkDone, isWorkoutDone, getExerciseLogs,
  phases: phasesProp, weekDays: weekDaysProp, getWorkout: getWorkoutProp,
  onGoToDashboard,
}: WorkoutPageProps) {
  const PHASES    = phasesProp    || FALLBACK_PHASES
  const WEEK_DAYS = weekDaysProp  || FALLBACK_WEEK_DAYS
  const getWorkout = getWorkoutProp || fallbackGetWorkout

  const [selectedPhase, setSelectedPhase] = useState(settings?.phase || 1)
  const [selectedDay,   setSelectedDay]   = useState<DayId | null>(null)
  const [restTime,      setRestTime]      = useState<number | null>(null)
  const [viewMode,      setViewMode]      = useState<ViewMode>('list')

  useEffect(() => { if (settings?.phase) setSelectedPhase(settings.phase) }, [settings])

  useEffect(() => {
    setViewMode('list')
    setRestTime(null)
  }, [selectedDay])

  const todayId  = (['dom','lun','mar','mie','jue','vie','sab'] as const)[new Date().getDay()]
  const workout  = selectedDay ? getWorkout(selectedPhase, selectedDay) : null
  const workoutDuration = useMemo(() => {
    if (!workout) return 0
    return calculateWorkoutDuration(workout.exercises)
  }, [workout])
  const workoutKey = selectedDay ? `p${selectedPhase}_${selectedDay}` : null
  const isDone   = workoutKey ? isWorkoutDone(workoutKey) : false

  if (viewMode === 'session' && workout) {
    return (
      <SessionView
        workout={workout}
        workoutKey={workoutKey!}
        onLogSet={onLogSet}
        onMarkDone={onMarkDone}
        onGoToDashboard={onGoToDashboard}
        onExitSession={() => setViewMode('list')}
        getExerciseLogs={getExerciseLogs}
      />
    )
  }

  const selectedDayType = WEEK_DAYS.find(d => d.id === selectedDay)?.type

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 md:px-6 md:py-8">

      {/* Phase Selector */}
      <div id="tour-phase-selector" className="mb-7">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">Fase Activa</div>
        <div className="relative md:overflow-visible"
          style={{ maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)' }}
        >
          <div className="[&:has(>*:last-child:not([data-overflow]))]:mask-none flex gap-2 overflow-x-auto pb-1 flex-nowrap scrollbar-none md:flex-wrap md:overflow-visible md:pb-0 md:[mask-image:none] md:[webkit-mask-image:none]">
            {PHASES.map(p => {
              const isSelected = selectedPhase === p.id
              const pa = ({ 1: 'border-lime text-lime', 2: 'border-sky-500 text-sky-500', 3: 'border-pink-500 text-pink-500', 4: 'border-amber-400 text-amber-400' } as Record<number, string>)[p.id] || ''
              return (
                <Button
                  key={p.id}
                  variant={isSelected ? 'outline' : 'ghost'}
                  size="sm"
                  onClick={() => { setSelectedPhase(p.id); setSelectedDay(null) }}
                  className={cn(
                    'whitespace-nowrap text-[11px] tracking-wide transition-all duration-200 shrink-0',
                    isSelected ? cn(pa, 'bg-accent/50') : 'text-muted-foreground'
                  )}
                >
                  F{p.id} — {p.name}
                </Button>
              )
            })}
            {/* Spacer so last item isn't eaten by the fade */}
            <div className="w-6 shrink-0 md:hidden" aria-hidden />
          </div>
        </div>
      </div>

      {/* Day Selector */}
      <div id="tour-day-selector" className="mb-7">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">Día de Entrenamiento</div>
        {/* Mobile: horizontal scroll strip with fade — Desktop: 7-col grid */}
        <div className="relative md:overflow-visible"
          style={{ maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)' }}
        >
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory md:grid md:grid-cols-7 md:overflow-visible md:pb-0 md:[mask-image:none]">
            {WEEK_DAYS.map(day => {
              const done    = isWorkoutDone(`p${selectedPhase}_${day.id}`)
            const isToday = day.id === todayId
            const isRest  = day.type === 'rest'
            const isSelected = selectedDay === day.id
            return (
              <button
                key={day.id}
                onClick={() => !isRest && setSelectedDay(day.id === selectedDay ? null : day.id)}
                disabled={isRest}
                className={cn(
                  'relative rounded-md border text-center transition-all duration-200',
                  'snap-start shrink-0 w-[52px] min-h-[64px] py-2.5 px-1',
                  'md:w-auto md:min-h-[72px] md:py-3 md:px-1.5',
                  isSelected
                    ? 'border-foreground/50 bg-accent/50 text-foreground'
                    : isToday
                      ? 'border-lime/30 bg-lime/5 text-lime'
                      : 'border-border text-muted-foreground',
                  isRest && 'opacity-40 cursor-default'
                )}
              >
                {done    && <div className="absolute top-[3px] right-[3px] size-1.5 rounded-full bg-emerald-500" />}
                {isToday && <div className="absolute top-[3px] left-[3px] size-1 rounded-full bg-lime opacity-80" />}
                <div className="text-[9px] tracking-[2px] mb-1 font-mono">{day.name.slice(0,3).toUpperCase()}</div>
                <div className="text-[9px] leading-tight hidden md:block">{day.focus}</div>
                {/* Mobile: show just type icon */}
                <div className="text-[8px] leading-tight md:hidden text-current opacity-70">
                  {isRest ? '—' : done ? '✓' : day.focus.split(' ')[0].slice(0,4)}
                </div>
              </button>
            )
          })}
          {/* Spacer so last item isn't clipped by the fade mask */}
          <div className="w-6 shrink-0 md:hidden" aria-hidden />
        </div>
        </div>
        {!selectedDay && (
          <div className="mt-2.5 text-[12px] text-muted-foreground italic">
            Selecciona un día. Punto verde = hoy ({WEEK_DAYS.find(d => d.id === todayId)?.name}).
          </div>
        )}
      </div>

      {/* Workout Content */}
      {workout ? (
        <div>
          {/* Workout header */}
          <div id="tour-workout-header" className={cn(
            'p-4 md:px-6 md:py-5 bg-card rounded-xl border border-border mb-5 border-l-4',
            DAY_TYPE[selectedDayType as DayType]?.border || 'border-l-border'
          )}>
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center md:flex-wrap">
              <div>
                <div className="text-[10px] text-muted-foreground tracking-[2px] mb-1 uppercase">
                  Fase {selectedPhase} · {WEEK_DAYS.find(d => d.id === selectedDay)?.name.toUpperCase()} · {workout.exercises.length} ejercicios{workoutDuration > 0 ? ` · ~${workoutDuration} min` : ''}
                </div>
                <div className="font-bebas text-[26px] md:text-[32px] leading-none">{workout.title}</div>
              </div>
              <div className="flex gap-2.5 flex-wrap w-full md:w-auto">
                {!isDone && (
                  <Button
                    id="tour-start-session"
                    onClick={() => setViewMode('session')}
                    className="w-full md:w-auto font-bebas text-xl tracking-wide bg-lime text-lime-foreground hover:bg-lime/90"
                  >
                    ▶ EMPEZAR
                  </Button>
                )}
                {isDone && (
                  <div className="px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-600 dark:text-emerald-400 font-bebas text-lg">
                    ✓ COMPLETADO HOY
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Exercise cards */}
          <div className="flex flex-col gap-3">
            {workout.exercises.map(ex => (
              <ExerciseCard key={ex.id} exercise={ex} workoutKey={workoutKey!}
                onLogSet={onLogSet} onStartRest={(s: number) => setRestTime(s)} logs={getExerciseLogs(ex.id)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 px-5 text-muted-foreground">
          <div className="text-5xl mb-4">💪</div>
          <div className="font-bebas text-3xl mb-2">Selecciona un día</div>
          <div className="text-sm">Elige el día de la semana para ver tu entrenamiento</div>
        </div>
      )}

      {restTime && <RestTimer seconds={restTime} onDone={() => setRestTime(null)} />}
    </div>
  )
}
