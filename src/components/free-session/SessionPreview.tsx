import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveSession } from '../../contexts/ActiveSessionContext'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { Exercise, Workout } from '../../types'
import catalogData from '../../data/exercise-catalog.json'
import { WORKOUTS } from '../../data/workouts'
import { SUPPLEMENTARY_EXERCISES } from '../../data/supplementary-exercises'

interface AIExercise {
  id: string
  sets: number
  reps: string
  rest: number
}

interface SessionPreviewProps {
  exercises: AIExercise[]
  onRemove: (idx: number) => void
  onReorder: (fromIdx: number, toIdx: number) => void
}

/** Build a lookup map of all known exercises from local catalogs */
function buildCatalogMap(): Map<string, Exercise> {
  const map = new Map<string, Exercise>()

  // From workouts
  for (const workout of Object.values(WORKOUTS)) {
    for (const ex of workout.exercises) {
      if (!map.has(ex.id)) {
        map.set(ex.id, ex)
      }
    }
  }

  // From supplementary
  for (const ex of SUPPLEMENTARY_EXERCISES) {
    if (!map.has(ex.id)) {
      map.set(ex.id, ex as unknown as Exercise)
    }
  }

  // From catalog JSON
  const categories = (catalogData as any).categories || {}
  for (const catData of Object.values(categories) as any[]) {
    for (const ex of catData.exercises || []) {
      if (!map.has(ex.id)) {
        map.set(ex.id, {
          id: ex.id,
          name: typeof ex.name === 'object' ? (ex.name.es || ex.name.en || ex.id) : (ex.name || ex.id),
          muscles: typeof ex.muscles === 'object' ? (ex.muscles.es || ex.muscles.en || '') : (ex.muscles || ''),
          sets: ex.sets ?? 3,
          reps: ex.reps || '8-12',
          rest: ex.rest ?? 60,
          note: typeof ex.note === 'object' ? (ex.note.es || ex.note.en || '') : (ex.note || ''),
          youtube: ex.youtube_query || '',
          priority: ex.priority || 'med',
          isTimer: ex.isTimer || false,
          timerSeconds: ex.timerSeconds,
          demoImages: ex.images?.length ? ex.images : undefined,
        })
      }
    }
  }

  return map
}

/** Parse JSON exercise blocks from AI markdown response */
export function parseExercisesFromMarkdown(text: string): AIExercise[] {
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      const exercises = parsed.exercises || parsed
      if (Array.isArray(exercises)) {
        return exercises.filter((e: any) => e && typeof e.id === 'string')
      }
    } catch { /* try next block */ }
  }
  return []
}

export default function SessionPreview({ exercises, onRemove, onReorder }: SessionPreviewProps) {
  const catalogMap = useMemo(() => buildCatalogMap(), [])
  const { startSession } = useActiveSession()
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)

  // Resolve AI exercises to full Exercise objects, discarding unknowns
  const resolvedExercises = useMemo(() => {
    return exercises
      .map(aiEx => {
        const catalogEx = catalogMap.get(aiEx.id)
        if (!catalogEx) return null
        return {
          ...catalogEx,
          sets: aiEx.sets,
          reps: aiEx.reps,
          rest: aiEx.rest,
        }
      })
      .filter((ex): ex is NonNullable<typeof ex> => ex !== null) as Exercise[]
  }, [exercises, catalogMap])

  const handleStart = useCallback(() => {
    if (resolvedExercises.length === 0 || starting) return
    setStarting(true)
    const workout: Workout = {
      phase: 0,
      day: 'lun',
      title: 'Sesión IA',
      exercises: resolvedExercises,
    }
    startSession(workout, `free_${Date.now()}`, 'free')
    navigate('/session')
  }, [resolvedExercises, starting, startSession, navigate])

  if (exercises.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground tracking-[2px] uppercase">Tu sesión</div>
          <span className="text-[10px] text-muted-foreground">
            {resolvedExercises.length} ejercicios
            {resolvedExercises.length < exercises.length && (
              <span className="text-amber-400 ml-1">
                ({exercises.length - resolvedExercises.length} no encontrados)
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="px-2 py-2 max-h-[40vh] overflow-y-auto space-y-0.5">
        {exercises.map((aiEx, idx) => {
          const resolved = catalogMap.get(aiEx.id)
          const name = resolved
            ? (typeof resolved.name === 'string' ? resolved.name : aiEx.id)
            : aiEx.id
          const muscles = resolved?.muscles || ''

          return (
            <div key={`${aiEx.id}-${idx}`}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-2 group transition-colors',
                resolved ? 'hover:bg-accent/30' : 'opacity-40 line-through'
              )}>
              <span className="font-mono text-[10px] text-muted-foreground w-4 text-right shrink-0">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate leading-tight">{name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {muscles && <span className="text-[10px] text-muted-foreground truncate">{muscles}</span>}
                  <span className="text-[10px] text-muted-foreground/40">·</span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">{aiEx.sets}×{aiEx.reps}</span>
                  <span className="text-[10px] text-muted-foreground/40">·</span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">{aiEx.rest}s</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                {idx > 0 && (
                  <button onClick={() => onReorder(idx, idx - 1)}
                    className="p-1.5 rounded hover:bg-accent transition-colors">
                    <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4,10 8,6 12,10" /></svg>
                  </button>
                )}
                {idx < exercises.length - 1 && (
                  <button onClick={() => onReorder(idx, idx + 1)}
                    className="p-1.5 rounded hover:bg-accent transition-colors">
                    <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4,6 8,10 12,6" /></svg>
                  </button>
                )}
                <button onClick={() => onRemove(idx)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                  <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {resolvedExercises.length > 0 && (
        <div className="p-3 border-t border-border">
          <Button
            onClick={handleStart}
            disabled={starting}
            className="w-full font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] text-[hsl(var(--lime-foreground))] hover:bg-[hsl(var(--lime))]/90"
          >
            Empezar sesión
          </Button>
        </div>
      )}
    </div>
  )
}
