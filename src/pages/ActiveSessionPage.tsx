import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import { useWorkoutActions } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { getUserAvatarUrl } from '../lib/pocketbase'
import SessionView from '../components/SessionView'

export default function ActiveSessionPage() {
  const { isActive, workout, workoutKey, endSession, getRestForExercise, setRestForExercise, progress, setProgress, startedAt } = useActiveSession()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs } = useWorkoutActions()
  const { user } = useAuthState()
  const navigate = useNavigate()

  const userName = user?.display_name || user?.name || undefined
  const avatarUrl = useMemo(() => user ? getUserAvatarUrl(user) : null, [user])

  // Redirect to dashboard if no active session
  useEffect(() => {
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

  const handleMarkDone = useCallback((key: string, note: string) => {
    onMarkDone(key, note)
  }, [onMarkDone])

  if (!isActive || !workout) {
    return null
  }

  return (
    <SessionView
      workout={workout}
      workoutKey={workoutKey}
      onLogSet={onLogSet}
      onMarkDone={handleMarkDone}
      onGoToDashboard={handleGoToDashboard}
      onExitSession={handleExitSession}
      getExerciseLogs={getExerciseLogs}
      getRestForExercise={getRestForExercise}
      setRestForExercise={setRestForExercise}
      initialProgress={progress}
      onProgressChange={setProgress}
      startedAt={startedAt}
      userName={userName}
      avatarUrl={avatarUrl}
    />
  )
}
