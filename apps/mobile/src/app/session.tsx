import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useKeepAwake } from 'expo-keep-awake'

import type { ExerciseTiming } from '@calistenia/core/types'
import SessionView from '@/components/SessionView'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useWorkoutActions } from '@/contexts/WorkoutContext'

export default function SessionScreen() {
  // Pantalla encendida durante toda la sesión
  useKeepAwake()

  const {
    isActive, workout, workoutKey, source, startSession, endSession,
    getRestForExercise, setRestForExercise,
    progress, setProgress, startedAt,
    setSectionStartTime, getWarmupCooldownData, skipWarmup, skipCooldown,
  } = useActiveSession()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs } = useWorkoutActions()
  const router = useRouter()

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
    endSession()
    goHome()
  }, [endSession, goHome])

  const handleRepeat = useCallback(() => {
    if (!workout) return
    startSession(workout, workoutKey, source)
    setRunId(n => n + 1)
  }, [workout, workoutKey, source, startSession])

  const handleMarkDone = useCallback((key: string, note: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => {
    const wcData = getWarmupCooldownData()
    onMarkDone(key, note, {
      warmupSkipped: wcData.warmupSkipped,
      warmupDurationSeconds: wcData.warmupDurationSeconds,
      cooldownSkipped: wcData.cooldownSkipped,
      cooldownDurationSeconds: wcData.cooldownDurationSeconds,
    }, undefined, undefined, timing ? { durationSeconds: timing.durationSeconds, exerciseTimings: timing.exerciseTimings } : undefined)
  }, [onMarkDone, getWarmupCooldownData])

  if (!isActive || !workout) return null

  return (
    <SessionView
      key={runId}
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
