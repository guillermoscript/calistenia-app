import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import { useWorkoutActions } from '../contexts/WorkoutContext'
import SessionView from '../components/SessionView'

export default function ActiveSessionPage() {
  const { isActive, workout, workoutKey, endSession, getRestForExercise, setRestForExercise } = useActiveSession()
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs } = useWorkoutActions()
  const navigate = useNavigate()

  const handleGoToDashboard = useCallback(() => {
    endSession()
    navigate('/')
  }, [endSession, navigate])

  const handleExitSession = useCallback(() => {
    endSession()
    navigate(-1)
  }, [endSession, navigate])

  const handleMarkDone = useCallback((key: string, note: string) => {
    onMarkDone(key, note)
  }, [onMarkDone])

  // If no active session, redirect to dashboard
  if (!isActive || !workout) {
    navigate('/', { replace: true })
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
    />
  )
}
