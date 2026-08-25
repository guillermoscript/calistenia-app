// Orquestador de la sesión de fuerza en nativo. Las pantallas viven en
// `components/session/`; la máquina de estados es el reducer puro de
// `@calistenia/core/lib/session-machine`, el mismo que usa la web. Aquí solo
// quedan la composición, los gestos, los efectos de plataforma y el empujón
// del progreso al contexto (#475).
//
// Dirección del flujo (invariante, ver CLAUDE.md): SessionView es el dueño del
// estado de la sesión y lo empuja al ActiveSessionContext; el contexto solo se
// lee para RESTAURAR al montar, nunca de vuelta durante la sesión.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { View, Pressable, Alert, Dimensions } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

import { requestNotifPermission } from '@/lib/notifications'
import { haptics as haptic } from '@/lib/haptics'
import { useLiveSession } from '@/lib/use-live-session'
import { useAuthUser } from '@/lib/use-auth-user'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import type { PREvent } from '@calistenia/core/hooks/useProgress'
import type { ExerciseLog, ExerciseTiming, Workout } from '@calistenia/core/types'
import { ExerciseTimingTracker } from '@calistenia/core/lib/exerciseTiming'
import { TRAINING_FUNNEL_EVENTS } from '@calistenia/core/lib/session-funnel'
import { quickReps } from '@calistenia/core/lib/exercise-format'
import {
  buildSteps,
  computeExerciseBoundaries,
  createSessionReducer,
  findCurrentExerciseIndex,
  initSessionState,
} from '@calistenia/core/lib/session-machine'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import PRCelebration from '@/components/share/PRCelebration'
import { MUTED } from '@/components/session/constants'
import { RestScreen } from '@/components/session/RestScreen'
import ExerciseScreen from '@/components/session/ExerciseScreen'
import NoteScreen from '@/components/session/NoteScreen'
import CelebrateScreen from '@/components/session/CelebrateScreen'
import SectionTransitionScreen from '@/components/session/SectionTransitionScreen'
import SessionTopBar from '@/components/session/SessionTopBar'

const SCREEN_WIDTH = Dimensions.get('window').width

interface SessionViewProps {
  workout: Workout
  workoutKey: string
  onLogSet: (exerciseId: string, workoutKey: string, data: { reps: string; note: string; weight?: number; rpe?: number }) => Promise<PREvent | null>
  onMarkDone: (workoutKey: string, note: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => void
  onGoToDashboard: () => void
  onRepeat?: () => void
  /** Cierra la sesión activa y navega a una ruta del panel post-entreno. */
  onNavigateAway: (path: string) => void
  onExitSession: () => void
  onBack: () => void
  getExerciseLogs: (exerciseId: string) => ExerciseLog[]
  totalSessions: number
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
  onBack,
  getExerciseLogs,
  totalSessions,
}: SessionViewProps) {
  const { t } = useTranslation()
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
  } = useActiveSession()

  // Init perezosa: `useRef(expr).current` evaluaba `expr` en CADA render y
  // tiraba el resultado — un rebuild completo de los pasos y un tracker nuevo
  // por render, en plena sesión. `useState(() => …)` conserva la semántica de
  // "congelado al montar" (la pantalla remonta por `key`) sin recalcular.
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

  const [prCelebration, setPrCelebration] = useState<{ event: PREvent; exerciseName: string } | null>(null)
  const [finalTimings, setFinalTimings] = useState<ExerciseTiming[] | null>(null)
  // Ref mirror para que el guard one-shot y handleNoteSaved nunca lean estado obsoleto.
  const finalTimingsRef = useRef<ExerciseTiming[] | null>(null)

  const sessionUser = useAuthUser()
  const [sessionStartTime] = useState<number>(() => startedAt || Date.now())

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

  // Registrar qué ejercicio está activo (wall-clock, sin re-renders extra).
  // Debe ir ANTES del efecto de persistencia para que el snapshot empujado al
  // context incluya el intervalo recién abierto (si no, resume tras crash lo pierde).
  // Guard en === 'exercise' (no solo !== note/celebrate) evita que navegar
  // prev/next en descanso reasigne el tiempo de descanso al ejercicio equivocado.
  useEffect(() => {
    if (phase !== 'exercise') return
    const ex = steps[stepIdx]?.exercise
    if (ex) timingTracker.enterExercise({ id: ex.id, name: ex.name })
  }, [stepIdx, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Empujar progreso al context (sobrevive navegar fuera y volver), incluyendo estado del tracker
  useEffect(() => {
    setProgress({ stepIdx, phase, setsCount, timing: timingTracker.getState() })
  }, [stepIdx, phase, setsCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Permiso de notificaciones al arrancar la sesión
  useEffect(() => { requestNotifPermission() }, [])

  // Finalizar timings exactamente una vez al llegar a la pantalla de nota
  useEffect(() => {
    if (phase === 'note' && finalTimingsRef.current === null) {
      const result = timingTracker.finalize()
      finalTimingsRef.current = result
      setFinalTimings(result)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const goToPrevExercise = useCallback(() => {
    if (currentExerciseIndex <= 0) return
    dispatch({ type: 'goto-exercise', stepIdx: exerciseBoundaries[currentExerciseIndex - 1] })
  }, [currentExerciseIndex, exerciseBoundaries])

  const goToNextExercise = useCallback(() => {
    if (currentExerciseIndex >= exerciseBoundaries.length - 1) return
    dispatch({ type: 'goto-exercise', stepIdx: exerciseBoundaries[currentExerciseIndex + 1] })
  }, [currentExerciseIndex, exerciseBoundaries])

  // ── Swipe-to-navigate ────────────────────────────────────────────────────────
  const translateX = useSharedValue(0)
  const canSwipeLeft = useSharedValue(hasNextExercise)
  const canSwipeRight = useSharedValue(hasPrevExercise)
  const swipeDirectionRef = useRef<'next' | 'prev' | null>(null)
  const prevSwipeStepRef = useRef(stepIdx)

  useEffect(() => {
    canSwipeLeft.value = hasNextExercise
    canSwipeRight.value = hasPrevExercise
  }, [hasNextExercise, hasPrevExercise, canSwipeLeft, canSwipeRight])

  useEffect(() => {
    if (stepIdx === prevSwipeStepRef.current) return
    prevSwipeStepRef.current = stepIdx
    const dir = swipeDirectionRef.current
    swipeDirectionRef.current = null
    if (!dir) return
    // Snap al lado de entrada (el ejercicio nuevo entra desde el lado opuesto
    // al swipe) y desliza a 0. Antes esto se hacía dentro del callback de
    // withTiming en el worklet, pero mutar un shared value + runOnJS anidados
    // en un callback de animación crashea en Reanimated 4 (release).
    translateX.value = dir === 'next' ? SCREEN_WIDTH : -SCREEN_WIDTH
    translateX.value = withSpring(0, { damping: 20, stiffness: 220 })
  }, [stepIdx, translateX])

  const handleSwipeToNext = useCallback(() => {
    swipeDirectionRef.current = 'next'
    goToNextExercise()
  }, [goToNextExercise])

  const handleSwipeToPrev = useCallback(() => {
    swipeDirectionRef.current = 'prev'
    goToPrevExercise()
  }, [goToPrevExercise])

  const swipeGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-25, 25])
      .failOffsetY([-15, 15])
      .onUpdate((e) => {
        if (e.translationX < 0 && !canSwipeLeft.value) return
        if (e.translationX > 0 && !canSwipeRight.value) return
        translateX.value = e.translationX * 0.25
      })
      .onEnd((e) => {
        const THRESHOLD = 65
        if (e.translationX < -THRESHOLD && canSwipeLeft.value) {
          // Desliza la tarjeta actual fuera; la navegación (y el snap de
          // entrada del ejercicio nuevo) los maneja el efecto sobre stepIdx.
          translateX.value = withTiming(-SCREEN_WIDTH, { duration: 180 })
          runOnJS(haptic.selection)()
          runOnJS(handleSwipeToNext)()
        } else if (e.translationX > THRESHOLD && canSwipeRight.value) {
          translateX.value = withTiming(SCREEN_WIDTH, { duration: 180 })
          runOnJS(haptic.selection)()
          runOnJS(handleSwipeToPrev)()
        } else {
          translateX.value = withSpring(0, { damping: 15, stiffness: 200 })
        }
      }),
    [canSwipeLeft, canSwipeRight, handleSwipeToNext, handleSwipeToPrev, translateX]
  )

  const exerciseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))
  // ────────────────────────────────────────────────────────────────────────────

  const handleLogged = useCallback(async ({ reps, note, weight, rpe }: { reps: string; note: string; weight?: number; rpe?: number }) => {
    if (!currentStep) return
    const prEvent = await onLogSet(currentStep.exercise.id, workoutKey, { reps, note, weight, rpe })
    if (prEvent) {
      setPrCelebration({ event: prEvent, exerciseName: currentStep.exercise.name })
    }
    // Mismas propiedades que en web a propósito (#636 §3): el embudo tiene que
    // poder segmentarse por plataforma, y para eso las dos tienen que mandar lo
    // mismo. `note` NUNCA sale de aquí: es texto libre del usuario (§6).
    trackFunnelStep(TRAINING_FUNNEL_EVENTS.setLogged, {
      sets_logged: getProgressSnapshot().setsCount + 1,
      exercise_id: currentStep.exercise.id,
      section: currentStep.section,
      set_number: currentStep.setNumber,
      set_total: currentStep.totalSets,
      is_pr: !!prEvent,
    })
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
  }, [currentStep, onLogSet, workoutKey, trackFunnelStep, getProgressSnapshot, currentExerciseIndex, exerciseBoundaries.length])

  const handleRestDone = useCallback(() => {
    dispatch({ type: 'rest-done' })
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
  }, [skipWarmup])

  const handleSkipCooldown = useCallback(() => {
    skipCooldown()
    dispatch({ type: 'skip-cooldown' })
  }, [skipCooldown])

  const stepSection = currentStep?.section || 'main'
  const isInWarmup = stepSection === 'warmup' && phase === 'exercise'
  const isInCooldown = stepSection === 'cooldown' && (phase === 'exercise' || phase === 'rest')

  const handleNoteSaved = useCallback((note: string) => {
    const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000)
    // Finalize defensivo si la pantalla de nota se alcanzó antes de que el
    // efecto de finalize commitease; el tracker es idempotente.
    const timings = finalTimingsRef.current ?? timingTracker.finalize()
    onMarkDone(workoutKey, note, { durationSeconds, exerciseTimings: timings })
    dispatch({ type: 'finish' })
  }, [onMarkDone, workoutKey, timingTracker, sessionStartTime])

  const confirmDiscard = useCallback(() => {
    Alert.alert(
      t('session.discardTitle'),
      setsCount > 0 ? t('session.discardWithSets', { count: setsCount }) : t('session.discardEmpty'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('session.discardButton'), style: 'destructive', onPress: onExitSession },
      ],
    )
  }, [t, setsCount, onExitSession])

  const durationMin = Math.round((Date.now() - sessionStartTime) / 60000)

  // Botón de la notificación: misma semántica que el botón rápido de la UI
  const handleLiveAdvance = useCallback(() => {
    if (phase === 'exercise' && currentStep) {
      void handleLogged({ reps: quickReps(currentStep.exercise.reps), note: '' })
    } else if (phase === 'rest') {
      handleRestDone()
    } else if (phase === 'section-transition') {
      handleSectionContinue()
    }
  }, [phase, currentStep, handleLogged, handleRestDone, handleSectionContinue])

  // Live Activity / notificación persistente — observa, no muta
  useLiveSession({
    workoutTitle: workout.title,
    phase,
    exerciseName: phase === 'section-transition'
      ? (transitionType === 'warmup-to-main' ? t('warmupCooldown.sections.main') : t('warmupCooldown.sections.cooldown'))
      : currentStep?.exercise.name ?? '',
    setNumber: currentStep?.setNumber ?? 0,
    totalSets: currentStep?.totalSets ?? 0,
    onAdvance: handleLiveAdvance,
  })

  return (
    <SafeAreaView className="flex-1 bg-background">
      {phase !== 'celebrate' && (
        <SessionTopBar
          phase={phase}
          exerciseName={currentStep?.exercise.name}
          exerciseIndex={phase === 'note' ? exerciseBoundaries.length : currentExerciseIndex + 1}
          exerciseTotal={exerciseBoundaries.length}
          stepIndex={phase === 'note' ? steps.length : stepIdx + 1}
          stepTotal={steps.length}
          onBack={onBack}
          onDiscard={confirmDiscard}
          onSkipWarmup={isInWarmup ? handleSkipWarmup : undefined}
          onSkipCooldown={isInCooldown ? handleSkipCooldown : undefined}
        />
      )}

      {(phase === 'exercise' || phase === 'rest') && (
        <GestureDetector gesture={swipeGesture}>
          <Animated.View className="flex-1" style={exerciseAnimStyle}>
            {phase === 'exercise' && currentStep ? (
              <ExerciseScreen
                key={stepIdx}
                step={currentStep}
                onLogged={handleLogged}
                logs={currentLogs}
              />
            ) : (
              <RestScreen
                key={`rest-${stepIdx}`}
                seconds={currentStep?.exercise.rest || 90}
                exerciseId={currentStep?.exercise.id}
                nextStep={nextStep}
                onSkip={handleRestDone}
                onManualSkip={handleRestManualSkip}
                savedRest={currentStep && getRestForExercise ? getRestForExercise(currentStep.exercise.id, currentStep.exercise.rest || 90) : undefined}
                onAdjust={setRestForExercise ? (id, secs) => { setRestForExercise(id, secs) } : undefined}
              />
            )}

            {/* Swipe hint dots — visible when adjacent exercises exist */}
            {(hasPrevExercise || hasNextExercise) && (
              <View className="absolute bottom-4 inset-x-0 flex-row items-center justify-center gap-1.5" pointerEvents="none">
                {hasPrevExercise && <View className="size-1 rounded-full bg-muted-foreground/30" />}
                <View className="h-1 w-3 rounded-full bg-lime/50" />
                {hasNextExercise && <View className="size-1 rounded-full bg-muted-foreground/30" />}
              </View>
            )}

            {/* Tap targets at edges for accessibility */}
            {(hasPrevExercise || hasNextExercise) && (
              <View className="absolute inset-x-1 top-1/2 -mt-5 flex-row justify-between" pointerEvents="box-none">
                {hasPrevExercise ? (
                  <Pressable onPress={goToPrevExercise} className="size-10 items-center justify-center rounded-full bg-muted/50 active:opacity-70" accessibilityLabel="Anterior">
                    <ChevronLeft size={16} color={MUTED} />
                  </Pressable>
                ) : <View />}
                {hasNextExercise ? (
                  <Pressable onPress={goToNextExercise} className="size-10 items-center justify-center rounded-full bg-muted/50 active:opacity-70" accessibilityLabel="Siguiente">
                    <ChevronRight size={16} color={MUTED} />
                  </Pressable>
                ) : <View />}
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      )}

      {phase === 'section-transition' && (
        <SectionTransitionScreen
          type={transitionType}
          onContinue={handleSectionContinue}
          onSkip={transitionType === 'main-to-cooldown' ? handleSkipCooldown : undefined}
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
          totalSetsLogged={setsCount}
          durationMin={durationMin}
          exercises={workout.exercises}
          workoutKey={workoutKey}
          timings={finalTimings ?? []}
          totalSessions={totalSessions}
          onDone={onGoToDashboard}
          onRepeat={onRepeat}
          onNavigateAway={onNavigateAway}
        />
      )}

      {prCelebration && (
        <PRCelebration
          prEvent={prCelebration.event}
          exerciseName={prCelebration.exerciseName}
          userName={(sessionUser?.display_name as string) || (sessionUser?.name as string) || 'Atleta'}
          avatarUrl={sessionUser ? getUserAvatarUrl(sessionUser, '200x200') : null}
          referralCode={(sessionUser?.referral_code as string) || null}
          workoutId={workoutKey}
          onDismiss={() => setPrCelebration(null)}
        />
      )}
    </SafeAreaView>
  )
}
