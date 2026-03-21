import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { WORKOUTS } from '../data/workouts'
import { useSessionDetail } from '../hooks/useSessionDetail'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import type { ProgressMap } from '../types'
import type { SessionExercise } from '../hooks/useSessionDetail'

// ── Build exercise catalog from static workout data ──────────────────────────

function buildExerciseCatalog(): Record<string, { name: string; muscles: string }> {
  const catalog: Record<string, { name: string; muscles: string }> = {}
  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!catalog[ex.id]) {
        catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
      }
    })
  })
  return catalog
}

const EXERCISE_CATALOG = buildExerciseCatalog()

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseWorkoutKey(key: string): string {
  const [phaseStr, day] = key.split('_')
  const phase = phaseStr.replace('p', '')
  const dayNames: Record<string, string> = {
    lun: 'Lunes', mar: 'Martes', mie: 'Miercoles',
    jue: 'Jueves', vie: 'Viernes', sab: 'Sabado', dom: 'Domingo',
  }
  return `Fase ${phase} — ${dayNames[day] || day}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ── Exercise Section ─────────────────────────────────────────────────────────

function ExerciseSection({ exercise }: { exercise: SessionExercise }) {
  return (
    <div className="py-4">
      <div className="mb-3">
        <div className="text-sm font-medium text-foreground">{exercise.name}</div>
        {exercise.muscles && (
          <div className="text-[11px] text-muted-foreground">{exercise.muscles}</div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-muted-foreground tracking-widest uppercase">
              <th className="text-left pb-2 pr-4 font-normal">Serie</th>
              <th className="text-left pb-2 pr-4 font-normal">Reps</th>
              {exercise.hasWeight && <th className="text-left pb-2 pr-4 font-normal">Peso</th>}
              {exercise.hasRpe && <th className="text-left pb-2 pr-4 font-normal">RPE</th>}
              {exercise.hasNotes && <th className="text-left pb-2 font-normal">Nota</th>}
            </tr>
          </thead>
          <tbody>
            {exercise.sets.map(set => {
              const isBest = exercise.bestSet?.setNumber === set.setNumber
              return (
                <tr
                  key={set.setNumber}
                  className={cn(
                    'border-t border-border/50',
                    isBest && 'text-lime',
                  )}
                >
                  <td className="py-2 pr-4 text-muted-foreground">{set.setNumber}</td>
                  <td className={cn('py-2 pr-4', isBest ? 'font-medium' : 'text-foreground')}>{set.reps}</td>
                  {exercise.hasWeight && (
                    <td className="py-2 pr-4">
                      {set.weight ? `${set.weight}kg` : '—'}
                    </td>
                  )}
                  {exercise.hasRpe && (
                    <td className="py-2 pr-4">
                      {set.rpe ? set.rpe : '—'}
                    </td>
                  )}
                  {exercise.hasNotes && (
                    <td className="py-2 text-muted-foreground text-xs italic">
                      {set.note || '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Session Detail Page ──────────────────────────────────────────────────────

interface SessionDetailPageProps {
  progress: ProgressMap
}

export default function SessionDetailPage({ progress }: SessionDetailPageProps) {
  const { date, workoutKey } = useParams<{ date: string; workoutKey: string }>()
  const navigate = useNavigate()

  const { session, exercises } = useSessionDetail(
    progress,
    date || '',
    workoutKey || '',
    EXERCISE_CATALOG,
  )

  const totalSets = useMemo(
    () => exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
    [exercises],
  )

  if (!date || !workoutKey) return null

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1"
        >
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
          Volver
        </button>
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm">Sesion no encontrada</div>
        </div>
      </div>
    )
  }

  const workoutTitle = parseWorkoutKey(session.workoutKey)
  // Try to get more specific title from WORKOUTS data
  const workout = WORKOUTS[session.workoutKey]
  const displayTitle = workout?.title || workoutTitle

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
      >
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        Volver
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase mb-1">
          {formatDate(date)}
        </div>
        <h1 className="font-bebas text-3xl md:text-4xl leading-none mb-2">{displayTitle}</h1>
        <div className="text-sm text-muted-foreground">
          {workoutTitle}
          {exercises.length > 0 && (
            <span> · {exercises.length} ejercicios · {totalSets} series</span>
          )}
        </div>
      </div>

      {/* Exercise list or empty state */}
      {exercises.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-muted-foreground text-sm">Sesion completada sin series registradas</div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {exercises.map(exercise => (
            <ExerciseSection key={exercise.exerciseId} exercise={exercise} />
          ))}
        </div>
      )}

      {/* Session notes */}
      {session.note && (
        <div className="mt-6 px-4 py-3 bg-muted/30 rounded-lg border border-border">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Notas</div>
          <div className="text-sm text-muted-foreground italic">{session.note}</div>
        </div>
      )}
    </div>
  )
}
