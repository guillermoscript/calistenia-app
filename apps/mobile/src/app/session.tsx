import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useKeepAwake } from 'expo-keep-awake'

import type { ExerciseTiming, Workout } from '@calistenia/core/types'
import { useFreeSessionTemplates } from '@calistenia/core/hooks/useFreeSessionTemplates'
import SessionView from '@/components/SessionView'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useWorkoutActions } from '@/contexts/WorkoutContext'
import { useAuthUser } from '@/lib/use-auth-user'

/** Título por defecto de una plantilla de sesión libre, a partir de sus
 *  ejercicios principales: "Dominadas, Fondos +2". */
function defaultTemplateTitle(workout: Workout): string {
  const names = workout.exercises
    .filter(e => !e.section || e.section === 'main')
    .map(e => e.name)
    .filter(Boolean)
  if (names.length === 0) return workout.title || 'Sesión libre'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

export default function SessionScreen() {
  // Pantalla encendida durante toda la sesión
  useKeepAwake()

  const {
    isActive, workout, workoutKey, source, startSession, endSession,
    getRestForExercise, setRestForExercise,
    progress, setProgress, startedAt,
    setSectionStartTime, getWarmupCooldownData, skipWarmup, skipCooldown,
    resumeEpoch,
  } = useActiveSession()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs } = useWorkoutActions()
  const router = useRouter()
  const authUser = useAuthUser()
  const { saveTemplate } = useFreeSessionTemplates(authUser?.id ?? null)

  // Guarda la sesión libre como plantilla reutilizable (al terminar o al salir).
  // Tolera fallos (colección aún no desplegada en prod) sin romper la navegación.
  const saveFreeTemplate = useCallback(() => {
    if (source !== 'free' || !workout) return
    void saveTemplate(defaultTemplateTitle(workout), workout.exercises)
  }, [source, workout, saveTemplate])

  // Remontar SessionView al repetir: resetea su estado local (stepIdx/phase) sin
  // salir de la ruta. startSession ya reinicia el progreso del contexto.
  const [runId, setRunId] = useState(0)

  // Sin sesión activa → volver al dashboard
  useEffect(() => {
    if (!isActive || !workout) {
      router.replace('/(tabs)')
    }
  }, [isActive, workout, router])

  const goHome = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }, [router])

  const handleGoToDashboard = useCallback(() => {
    endSession()
    goHome()
  }, [endSession, goHome])

  const handleExitSession = useCallback(() => {
    saveFreeTemplate()
    endSession()
    goHome()
  }, [saveFreeTemplate, endSession, goHome])

  const handleRepeat = useCallback(() => {
    if (!workout) return
    startSession(workout, workoutKey, source)
    setRunId(n => n + 1)
  }, [workout, workoutKey, source, startSession])

  const handleMarkDone = useCallback((key: string, note: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => {
    saveFreeTemplate()
    const wcData = getWarmupCooldownData()
    onMarkDone(key, note, {
      warmupSkipped: wcData.warmupSkipped,
      warmupDurationSeconds: wcData.warmupDurationSeconds,
      cooldownSkipped: wcData.cooldownSkipped,
      cooldownDurationSeconds: wcData.cooldownDurationSeconds,
    }, undefined, undefined, timing ? { durationSeconds: timing.durationSeconds, exerciseTimings: timing.exerciseTimings } : undefined)
  }, [saveFreeTemplate, onMarkDone, getWarmupCooldownData])

  if (!isActive || !workout) return null

  return (
    <SessionView
      key={`${runId}-${resumeEpoch}`}
      workout={workout}
      workoutKey={workoutKey}
      onLogSet={onLogSet}
      onMarkDone={handleMarkDone}
      onGoToDashboard={handleGoToDashboard}
      onRepeat={handleRepeat}
      onExitSession={handleExitSession}
      onBack={goHome}
      getExerciseLogs={getExerciseLogs}
      getRestForExercise={getRestForExercise}
      setRestForExercise={setRestForExercise}
      initialProgress={progress}
      onProgressChange={setProgress}
      startedAt={startedAt}
      onSkipWarmup={skipWarmup}
      onSkipCooldown={skipCooldown}
      onSectionStartTimeChange={setSectionStartTime}
    />
  )
}
