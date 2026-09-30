import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { WEEK_DAYS as FALLBACK_WEEK_DAYS, PHASES as FALLBACK_PHASES, getWorkout as fallbackGetWorkout } from '@calistenia/core/data/workouts'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useCircuitSession } from '../contexts/CircuitSessionContext'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import { localDay } from '@calistenia/core/lib/dateUtils'
import { localize } from '@calistenia/core/lib/i18n-db'
import { DAY_BY_INDEX, nextTrainingDay } from '@calistenia/core/lib/training-day'
import { useAuthState } from '../contexts/AuthContext'
import { calculateWorkoutDuration } from '@calistenia/core/lib/duration'
import { plannedSetCount, trackWorkoutDayViewed } from '@calistenia/core/lib/session-funnel'
import ExerciseCard from '../components/ExerciseCard'
import RestTimer from '../components/RestTimer'
import { useRestPreferences } from '@calistenia/core/hooks/useRestPreferences'
import { useUserHealth } from '@calistenia/core/hooks/useUserHealth'
import { Button } from '../components/ui/button'
import TrainHub from '../components/workout/TrainHub'
import { ArrowLeftIcon } from '../components/icons/nav-icons'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { DAY_TYPE_COLORS, CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { Phase, WeekDay, DayId, DayType, Workout, ExerciseLog, SetData, CardioDayConfig, CircuitDefinition } from '@calistenia/core/types'

/**
 * `/workout` (#856): sin `?day` es la pestaña Entrenar (`TrainHub`); con un
 * `?day` válido, la vista del día de siempre. El `?day` se queda en la URL para
 * que el día se pueda compartir, recargar y volver atrás a Entrenar.
 */
export default function WorkoutPage() {
  const { weekDays } = useWorkoutState()
  const [searchParams] = useSearchParams()
  const dayParam = searchParams.get('day') as DayId | null
  const WEEK_DAYS = weekDays || FALLBACK_WEEK_DAYS
  if (dayParam && WEEK_DAYS.some(d => d.id === dayParam)) return <WorkoutDayView dayId={dayParam} />
  return <TrainHub />
}

function WorkoutDayView({ dayId }: { dayId: DayId }) {
  const { phases: phasesProp, weekDays: weekDaysProp, cardioDayConfigs, circuitDayConfigs, activeProgram, programProgress } = useWorkoutState()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, unmarkWorkoutDone, isWorkoutDone, getExerciseLogs, getWorkout: getWorkoutAction } = useWorkoutActions()
  const { startSession } = useActiveSession()
  const { startCircuit } = useCircuitSession()
  const { userId, userRole } = useAuthState()
  // Lesiones desde `user_health` (en `users` el campo es PII oculto y siempre
  // llega vacío al cliente; ver #247).
  const { health } = useUserHealth(userId ?? null)
  const userInjuries = health.injuries
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isAdmin = userRole === 'admin' || userRole === 'editor'
  const PHASES    = phasesProp    || FALLBACK_PHASES
  const WEEK_DAYS = weekDaysProp  || FALLBACK_WEEK_DAYS
  const getWorkout = getWorkoutAction || fallbackGetWorkout

  const [, setSearchParams] = useSearchParams()

  const todayId  = DAY_BY_INDEX[localDay()]

  // #616: la fase ya no sale de `settings.phase` (entero global del usuario)
  // sino del programa activo: derivada de `started_at` + `duration_weeks`, con
  // el override manual en `user_programs.current_phase`. Aquí sigue siendo
  // estado local porque las pestañas de fase son para MIRAR otra fase sin
  // cambiar la tuya; el override se fija desde el dashboard.
  const derivedPhase = programProgress.currentPhase
  const [selectedPhase, setSelectedPhase] = useState(derivedPhase)
  // El día lo manda la URL; cambiarlo reemplaza el `?day` (sin apilar historial).
  const selectedDay: DayId = dayId
  const [restTime,      setRestTime]      = useState<number | null>(null)
  const [restExerciseId, setRestExerciseId] = useState<string | null>(null)
  const { getRestForExercise, setRestForExercise } = useRestPreferences(userId ?? null)

  useEffect(() => { if (derivedPhase >= 1) setSelectedPhase(derivedPhase) }, [derivedPhase])

  const chooseDay = useCallback((id: DayId) => {
    setSearchParams({ day: id }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    setRestTime(null)
  }, [selectedDay])

  const workout  = getWorkout(selectedPhase, selectedDay)
  const workoutDuration = useMemo(() => {
    if (!workout) return 0
    return calculateWorkoutDuration(workout.exercises)
  }, [workout])
  const workoutKey = `p${selectedPhase}_${selectedDay}`
  const isDone   = workoutKey ? isWorkoutDone(workoutKey) : false

  const selectedWeekDay = WEEK_DAYS.find(d => d.id === selectedDay)
  const selectedDayType = selectedWeekDay?.type
  // Config del circuito de ESTA fase. `weekDays[].circuitConfig` es el respaldo:
  // es plano (sin fase), así que solo describe la fase más baja del programa.
  const circuitConfig = selectedDayType === 'circuit' && workoutKey
    ? (circuitDayConfigs[workoutKey] ?? selectedWeekDay?.circuitConfig ?? null)
    : null

  // Denominador del embudo (#636 §3): quién MIRA el día de entreno, para poder
  // medir cuánta gente lo abre y no arranca. Va por `workoutKey` y no por el
  // montaje porque esta pantalla es un selector: cambiar de día no la remonta.
  //
  // Los días de circuito quedan fuera a propósito: llevan su propio ciclo
  // (`circuit_started` / `circuit_completed`) y meterlos aquí mezclaría dos
  // embudos con tasas de finalización distintas.
  useEffect(() => {
    if (!workout || !workoutKey || circuitConfig) return
    trackWorkoutDayViewed({
      workoutKey,
      source: 'program',
      exerciseCount: workout.exercises.length,
      plannedSets: plannedSetCount(workout.exercises),
      alreadyDone: isDone,
    })
    // `isDone` fuera de las deps: marcar el día como hecho al terminar el
    // entreno no es una vista nueva del día.
  }, [workoutKey]) // eslint-disable-line react-hooks/exhaustive-deps -- una vista por día seleccionado

  const handleStartSession = useCallback(() => {
    if (!workout || !workoutKey) return
    startSession(workout, workoutKey, 'program')
    navigate('/session')
  }, [workout, workoutKey, startSession, navigate])

  // `programDayKey` es `p{fase}_{día}`, igual que `workout_key` en `sessions` y
  // que el `program_day_key` del cardio. Hasta #625 se mandaba el día suelto
  // (`"lun"`), formato que no casa con NINGÚN consumidor: ni el marcador
  // `done_` de `progress-map`, ni el prefijo `p{fase}_` de `program-milestone`.
  const handleStartCircuit = useCallback((config: CircuitDefinition) => {
    if (!workoutKey) return
    startCircuit(config, 'program', activeProgram?.id, workoutKey)
    navigate('/circuit/active')
  }, [startCircuit, activeProgram, workoutKey, navigate])

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 md:px-6 md:py-8">

      <Link
        to="/workout"
        className="inline-flex items-center gap-1.5 min-h-11 -mt-2 mb-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeftIcon className="size-4" />
        {t('train.backToTrain')}
      </Link>

      {/* Phase Selector */}
      <div className="mb-7">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">{t('workout.phase')}</div>
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
                  onClick={() => setSelectedPhase(p.id)}
                  className={cn(
                    'whitespace-nowrap text-[11px] tracking-wide transition-all duration-200 shrink-0',
                    isSelected ? cn(pa, 'bg-accent/50') : 'text-muted-foreground'
                  )}
                >
                  F{p.id} — {p.nameKey ? t(p.nameKey) : p.name}
                </Button>
              )
            })}
            {/* Spacer so last item isn't eaten by the fade */}
            <div className="w-6 shrink-0 md:hidden" aria-hidden />
          </div>
        </div>
      </div>

      {/* Day Selector */}
      <div className="mb-7">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">{t('workout.trainingDay')}</div>
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
                aria-label={`${day.nameKey ? t(day.nameKey) : day.name} - ${day.focusKey ? t(day.focusKey) : day.focus}${done ? ` - ${t('dashboard.completed').toLowerCase()}` : ''}${isToday ? ` - ${t('common.today').toLowerCase()}` : ''}`}
                onClick={() => chooseDay(day.id)}
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
                <div className="text-[10px] tracking-[2px] mb-1 font-mono">{((day.nameKey ? t(day.nameKey) : day.name) ?? '').slice(0,3).toUpperCase()}</div>
                <div className="text-[9px] leading-tight hidden md:block">{day.focusKey ? t(day.focusKey) : day.focus}</div>
                {/* Mobile: show just type icon */}
                <div className="text-[10px] leading-tight md:hidden text-current opacity-70">
                  {day.type === 'cardio' ? CARDIO_ACTIVITY[day.cardioConfig?.activityType || 'running']?.icon || '🏃' : isRest ? '—' : done ? '✓' : ((day.focusKey ? t(day.focusKey) : day.focus) ?? '').split(' ')[0].slice(0,4)}
                </div>
              </button>
            )
          })}
          {/* Spacer so last item isn't clipped by the fade mask */}
          <div className="w-6 shrink-0 md:hidden" aria-hidden />
        </div>
        </div>
      </div>

      {/* Workout Content */}
      {/* El circuito se decide ANTES que `workout` a propósito (#625): un día de
          circuito CON ejercicios también genera filas en `program_exercises`, así
          que `getWorkout()` devuelve un `Workout` truthy y preguntando primero por
          él ganaba siempre la pantalla de fuerza — se creaba una sesión normal y
          los seis campos `circuit_*` del día se ignoraban. El tipo del día manda. */}
      {circuitConfig ? (() => {
        const circuitCfg = circuitConfig
        const hasExercises = circuitCfg.exercises.length > 0
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-500">
                  {circuitCfg.mode === 'timed' ? 'HIIT' : t('circuit.modes.circuit')}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('circuit.summary', {
                  rounds: circuitCfg.rounds,
                  exercises: circuitCfg.exercises.length
                })}
              </p>
              {circuitCfg.mode === 'timed' && circuitCfg.workSeconds && (
                <p className="text-xs text-muted-foreground mt-1">
                  {circuitCfg.workSeconds}s {t('circuit.work').toLowerCase()} / {circuitCfg.restSeconds ?? 0}s {t('circuit.rest').toLowerCase()}
                </p>
              )}
            </div>
            {hasExercises && (
              <ul className="rounded-xl border border-border divide-y divide-border">
                {circuitCfg.exercises.map((ex, idx) => (
                  <li key={`${ex.exerciseId}-${idx}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{localize(ex.name, i18n.language)}</span>
                    <span className="text-xs text-muted-foreground">
                      {ex.workSecondsOverride ? `${ex.workSecondsOverride}s` : ex.reps ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              className="w-full"
              disabled={!hasExercises}
              onClick={() => handleStartCircuit(circuitCfg)}
            >
              {t('circuit.startCircuit')}
            </Button>
            {/* Un día de circuito sin ejercicios no tiene nada que ejecutar: el
                botón se deshabilita en vez de abrir un runner vacío. */}
            {!hasExercises && (
              <p className="text-xs text-center text-muted-foreground">{t('circuit.noExercises')}</p>
            )}
          </div>
        )
      })() : workout ? (
        <div>
          {/* Workout header */}
          <div className={cn(
            'p-4 md:px-6 md:py-5 bg-card rounded-xl border border-border mb-5 border-l-4',
            DAY_TYPE_COLORS[selectedDayType as DayType]?.border || 'border-l-border'
          )}>
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center md:flex-wrap">
              <div>
                <div className="text-[10px] text-muted-foreground tracking-[2px] mb-1 uppercase">
                  {t('workout.phaseLabel', { phase: selectedPhase })} · {(() => { const d = WEEK_DAYS.find(d => d.id === selectedDay); return d?.nameKey ? t(d.nameKey) : d?.name ?? '' })().toUpperCase()} · {t('workout.exerciseCount', { count: workout.exercises.length })}{workoutDuration > 0 ? ` · ~${workoutDuration} ${t('common.minutes')}` : ''}
                </div>
                <div className="font-bebas text-[26px] md:text-[32px] leading-none">{workout.title}</div>
                {/* #716: el día ya viene con la mitad de series (`workout.deload`). */}
                {workout.deload && (
                  <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-[hsl(var(--lime))]/15 text-[hsl(var(--lime))] font-mono text-[10px] tracking-widest uppercase">
                      {t('programProgress.deloadWeek')}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{t('programProgress.deloadHint')}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2.5 flex-wrap w-full md:w-auto">
                {!isDone && (
                  <Button
                    data-testid="start-session"
                    onClick={handleStartSession}
                    variant="limeSolid"
                    className="w-full md:w-auto font-bebas text-xl tracking-wide"
                  >
                    {t('workout.startBtn')}
                  </Button>
                )}
                {isDone && (
                  <div className="flex gap-2 items-center flex-wrap w-full md:w-auto">
                    <Button
                      onClick={handleStartSession}
                      variant="outline"
                      className="font-bebas text-lg tracking-wide border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                    >
                      {t('workout.repeatBtn')}
                    </Button>
                    <div className="px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-600 dark:text-emerald-400 font-bebas text-lg flex items-center gap-2">
                      {t('workout.completedToday')}
                      <button
                        onClick={() => workoutKey && unmarkWorkoutDone(workoutKey)}
                        className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                        aria-label={t('workout.unmarkDone')}
                        title={t('workout.unmarkDone')}
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
          <div className="flex flex-col gap-3">
            {workout.exercises.map((ex, idx) => (
              <div key={ex.id}>
                <ExerciseCard exercise={ex} workoutKey={workoutKey!}
                  onLogSet={onLogSet} onStartRest={(s: number) => { setRestTime(getRestForExercise(ex.id, s)); setRestExerciseId(ex.id) }} logs={getExerciseLogs(ex.id)} isAdmin={isAdmin} isFirst={idx === 0} userInjuries={userInjuries} />
              </div>
            ))}
          </div>
        </div>
      ) : selectedDay && selectedDayType === 'cardio' ? (() => {
        const cardioKey = `p${selectedPhase}_${selectedDay}`
        const cardioConfig = cardioDayConfigs[cardioKey]
        const actType = cardioConfig?.activityType || 'running'
        const actInfo = CARDIO_ACTIVITY[actType]
        return (
          <div className="text-center py-12 px-5">
            <div className="text-5xl mb-4">{actInfo?.icon || '🏃'}</div>
            <div className="font-bebas text-3xl mb-2 text-emerald-400">{t('workout.cardioDay')}</div>
            <div className="text-sm text-muted-foreground mb-1">
              {t(`cardio.${actType}`)}
            </div>
            <div className="flex justify-center gap-4 text-sm text-muted-foreground mb-6">
              {cardioConfig?.targetDistanceKm && (
                <span>{t('workout.goal')}: <strong className="text-emerald-400">{cardioConfig.targetDistanceKm} km</strong></span>
              )}
              {cardioConfig?.targetDurationMin && (
                <span>{t('workout.duration')}: <strong className="text-emerald-400">{cardioConfig.targetDurationMin} {t('common.minutes')}</strong></span>
              )}
            </div>
            <Button
              onClick={() => {
                const params = new URLSearchParams()
                params.set('activity', actType)
                if (activeProgram?.id) params.set('program', activeProgram.id)
                if (cardioKey) params.set('dayKey', cardioKey)
                if (cardioConfig?.targetDistanceKm) params.set('targetKm', String(cardioConfig.targetDistanceKm))
                if (cardioConfig?.targetDurationMin) params.set('targetMin', String(cardioConfig.targetDurationMin))
                navigate(`/cardio?${params.toString()}`)
              }}
              className="font-bebas text-xl tracking-wide bg-emerald-500 hover:bg-emerald-400 text-white px-8 h-12"
            >
              {t('workout.startCardio')}
            </Button>
          </div>
        )
      })() : selectedDay && selectedDayType === 'rest' ? (
        <div className="text-center py-16 px-5 text-muted-foreground">
          <div className="text-5xl mb-4">🧘</div>
          <div className="font-bebas text-3xl mb-2">{t('workout.restDay')}</div>
          <div className="text-sm mb-4">
            {(() => { const d = WEEK_DAYS.find(d => d.id === selectedDay); return d?.focusKey ? t(d.focusKey) : d?.focus ?? t('dayType.rest') })()}
          </div>
          <div className="text-xs text-muted-foreground/70">
            {t('workout.restDayHint')}
          </div>
          {(() => {
            // #574: el descanso no puede ser un callejón sin salida.
            const next = nextTrainingDay(WEEK_DAYS, selectedDay)
            const nextDay = next && WEEK_DAYS.find(d => d.id === next)
            if (!nextDay) return null
            return (
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => chooseDay(nextDay.id)}
              >
                {t('workout.trainAnyway', { day: nextDay.nameKey ? t(nextDay.nameKey) : nextDay.name })}
              </Button>
            )
          })()}
        </div>
      ) : (
        <div className="text-center py-16 px-5 text-muted-foreground">
          <div className="text-5xl mb-4">💪</div>
          <div className="font-bebas text-3xl mb-2">{t('workout.chooseWorkout')}</div>
          <div className="text-sm">{t('workout.chooseWorkoutHint')}</div>
        </div>
      )}

      {restTime && <RestTimer seconds={restTime} exerciseId={restExerciseId || undefined} onDone={() => { setRestTime(null); setRestExerciseId(null) }} onAdjust={setRestForExercise} savedRest={restExerciseId ? getRestForExercise(restExerciseId, restTime) : undefined} />}
    </div>
  )
}
