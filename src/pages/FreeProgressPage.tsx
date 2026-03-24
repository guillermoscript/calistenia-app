import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/badge'
import { relativeDate } from '../lib/dateUtils'
import { isFreeSession, filterProgressByType } from '../lib/progressUtils'
import { useWorkoutState } from '../contexts/WorkoutContext'
import type { ExerciseLog } from '../types'
import ProgressSummary from '../components/progress/ProgressSummary'
import ExerciseChart from '../components/progress/ExerciseChart'

interface SessionLog {
  date: string
  workoutKey: string
  exerciseCount: number
  exerciseNames: string[]
  totalSets: number
  note: string
}

export default function FreeProgressPage() {
  const { progress, settings } = useWorkoutState()
  const navigate = useNavigate()

  const freeProgress = useMemo(() => filterProgressByType(progress, 'free'), [progress])

  const freeLogs = useMemo<SessionLog[]>(() => {
    return Object.entries(progress)
      .filter(([k]) => k.startsWith('done_'))
      .map(([key, val]) => {
        const parts = key.split('_')
        const date = parts[1]
        const workoutKey = parts.slice(2).join('_')
        if (!isFreeSession(workoutKey)) return null
        const sessionExercises = Object.entries(progress).filter(([k, v]) =>
          !k.startsWith('done_') && k.includes(workoutKey) && k.includes(date) && (v as ExerciseLog).exerciseId
        )
        const exerciseNames = [...new Set(sessionExercises.map(([, v]) => (v as ExerciseLog).exerciseId))]
        const totalSets = sessionExercises.reduce((acc, [, v]) => acc + ((v as ExerciseLog).sets?.length || 0), 0)
        return {
          date,
          workoutKey,
          exerciseCount: exerciseNames.length,
          exerciseNames,
          totalSets,
          note: (val as { note?: string }).note || '',
        }
      })
      .filter((l): l is SessionLog => l !== null)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [progress])

  const exerciseLogs = useMemo<Record<string, ExerciseLog[]>>(() => {
    const logs: Record<string, ExerciseLog[]> = {}
    Object.values(freeProgress).forEach(val => {
      const v = val as ExerciseLog
      if (v.exerciseId && v.sets) {
        if (!logs[v.exerciseId]) logs[v.exerciseId] = []
        logs[v.exerciseId].push(v)
      }
    })
    return logs
  }, [freeProgress])

  return (
    <div className="max-w-[860px] mx-auto px-4 py-6 md:px-6 md:py-8 motion-safe:animate-fade-in">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        Volver
      </button>

      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-2 uppercase">Historial</div>
      <div className="flex items-end gap-4 mb-8 flex-wrap">
        <div className="font-bebas text-3xl md:text-4xl leading-none">SESIONES LIBRES</div>
        <Badge variant="outline" className="border-violet-400/25 text-violet-400 bg-violet-400/5 mb-1.5">
          {freeLogs.length} {freeLogs.length !== 1 ? 'sesiones' : 'sesión'}
        </Badge>
      </div>

      {freeLogs.length === 0 ? (
        <div className="text-center py-16 px-5 text-muted-foreground">
          <div className="text-5xl mb-4">🏋️</div>
          <div className="font-bebas text-3xl mb-2">Sin sesiones libres</div>
          <div className="text-sm">Cuando completes una sesión libre, aquí verás tu progreso independiente del programa.</div>
        </div>
      ) : (
        <div>
          {/* Summary (filtered to free only) */}
          <ProgressSummary progress={progress} settings={settings} filter="free" />

          {/* Exercise Charts with last-session sets */}
          {(() => {
            const visibleExercises = Object.entries(exerciseLogs).filter(([, logs]) =>
              logs.some(l => l.sets.some(s => parseInt(s.reps, 10) > 0))
            )
            if (visibleExercises.length === 0) return null
            return (
              <div className="mb-8">
                <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Ejercicios</div>
                <div className="flex flex-col gap-2.5">
                  {visibleExercises.map(([exId, logs]) => {
                    const latest = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0]
                    return (
                      <ExerciseChart
                        key={exId}
                        exerciseName={exId}
                        logs={logs}
                        lastSets={latest?.sets}
                        accentColor="violet"
                      />
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Session History */}
          <div className="mb-8">
            <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Historial</div>
            <div className="flex flex-col gap-1.5">
              {freeLogs.map((log, i) => (
                <button
                  key={`${log.date}-${log.workoutKey}-${i}`}
                  onClick={() => navigate(`/session/${log.date}/${log.workoutKey}`)}
                  className="w-full text-left px-4 py-3 bg-card border border-border rounded-lg hover:border-violet-400/30 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-xs text-muted-foreground w-16 shrink-0">{relativeDate(log.date)}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate text-violet-400 capitalize">
                        {log.exerciseNames.length > 0
                          ? log.exerciseNames.map(n => n.replace(/_/g, ' ')).join(', ')
                          : 'Sesión Libre'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {log.totalSets > 0 ? `${log.totalSets} series` : `${log.exerciseCount} ${log.exerciseCount !== 1 ? 'ejercicios' : 'ejercicio'}`}
                      </div>
                    </div>
                  </div>
                  <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
