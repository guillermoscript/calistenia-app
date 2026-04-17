import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { WEEK_DAYS as FALLBACK_WEEK_DAYS, PHASES as FALLBACK_PHASES, getWorkout as fallbackGetWorkout } from '../data/workouts'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useCircuitSession } from '../contexts/CircuitSessionContext'
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
import { DAY_TYPE_COLORS, CARDIO_ACTIVITY } from '../lib/style-tokens'
import type { Settings, Phase, WeekDay, DayId, DayType, Workout, ExerciseLog, SetData, CardioDayConfig, CircuitDefinition } from '../types'

export default function WorkoutPage() {
  const { settings, phases: phasesProp, weekDays: weekDaysProp, cardioDayConfigs, activeProgram } = useWorkoutState()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, unmarkWorkoutDone, isWorkoutDone, getExerciseLogs, getWorkout: getWorkoutAction } = useWorkoutActions()
  const { startSession } = useActiveSession()
  const { startCircuit } = useCircuitSession()
  const { userId, userRole, user } = useAuthState()
  const userInjuries = useMemo(
    () => Array.isArray((user as any)?.injuries) ? (user as any).injuries : [],
    [user],
  )
  const { t } = useTranslation()
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

  const handleStartCircuit = useCallback((config: CircuitDefinition) => {
    startCircuit(config, 'program', activeProgram?.id, `${selectedDay}`)
    navigate('/circuit/active')
  }, [startCircuit, activeProgram, selectedDay, navigate])

  const selectedWeekDay = WEEK_DAYS.find(d => d.id === selectedDay)
  const selectedDayType = selectedWeekDay?.type

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 md:px-6 md:py-8">

      {/* Phase Selector */}
      <div id="tour-phase-selector" className="mb-7">
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
                  onClick={() => { setSelectedPhase(p.id); setSelectedDay(null) }}
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
      <div id="tour-day-selector" className="mb-7">
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
                <div className="text-[10px] tracking-[2px] mb-1 font-mono">{(day.nameKey ? t(day.nameKey) : day.name).slice(0,3).toUpperCase()}</div>
                <div className="text-[9px] leading-tight hidden md:block">{day.focusKey ? t(day.focusKey) : day.focus}</div>
                {/* Mobile: show just type icon */}
                <div className="text-[10px] leading-tight md:hidden text-current opacity-70">
                  {day.type === 'cardio' ? CARDIO_ACTIVITY[day.cardioConfig?.activityType || 'running']?.icon || '🏃' : isRest ? '—' : done ? '✓' : (day.focusKey ? t(day.focusKey) : day.focus).split(' ')[0].slice(0,4)}
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
            {t('workout.selectDayHint')}
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
                  {t('workout.phaseLabel', { phase: selectedPhase })} · {(() => { const d = WEEK_DAYS.find(d => d.id === selectedDay); return d?.nameKey ? t(d.nameKey) : d?.name ?? '' })().toUpperCase()} · {t('workout.exerciseCount', { count: workout.exercises.length })}{workoutDuration > 0 ? ` · ~${workoutDuration} ${t('common.minutes')}` : ''}
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
          <div id="tour-exercise-list" className="flex flex-col gap-3">
            {workout.exercises.map((ex, idx) => (
              <div key={ex.id} {...(idx === 0 ? { id: 'tour-first-exercise' } : {})}>
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
      })() : selectedDay && selectedDayType === 'circuit' && selectedWeekDay?.circuitConfig ? (() => {
        // If circuitConfig exists but has no exercises, build from workout exercises
        const circuitCfg = selectedWeekDay.circuitConfig
        if (circuitCfg.exercises.length === 0 && workout?.exercises) {
          circuitCfg.exercises = workout.exercises.map(ex => ({
            exerciseId: ex.id,
            name: { es: ex.name, en: ex.name },
            reps: ex.reps,
          }))
        }
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
            <Button
              className="w-full"
              onClick={() => handleStartCircuit(circuitCfg)}
            >
              {t('circuit.startCircuit')}
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
