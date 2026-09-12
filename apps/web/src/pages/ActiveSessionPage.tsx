import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { buildFirstWorkout, firstWorkoutKey, takeFirstWorkoutPending, trackFirstWorkoutStarted } from '@calistenia/core/lib/first-workout'
import { loadCatalogIndex } from '@calistenia/core/lib/catalogIndex'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import { useWorkoutActions } from '../contexts/WorkoutContext'
import { useSessionIdentity } from '../hooks/useSessionIdentity'
import SessionView from '../components/SessionView'

export default function ActiveSessionPage() {
  const { isActive, workout, workoutKey, source, startSession, endSession, getWarmupCooldownData, resumeEpoch } = useActiveSession()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs, getTotalSessions } = useWorkoutActions()
  const { userId } = useSessionIdentity()
  const { i18n } = useTranslation()
  // Repetir reinicia la misma rutina: hay que remontar SessionView para que
  // vuelva al primer paso, igual que hace `resumeEpoch` al adoptar una sesión.
  const [repeatEpoch, setRepeatEpoch] = useState(0)
  const navigate = useNavigate()

  // Salida deliberada del panel post-entreno hacia una ruta concreta. La guarda
  // de abajo tiene que respetarla: cerrar la sesión pone isActive a false y la
  // guarda respondería con un `replace('/')` que se come el destino.
  const leavingTo = useRef(false)

  // El primer entreno del día 0 (#694): el onboarding deja la intención en
  // storage (no puede llamar a `startSession`, ver `first-workout.ts`) y esta
  // página la consume UNA vez al montar. Mientras se arranca, la guarda de
  // abajo no debe redirigir a '/'.
  const startingFirstWorkout = useRef(false)

  // Redirect to dashboard if no active session
  useEffect(() => {
    if (leavingTo.current || startingFirstWorkout.current) return
    if (isActive && workout) return

    const pending = takeFirstWorkoutPending(userId)
    if (pending) {
      startingFirstWorkout.current = true
      loadCatalogIndex().catch(() => null).then(() => {
        const w = buildFirstWorkout(pending.level, i18n.language)
        const key = firstWorkoutKey()
        startSession(w, key, 'free')
        trackFirstWorkoutStarted({ source: pending.source, level: pending.level, workoutKey: key })
      })
      return
    }

    navigate('/', { replace: true })
  }, [isActive, workout, navigate, userId, i18n.language, startSession])

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
      totalSessions={getTotalSessions()}
    />
  )
}
