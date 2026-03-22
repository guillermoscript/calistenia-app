import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'
import { cn } from '../lib/utils'

interface ProgramPhase {
  id: string
  phase_number: number
  name: string
  weeks: number
  color: string
  bg_color: string
  sort_order: number
}

interface ProgramExercise {
  id: string
  phase_number: number
  day_id: string
  day_type: string
  day_name: string
  day_focus: string
  day_color: string
  workout_title: string
  exercise_id: string
  exercise_name: string
  sets: number
  reps: string
  rest_seconds: number
  muscles: string
  note: string
  youtube: string
  priority: number
  is_timer: boolean
  timer_seconds: number
  sort_order: number
}

interface DayGroup {
  day_id: string
  day_name: string
  day_focus: string
  day_color: string
  exercises: ProgramExercise[]
}

interface PhaseGroup {
  phase: ProgramPhase
  days: DayGroup[]
}

export default function RoutineViewPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [programName, setProgramName] = useState('')
  const [programDescription, setProgramDescription] = useState('')
  const [durationWeeks, setDurationWeeks] = useState(0)
  const [phaseGroups, setPhaseGroups] = useState<PhaseGroup[]>([])
  const [noProgram, setNoProgram] = useState(false)

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      setLoading(true)
      try {
        // Fetch user display name
        const user = await pb.collection('users').getOne(userId)
        setUserName(user.display_name || user.email?.split('@')[0] || '')

        // Fetch active program
        let userProgram: any
        try {
          userProgram = await pb.collection('user_programs').getFirstListItem(
            pb.filter('user = {:uid} && is_current = true', { uid: userId }),
            { expand: 'program', $autoCancel: false }
          )
        } catch {
          setNoProgram(true)
          setLoading(false)
          return
        }

        const program = userProgram.expand?.program
        if (!program) {
          setNoProgram(true)
          setLoading(false)
          return
        }

        setProgramName(program.name)
        setProgramDescription(program.description || '')
        setDurationWeeks(program.duration_weeks || 0)

        // Fetch phases
        const phasesRes = await pb.collection('program_phases').getList(1, 50, {
          filter: pb.filter('program = {:pid}', { pid: program.id }),
          sort: 'sort_order,phase_number',
          $autoCancel: false,
        })

        // Fetch exercises
        const exercisesRes = await pb.collection('program_exercises').getList(1, 500, {
          filter: pb.filter('program = {:pid}', { pid: program.id }),
          sort: 'phase_number,sort_order',
          $autoCancel: false,
        })

        // Group exercises by phase and day
        const groups: PhaseGroup[] = phasesRes.items.map((phase: any) => {
          const phaseExercises = exercisesRes.items.filter(
            (e: any) => e.phase_number === phase.phase_number
          ) as unknown as ProgramExercise[]

          // Group by day_id
          const dayMap = new Map<string, DayGroup>()
          for (const ex of phaseExercises) {
            if (!dayMap.has(ex.day_id)) {
              dayMap.set(ex.day_id, {
                day_id: ex.day_id,
                day_name: ex.day_name,
                day_focus: ex.day_focus,
                day_color: ex.day_color,
                exercises: [],
              })
            }
            dayMap.get(ex.day_id)!.exercises.push(ex)
          }

          return {
            phase: phase as ProgramPhase,
            days: Array.from(dayMap.values()),
          }
        })

        setPhaseGroups(groups)
      } catch (e) {
        console.error('RoutineViewPage: load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Loader label="Cargando rutina..." />
      </div>
    )
  }

  if (noProgram) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/u/${userId}`)}
          className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground mb-6"
        >
          &larr; Volver al perfil
        </Button>
        <div className="text-center text-muted-foreground text-sm py-12">
          Este usuario no tiene un programa activo
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/u/${userId}`)}
        className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground mb-6"
      >
        &larr; Volver al perfil
      </Button>

      {/* Header */}
      <div className="mb-8">
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
          Programa actual de {userName}
        </div>
        <h1 className="font-bebas text-3xl sm:text-4xl leading-none">{programName}</h1>
        {durationWeeks > 0 && (
          <div className="text-xs text-muted-foreground mt-1">{durationWeeks} semanas</div>
        )}
        {programDescription && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{programDescription}</p>
        )}
      </div>

      {/* Phases */}
      <div className="space-y-8">
        {phaseGroups.map(({ phase, days }) => (
          <div key={phase.id}>
            {/* Phase header */}
            <div
              className="flex items-center gap-3 mb-4"
            >
              <div
                className="w-1 h-8 rounded-full"
                style={{ backgroundColor: phase.color || 'hsl(var(--lime))' }}
              />
              <div>
                <div className="font-bebas text-xl leading-none">{phase.name}</div>
                {phase.weeks > 0 && (
                  <div className="text-[10px] text-muted-foreground tracking-widest mt-0.5">
                    {phase.weeks} semanas
                  </div>
                )}
              </div>
            </div>

            {/* Days */}
            <div className="space-y-3 ml-2">
              {days.map((day) => (
                <Card key={day.day_id}>
                  <CardContent className="p-4">
                    {/* Day header */}
                    <div className="flex items-center gap-2 mb-3">
                      {day.day_color && (
                        <div
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: day.day_color }}
                        />
                      )}
                      <div className="text-sm font-medium">{day.day_name}</div>
                      {day.day_focus && (
                        <span className="text-xs text-muted-foreground">- {day.day_focus}</span>
                      )}
                    </div>

                    {/* Exercises */}
                    <div className="space-y-2">
                      {day.exercises.map((ex) => (
                        <div
                          key={ex.id}
                          className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{ex.exercise_name}</div>
                            {ex.muscles && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ex.muscles.split(',').map((m: string) => m.trim()).filter(Boolean).map((muscle: string) => (
                                  <span
                                    key={muscle}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                  >
                                    {muscle}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn('text-sm font-medium', 'text-[hsl(var(--lime))]')}>
                              {ex.is_timer
                                ? `${ex.timer_seconds}s`
                                : `${ex.sets}x${ex.reps}`
                              }
                            </div>
                            {ex.rest_seconds > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                {ex.rest_seconds}s desc.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
