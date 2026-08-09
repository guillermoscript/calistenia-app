import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import { useWorkoutActions } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import SessionView from '../components/SessionView'

export default function ActiveSessionPage() {
  const { isActive, workout, workoutKey, source, startSession, endSession, getRestForExercise, setRestForExercise, progress, setProgress, startedAt, sectionStartTime, setSectionStartTime, getWarmupCooldownData, skipWarmup, skipCooldown, skipRemainingCooldown, resumeEpoch } = useActiveSession()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs } = useWorkoutActions()
  // Repetir reinicia la misma rutina: hay que remontar SessionView para que
  // vuelva al primer paso, igual que hace `resumeEpoch` al adoptar una sesión.
  const [repeatEpoch, setRepeatEpoch] = useState(0)
  const { user } = useAuthState()
  const navigate = useNavigate()

  const userName = user?.display_name || user?.name || undefined
  const userId = user?.id || undefined
  const referralCode = user?.referral_code || null
  const avatarUrl = useMemo(() => user ? getUserAvatarUrl(user) : null, [user])

  // Salida deliberada del panel post-entreno hacia una ruta concreta. La guarda
  // de abajo tiene que respetarla: cerrar la sesión pone isActive a false y la
  // guarda respondería con un `replace('/')` que se come el destino.
  const leavingTo = useRef(false)

  // Redirect to dashboard if no active session
  useEffect(() => {
    if (leavingTo.current) return
    if (!isActive || !workout) {
      navigate('/', { replace: true })
    }
  }, [isActive, workout, navigate])

  const handleGoToDashboard = useCallback(() => {
    endSession()
    navigate('/')
  }, [endSession, navigate])

  const handleExitSession = useCallback(() => {
    endSession()
    navigate('/', { replace: true })
  }, [endSession, navigate])

  // El panel post-entreno navega a retos/progreso: se cierra la sesión (si no,
  // la barra de sesión seguiría viva en el destino) marcando antes la salida
  // para que la guarda no la reescriba a '/'.
  const handleNavigateAway = useCallback((path: string) => {
    leavingTo.current = true
    endSession()
    navigate(path)
  }, [endSession, navigate])

  const handleRepeat = useCallback(() => {
    if (!workout) return
    startSession(workout, workoutKey, source)
    setRepeatEpoch(n => n + 1)
  }, [workout, workoutKey, source, startSession])

  const handleMarkDone = useCallback((key: string, note: string, timing?: { durationSeconds?: number; exerciseTimings?: import('@calistenia/core/types').ExerciseTiming[] }) => {
    const wcData = getWarmupCooldownData()
    onMarkDone(key, note, {
      warmupSkipped: wcData.warmupSkipped,
      warmupDurationSeconds: wcData.warmupDurationSeconds,
      cooldownSkipped: wcData.cooldownSkipped,
      cooldownDurationSeconds: wcData.cooldownDurationSeconds,
    }, undefined, undefined, timing)
  }, [onMarkDone, getWarmupCooldownData])

  if (!isActive || !workout) {
    return null
  }

  return (
    <SessionView
      key={`${resumeEpoch}-${repeatEpoch}`}
      workout={workout}
      workoutKey={workoutKey}
      onLogSet={onLogSet}
      onMarkDone={handleMarkDone}
      onGoToDashboard={handleGoToDashboard}
      onRepeat={handleRepeat}
      onNavigateAway={handleNavigateAway}
      onExitSession={handleExitSession}
      getExerciseLogs={getExerciseLogs}
      getRestForExercise={getRestForExercise}
      setRestForExercise={setRestForExercise}
      initialProgress={progress}
      onProgressChange={setProgress}
      startedAt={startedAt}
      userName={userName}
      avatarUrl={avatarUrl}
      userId={userId}
      referralCode={referralCode}
      onSkipWarmup={skipWarmup}
      onSkipCooldown={skipCooldown}
      onSkipRemainingCooldown={skipRemainingCooldown}
      sectionStartTime={sectionStartTime}
      onSectionStartTimeChange={setSectionStartTime}
    />
  )
}
