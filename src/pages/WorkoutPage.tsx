import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { WEEK_DAYS as FALLBACK_WEEK_DAYS, PHASES as FALLBACK_PHASES, getWorkout as fallbackGetWorkout } from '../data/workouts'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import { localDay } from '../lib/dateUtils'
import { useAuthState } from '../contexts/AuthContext'
import { calculateWorkoutDuration } from '../lib/duration'
import ExerciseCard from '../components/ExerciseCard'
import RestTimer from '../components/RestTimer'
import { useRestPreferences } from '../hooks/useRestPreferences'
import { Button } from '../components/ui/button'
import { triggerWorkoutDetailTour } from '../components/AppTour'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { DAY_TYPE_COLORS } from '../lib/style-tokens'
import type { Settings, Phase, WeekDay, DayId, DayType, Workout, ExerciseLog, SetData } from '../types'

export default function WorkoutPage() {
  const { settings, phases: phasesProp, weekDays: weekDaysProp } = useWorkoutState()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, unmarkWorkoutDone, isWorkoutDone, getExerciseLogs, getWorkout: getWorkoutAction } = useWorkoutActions()
  const { startSession } = useActiveSession()
  const { userId, userRole } = useAuthState()
  const navigate = useNavigate()
  const isAdmin = userRole === 'admin' || userRole === 'editor'
  const PHASES    = phasesProp    || FALLBACK_PHASES
  const WEEK_DAYS = weekDaysProp  || FALLBACK_WEEK_DAYS
  const getWorkout = getWorkoutAction || fallbackGetWorkout

  const [searchParams, setSearchParams] = useSearchParams()
  const dayParam = searchParams.get('day') as DayId | null

  const [selectedPhase, setSelectedPhase] = useState(settings?.phase || 1)
  const [selectedDay,   setSelectedDay]   = useState<DayId | null>(dayParam)
  const [restTime,      setRestTime]      = useState<number | null>(null)
  const [restExerciseId, setRestExerciseId] = useState<string | null>(null)
  const { getRestForExercise, setRestForExercise } = useRestPreferences(userId ?? null)

  useEffect(() => { if (settings?.phase) setSelectedPhase(settings.phase) }, [settings])

  // Consume ?day= param on mount, then clean URL
  useEffect(() => {
    if (dayParam && WEEK_DAYS.some(d => d.id === dayParam)) {
      setSelectedDay(dayParam)
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRestTime(null)
  }, [selectedDay])

  const todayId  = (['dom','lun','mar','mie','jue','vie','sab'] as const)[localDay()]
  const workout  = selectedDay ? getWorkout(selectedPhase, selectedDay) : null
  const workoutDuration = useMemo(() => {
    if (!workout) return 0
    return calculateWorkoutDuration(workout.exercises)
  }, [workout])
  const workoutKey = selectedDay ? `p${selectedPhase}_${selectedDay}` : null
  const isDone   = workoutKey ? isWorkoutDone(workoutKey) : false

  // Trigger workout detail tour when a day is selected for the first time
  useEffect(() => {
    if (workout) {
      triggerWorkoutDetailTour(userId)
    }
  }, [!!workout]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartSession = useCallback(() => {
    if (!workout || !workoutKey) return
    startSession(workout, workoutKey, 'program')
    navigate('/session')
  }, [workout, workoutKey, startSession, navigate])

  const selectedDayType = WEEK_DAYS.find(d => d.id === selectedDay)?.type

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 md:px-6 md:py-8">

      {/* Phase Selector */}
      <div id="tour-phase-selector" className="mb-7">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">Fase</div>
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
                aria-pressed={isSelected}
                aria-label={`${day.name} - ${day.focus}${done ? ' - completado' : ''}${isToday ? ' - hoy' : ''}`}
                onClick={() => setSelectedDay(day.id === selectedDay ? null : day.id)}
                className={cn(
                  'relative rounded-md border text-center transition-all duration-200',
                  'snap-start shrink-0 w-[52px] min-h-[64px] py-2.5 px-1',
                  'md:w-auto md:min-h-[72px] md:py-3 md:px-1.5',
                  isSelected
                    ? 'border-foreground/50 bg-accent/50 text-foreground'
                    : isToday
                      ? 'border-lime/30 bg-lime/5 text-lime'
                      : 'border-border text-muted-foreground',
                  isRest && !isSelected && 'opacity-50'
                )}
              >
                {done    && <div className="absolute top-[3px] right-[3px] size-1.5 rounded-full bg-emerald-500" />}
                {isToday && <div className="absolute top-[3px] left-[3px] size-1 rounded-full bg-lime opacity-80" />}
                <div className="text-[10px] tracking-[2px] mb-1 font-mono">{day.name.slice(0,3).toUpperCase()}</div>
                <div className="text-[9px] leading-tight hidden md:block">{day.focus}</div>
                {/* Mobile: show just type icon */}
                <div className="text-[10px] leading-tight md:hidden text-current opacity-70">
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
            Selecciona cualquier día para entrenar. No importa el día real — elige el tipo de entrenamiento que quieras. Punto verde = hoy.
          </div>
        )}
      </div>

      {/* Workout Content */}
      {workout ? (
        <div>
          {/* Workout header */}
          <div id="tour-workout-header" className={cn(
            'p-4 md:px-6 md:py-5 bg-card rounded-xl border border-border mb-5 border-l-4',
            DAY_TYPE_COLORS[selectedDayType as DayType]?.border || 'border-l-border'
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
                    onClick={handleStartSession}
                    className="w-full md:w-auto font-bebas text-xl tracking-wide bg-lime text-lime-foreground hover:bg-lime/90"
                  >
                    ▶ EMPEZAR
                  </Button>
                )}
                {isDone && (
                  <div className="flex gap-2 items-center flex-wrap w-full md:w-auto">
                    <Button
                      onClick={handleStartSession}
                      variant="outline"
                      className="font-bebas text-lg tracking-wide border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                    >
                      ▶ REPETIR
                    </Button>
                    <div className="px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-600 dark:text-emerald-400 font-bebas text-lg flex items-center gap-2">
                      ✓ COMPLETADO HOY
                      <button
                        onClick={() => workoutKey && unmarkWorkoutDone(workoutKey)}
                        className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                        aria-label="Desmarcar completado"
                        title="Desmarcar completado"
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Exercise cards */}
          <div id="tour-exercise-list" className="flex flex-col gap-3">
            {workout.exercises.map((ex, idx) => (
              <div key={ex.id} {...(idx === 0 ? { id: 'tour-first-exercise' } : {})}>
                <ExerciseCard exercise={ex} workoutKey={workoutKey!}
                  onLogSet={onLogSet} onStartRest={(s: number) => { setRestTime(getRestForExercise(ex.id, s)); setRestExerciseId(ex.id) }} logs={getExerciseLogs(ex.id)} isAdmin={isAdmin} isFirst={idx === 0} />
              </div>
            ))}
          </div>
        </div>
      ) : selectedDay && selectedDayType === 'rest' ? (
        <div className="text-center py-16 px-5 text-muted-foreground">
          <div className="text-5xl mb-4">🧘</div>
          <div className="font-bebas text-3xl mb-2">Día de descanso</div>
          <div className="text-sm mb-4">
            {WEEK_DAYS.find(d => d.id === selectedDay)?.focus || 'Descanso'}
          </div>
          <div className="text-xs text-muted-foreground/70">
            Puedes elegir otro día si quieres entrenar — no importa el día real.
          </div>
        </div>
      ) : (
        <div className="text-center py-16 px-5 text-muted-foreground">
          <div className="text-5xl mb-4">💪</div>
          <div className="font-bebas text-3xl mb-2">Elige tu entrenamiento</div>
          <div className="text-sm">Selecciona un día de la semana para ver los ejercicios</div>
        </div>
      )}

      {restTime && <RestTimer seconds={restTime} exerciseId={restExerciseId || undefined} onDone={() => { setRestTime(null); setRestExerciseId(null) }} onAdjust={setRestForExercise} savedRest={restExerciseId ? getRestForExercise(restExerciseId, restTime) : undefined} />}
    </div>
  )
}
