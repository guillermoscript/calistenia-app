import { useCallback, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { useKeepAwake } from 'expo-keep-awake'

import SessionView from '@/components/SessionView'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useWorkoutActions } from '@/contexts/WorkoutContext'

export default function SessionScreen() {
  // Pantalla encendida durante toda la sesión
  useKeepAwake()

  const {
    isActive, workout, workoutKey, endSession,
    getRestForExercise, setRestForExercise,
    progress, setProgress, startedAt,
    setSectionStartTime, getWarmupCooldownData, skipWarmup, skipCooldown,
  } = useActiveSession()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs } = useWorkoutActions()
  const router = useRouter()

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

  const handleMarkDone = useCallback((key: string, note: string) => {
    const wcData = getWarmupCooldownData()
    onMarkDone(key, note, {
      warmupSkipped: wcData.warmupSkipped,
      warmupDurationSeconds: wcData.warmupDurationSeconds,
      cooldownSkipped: wcData.cooldownSkipped,
      cooldownDurationSeconds: wcData.cooldownDurationSeconds,
    })
  }, [onMarkDone, getWarmupCooldownData])

  if (!isActive || !workout) return null

  return (
    <SessionView
      workout={workout}
      workoutKey={workoutKey}
      onLogSet={onLogSet}
      onMarkDone={handleMarkDone}
      onGoToDashboard={handleGoToDashboard}
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
