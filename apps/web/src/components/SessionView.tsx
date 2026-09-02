// Orquestador de la sesión de fuerza. Las pantallas viven en
// `components/session/`; la máquina de estados es el reducer puro de
// `@calistenia/core/lib/session-machine`, así que aquí solo quedan la
// composición, los efectos de plataforma (sonido, notificaciones, toasts) y
// el empujón del progreso al contexto (#475).
//
// Dirección del flujo (invariante, ver apps/mobile/CLAUDE.md): SessionView es
// el dueño del estado de la sesión y lo empuja al contexto; el contexto solo
// se lee para RESTAURAR al montar, nunca de vuelta durante la sesión.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { PREvent } from '@calistenia/core/hooks/useProgress'
import type { ExerciseLog, ExerciseTiming, Workout } from '@calistenia/core/types'
import { ExerciseTimingTracker } from '@calistenia/core/lib/exerciseTiming'
import { TRAINING_FUNNEL_EVENTS } from '@calistenia/core/lib/session-funnel'
import {
  buildSteps,
  computeExerciseBoundaries,
  createSessionReducer,
  findCurrentExerciseIndex,
  initSessionState,
} from '@calistenia/core/lib/session-machine'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import * as sounds from '../lib/sounds'
import * as notif from '../lib/notifications'
import PRCelebration from './PRCelebration'
import SectionTransition from './session/SectionTransition'
import CelebrateScreen from './session/CelebrateScreen'
import DiscardSessionDialog from './session/DiscardSessionDialog'
import ExerciseNavArrows from './session/ExerciseNavArrows'
import ExerciseScreen from './session/ExerciseScreen'
import NoteScreen from './session/NoteScreen'
import RestScreen from './session/RestScreen'
import SessionTopBar from './session/SessionTopBar'

interface SessionViewProps {
  workout: Workout
  workoutKey: string
  onLogSet: (exerciseId: string, workoutKey: string, data: { reps: string; note: string; weight?: number; rpe?: number }) => Promise<PREvent | null>
  onMarkDone: (workoutKey: string, note: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => void
  onGoToDashboard: () => void
  /** Reinicia la misma rutina desde el panel post-entreno (paridad con móvil). */
  onRepeat?: () => void
  /** Cierra la sesión activa y navega a una ruta del panel post-entreno. */
  onNavigateAway: (path: string) => void
  onExitSession: () => void
  getExerciseLogs: (exerciseId: string) => ExerciseLog[]
}

export default function SessionView({
  workout,
  workoutKey,
  onLogSet,
  onMarkDone,
  onGoToDashboard,
  onRepeat,
  onNavigateAway,
  onExitSession,
  getExerciseLogs,
}: SessionViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    startedAt,
    getProgressSnapshot,
    setProgress,
    getRestForExercise,
    setRestForExercise,
    setSectionStartTime,
    trackFunnelStep,
    skipWarmup,
    skipCooldown,
    skipRemainingCooldown,
  } = useActiveSession()

  // Init perezosa: `useRef(expr).current` evaluaba `expr` en CADA render y
  // tiraba el resultado. Con `useState(() => …)` se calcula una sola vez, y
  // la semántica de "congelado al montar" se mantiene porque la página
  // remonta este componente por `key` al repetir o al adoptar del server.
  const [{ steps, exerciseBoundaries, reducer }] = useState(() => {
    const built = buildSteps(workout.exercises)
    return {
      steps: built,
      exerciseBoundaries: computeExerciseBoundaries(built),
      reducer: createSessionReducer(built),
    }
  })
  const [timingTracker] = useState(() => new ExerciseTimingTracker(getProgressSnapshot().timing ?? null))
  const [state, dispatch] = useReducer(reducer, undefined, () => initSessionState(getProgressSnapshot()))

  const { stepIdx, phase, setsCount, transitionType } = state

  const [showExit, setShowExit] = useState<boolean>(false)
  // El nombre viaja junto al evento (como en el SessionView móvil): el PREvent
  // solo trae el `exerciseId`, que en programas viejos es una clave de slot
  // («lun_1_9») y no sirve para pintar.
  const [prEvent, setPREvent] = useState<{ event: PREvent; exerciseName: string; isTimer: boolean } | null>(null)
  const [finalTimings, setFinalTimings] = useState<ExerciseTiming[] | null>(null)
  // Espejo en ref de finalTimings para que el guard one-shot y el guardado de
  // la nota nunca lean un valor obsoleto (evita doble finalize / timings vacíos).
  const finalTimingsRef = useRef<ExerciseTiming[] | null>(null)

  const [sessionStartTime] = useState<number>(() => startedAt || Date.now())

  // Gestos de swipe
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const currentStep = steps[stepIdx]
  const nextStep = steps[stepIdx + 1] || null

  // `getExerciseLogs` devuelve un `slice()` nuevo en cada llamada, así que sin
  // memoizar la prop `logs` es una referencia nueva por render y el `memo` de
  // ExerciseScreen nunca acierta.
  const currentLogs = useMemo(
    () => (currentStep ? getExerciseLogs(currentStep.exercise.id) : []),
    [getExerciseLogs, currentStep],
  )

  const currentExerciseIndex = findCurrentExerciseIndex(exerciseBoundaries, stepIdx, steps.length)
  const hasPrevExercise = currentExerciseIndex > 0
  const hasNextExercise = currentExerciseIndex < exerciseBoundaries.length - 1

  // Un ejercicio está "activo" solo mientras se ve en pantalla (fase 'exercise').
  // El guard en === 'exercise' (y no solo !== note/celebrate) evita que navegar
  // prev/next durante el descanso reasigne ese tiempo al ejercicio equivocado.
  useEffect(() => {
    if (phase !== 'exercise') return
    const ex = steps[stepIdx]?.exercise
    if (!ex) return
    timingTracker.enterExercise({ id: ex.id, name: ex.name })
  }, [stepIdx, phase]) // eslint-disable-line react-hooks/exhaustive-deps -- `timingTracker` es estable y `steps` se lee fresco; incluirlos reasignaría tiempos

  // Finalizar exactamente una vez al llegar por primera vez a la nota.
  useEffect(() => {
    if (phase === 'note' && finalTimingsRef.current === null) {
      const result = timingTracker.finalize()
      finalTimingsRef.current = result
      setFinalTimings(result)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps -- finalizar exactamente una vez al entrar en la nota

  // Empujar el progreso al contexto para que sobreviva a navegar fuera y volver
  useEffect(() => {
    setProgress({ stepIdx, phase, setsCount, timing: timingTracker.getState() })
  }, [stepIdx, phase, setsCount]) // eslint-disable-line react-hooks/exhaustive-deps -- se empuja el progreso al avanzar, no cuando cambia la identidad de `setProgress`

  // Permiso de notificaciones al arrancar la sesión
  useEffect(() => { notif.requestPermission() }, [])

  const goToPrevExercise = useCallback(() => {
    if (currentExerciseIndex <= 0) return
    dispatch({ type: 'goto-exercise', stepIdx: exerciseBoundaries[currentExerciseIndex - 1] })
  }, [currentExerciseIndex, exerciseBoundaries])

  const goToNextExercise = useCallback(() => {
    if (currentExerciseIndex >= exerciseBoundaries.length - 1) return
    dispatch({ type: 'goto-exercise', stepIdx: exerciseBoundaries[currentExerciseIndex + 1] })
  }, [currentExerciseIndex, exerciseBoundaries])

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    // Solo si el swipe horizontal domina y supera los 70px
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goToNextExercise()    // swipe izquierda → siguiente
      else goToPrevExercise()           // swipe derecha → anterior
    }
  }, [goToNextExercise, goToPrevExercise])

  const handleLogged = useCallback(async ({ reps, note, weight, rpe }: { reps: string; note: string; weight?: number; rpe?: number }) => {
    if (!currentStep) return
    const pr = await onLogSet(currentStep.exercise.id, workoutKey, { reps, note, weight, rpe })
    if (pr) setPREvent({ event: pr, exerciseName: currentStep.exercise.name, isTimer: !!currentStep.exercise.isTimer })

    sounds.playSetComplete()
    sounds.vibrate([80])
    const remaining = steps.length - (stepIdx + 1)
    notif.notifySetComplete(currentStep.exercise.name, currentStep.setNumber, currentStep.totalSets, remaining)

    // El paso del embudo que faltaba (#636 §3): sin él no se puede saber cuánta
    // gente arranca un entreno y no llega a registrar ni una serie.
    // `note` NUNCA sale de aquí: es texto libre del usuario (§6).
    trackFunnelStep(TRAINING_FUNNEL_EVENTS.setLogged, {
      sets_logged: getProgressSnapshot().setsCount + 1,
      exercise_id: currentStep.exercise.id,
      section: currentStep.section,
      set_number: currentStep.setNumber,
      set_total: currentStep.totalSets,
      is_pr: !!pr,
    })
    // La última serie de un ejercicio lo da por terminado. Se mira aquí y no en
    // el reducer porque las cuatro ramas posteriores (nota, transición de
    // sección, superserie y descanso) llegan a lo mismo por caminos distintos.
    if (currentStep.setNumber === currentStep.totalSets) {
      trackFunnelStep(TRAINING_FUNNEL_EVENTS.exerciseCompleted, {
        sets_logged: getProgressSnapshot().setsCount + 1,
        exercise_id: currentStep.exercise.id,
        section: currentStep.section,
        set_total: currentStep.totalSets,
        exercise_index: currentExerciseIndex + 1,
        exercise_total: exerciseBoundaries.length,
      })
    }

    dispatch({ type: 'log-set' })
  }, [currentStep, onLogSet, workoutKey, stepIdx, steps.length, trackFunnelStep, getProgressSnapshot, currentExerciseIndex, exerciseBoundaries.length])

  const handleRestDone = useCallback(() => {
    dispatch({ type: 'rest-done' })
    setPREvent(null)
  }, [])

  /** Solo el corte a mano: el descanso que se agota entra por `handleRestDone`. */
  const handleRestManualSkip = useCallback((secondsRemaining: number) => {
    trackFunnelStep(TRAINING_FUNNEL_EVENTS.restSkipped, {
      exercise_id: currentStep?.exercise.id,
      section: currentStep?.section,
      seconds_remaining: secondsRemaining,
    })
  }, [trackFunnelStep, currentStep])

  const handleSectionContinue = useCallback(() => {
    setSectionStartTime(Date.now())
    dispatch({ type: 'section-continue' })
  }, [setSectionStartTime])

  const handleSkipWarmup = useCallback(() => {
    skipWarmup()
    dispatch({ type: 'skip-warmup' })
    toast.info(t('warmupCooldown.nudge.warmupSkipped'), { duration: 3000 })
  }, [skipWarmup, t])

  const handleSectionSkipCooldown = useCallback(() => {
    skipCooldown()
    dispatch({ type: 'skip-cooldown' })
    toast.info(t('warmupCooldown.nudge.cooldownSkipped'), { duration: 3000 })
  }, [skipCooldown, t])

  const handleSkipRemainingCooldown = useCallback(() => {
    skipRemainingCooldown()
    dispatch({ type: 'skip-cooldown' })
    toast.info(t('warmupCooldown.nudge.cooldownSkipped'), { duration: 3000 })
  }, [skipRemainingCooldown, t])

  const handleNoteSaved = useCallback((note: string) => {
    const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000)
    // Finalize defensivo por si se llegó a la nota antes de que el efecto
    // commiteara; el tracker es idempotente.
    const timings = finalTimingsRef.current ?? timingTracker.finalize()
    onMarkDone(workoutKey, note, { durationSeconds, exerciseTimings: timings })
    sounds.playSessionComplete()
    sounds.vibrate([100, 50, 100, 50, 200])
    notif.notifySessionComplete(workout.title, setsCount)
    dispatch({ type: 'finish' })
  }, [onMarkDone, workoutKey, workout.title, setsCount, timingTracker, sessionStartTime])

  // Visibilidad de los botones de saltar sección
  const stepSection = currentStep?.section || 'main'
  const hasWarmup = workout.exercises.some(e => e.section === 'warmup')
  const hasCooldown = workout.exercises.some(e => e.section === 'cooldown')
  const isInWarmup = stepSection === 'warmup' && phase === 'exercise'
  const isInCooldown = stepSection === 'cooldown' && (phase === 'exercise' || phase === 'rest')

  const durationMin = Math.round((Date.now() - sessionStartTime) / 60000)

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background overflow-hidden">
      {phase !== 'celebrate' && (
        <SessionTopBar
          phase={phase}
          transitionType={transitionType}
          exerciseName={currentStep?.exercise.name}
          exerciseIndex={phase === 'note' ? exerciseBoundaries.length : currentExerciseIndex + 1}
          exerciseTotal={exerciseBoundaries.length}
          stepIndex={phase === 'note' ? steps.length : stepIdx + 1}
          stepTotal={steps.length}
          onBack={() => navigate(-1)}
          onDiscard={() => setShowExit(true)}
          onSkipWarmup={isInWarmup && hasWarmup ? handleSkipWarmup : undefined}
          onSkipCooldown={isInCooldown && hasCooldown ? handleSkipRemainingCooldown : undefined}
        />
      )}

      {phase === 'exercise' && currentStep && (
        <div
          className="flex-1 flex flex-col overflow-hidden relative"
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          <ExerciseNavArrows
            hasPrev={hasPrevExercise}
            hasNext={hasNextExercise}
            onPrev={goToPrevExercise}
            onNext={goToNextExercise}
          />
          <ExerciseScreen
            key={stepIdx}
            step={currentStep}
            onLogged={handleLogged}
            logs={currentLogs}
          />
        </div>
      )}

      {phase === 'rest' && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {prEvent && (
            <PRCelebration
              prEvent={prEvent.event}
              exerciseName={prEvent.exerciseName}
              isTimer={prEvent.isTimer}
              onDismiss={() => setPREvent(null)}
            />
          )}
          <ExerciseNavArrows
            hasPrev={hasPrevExercise}
            hasNext={hasNextExercise}
            onPrev={goToPrevExercise}
            onNext={goToNextExercise}
          />
          <RestScreen
            key={`rest-${stepIdx}`}
            seconds={currentStep?.exercise.rest || 90}
            exerciseId={currentStep?.exercise.id}
            nextStep={nextStep}
            onSkip={handleRestDone}
            onManualSkip={handleRestManualSkip}
            savedRest={currentStep && getRestForExercise ? getRestForExercise(currentStep.exercise.id, currentStep.exercise.rest || 90) : undefined}
            onAdjust={setRestForExercise ? (id, secs) => setRestForExercise(id, secs) : undefined}
          />
        </div>
      )}

      {phase === 'section-transition' && (
        <SectionTransition
          type={transitionType}
          onContinue={handleSectionContinue}
          onSkip={transitionType === 'main-to-cooldown' ? handleSectionSkipCooldown : undefined}
        />
      )}

      {phase === 'note' && (
        <NoteScreen
          workoutTitle={workout.title}
          totalSetsLogged={setsCount}
          durationMin={durationMin}
          onSave={handleNoteSaved}
        />
      )}

      {phase === 'celebrate' && (
        <CelebrateScreen
          workoutTitle={workout.title}
          workoutKey={workoutKey}
          totalSetsLogged={setsCount}
          durationMin={durationMin}
          exercises={workout.exercises}
          timings={finalTimings ?? []}
          onDone={onGoToDashboard}
          onRepeat={onRepeat}
          onNavigateAway={onNavigateAway}
        />
      )}

      <DiscardSessionDialog
        open={showExit}
        onOpenChange={setShowExit}
        setsCount={setsCount}
        onConfirm={onExitSession}
      />
    </div>
  )
}
