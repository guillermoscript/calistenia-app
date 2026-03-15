import { useState, useEffect, useCallback } from 'react'
import { cn } from '../lib/utils'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import type { ProgramMeta, Phase, Exercise } from '../types'
import type { RecordModel } from 'pocketbase'

// ── Types ──────────────────────────────────────────────────────────────────

interface ProgramPhase {
  id: number
  name: string
  weeks: string
  color: string
  bg: string
}

interface ProgramWorkout {
  phase: number
  day: string
  dayName: string
  dayFocus: string
  title: string
  exercises: ProgramExercise[]
}

interface ProgramExercise {
  id: string
  name: string
  sets: number | string
  reps: string
  rest: number
  muscles: string
  note: string
  youtube: string
  priority: 'high' | 'med' | 'low'
  isTimer?: boolean
  timerSeconds?: number
  demoImages?: string[]
  demoVideo?: string
}

// ── Share helper ───────────────────────────────────────────────────────────

async function shareProgram(programId: string, programName: string) {
  const url = `${window.location.origin}/shared/${programId}`
  const shareData = {
    title: programName,
    text: `Mira este programa de calistenia: ${programName}`,
    url,
  }

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData)
      return
    } catch { /* cancelled */ }
  }

  try {
    await navigator.clipboard.writeText(url)
    alert('Enlace copiado al portapapeles')
  } catch {
    prompt('Copia este enlace:', url)
  }
}

// ── Priority colors ────────────────────────────────────────────────────────

const PRIORITY_STRIPE: Record<string, string> = {
  high: 'border-l-red-500',
  med: 'border-l-amber-400',
  low: 'border-l-emerald-400',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'Alta',
  med: 'Media',
  low: 'Baja',
}

// ── Day order ──────────────────────────────────────────────────────────────

const DAY_ORDER = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']

// ── Icons ──────────────────────────────────────────────────────────────────

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="13" y1="8" x2="3" y2="8" />
      <polyline points="7,4 3,8 7,12" />
    </svg>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="3" r="2" />
      <circle cx="12" cy="13" r="2" />
      <circle cx="4" cy="8" r="2" />
      <line x1="5.8" y1="7" x2="10.2" y2="4" />
      <line x1="5.8" y1="9" x2="10.2" y2="12" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M3 11V3a1 1 0 011-1h8" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3,8 7,12 13,4" />
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

interface ProgramDetailPageProps {
  programId: string
  userId?: string
  activeProgram?: ProgramMeta | null
  programs?: ProgramMeta[]
  onBack: () => void
  onSelectProgram?: (programId: string) => Promise<void>
  onDuplicateProgram?: (programId: string) => Promise<void>
  /** If true, show as shared view (for non-logged-in or add-to-mine) */
  isSharedView?: boolean
  onLogin?: () => void
}

export default function ProgramDetailPage({
  programId,
  userId,
  activeProgram,
  onBack,
  onSelectProgram,
  onDuplicateProgram,
  isSharedView = false,
  onLogin,
}: ProgramDetailPageProps) {
  const [program, setProgram] = useState<ProgramMeta | null>(null)
  const [phases, setPhases] = useState<ProgramPhase[]>([])
  const [workouts, setWorkouts] = useState<ProgramWorkout[]>([])
  const [relatedPrograms, setRelatedPrograms] = useState<ProgramMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhase, setSelectedPhase] = useState<string>('1')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const isActive = activeProgram?.id === programId
  const isOwn = program?.created_by === userId

  // ── Fetch program data ─────────────────────────────────────────────────

  const fetchProgram = useCallback(async () => {
    setLoading(true)
    setError(null)

    const available = await isPocketBaseAvailable()
    if (!available) {
      setError('No se puede conectar con el servidor.')
      setLoading(false)
      return
    }

    try {
      // Fetch program
      const progRecord = await pb.collection('programs').getOne(programId)
      const meta: ProgramMeta = {
        id: progRecord.id,
        name: progRecord.name,
        description: progRecord.description,
        duration_weeks: progRecord.duration_weeks,
        created_by: progRecord.created_by || undefined,
      }
      setProgram(meta)

      // Fetch phases
      const phasesRes = await pb.collection('program_phases').getList(1, 20, {
        filter: pb.filter('program = {:pid}', { pid: programId }),
        sort: 'sort_order',
      })
      const builtPhases: ProgramPhase[] = phasesRes.items.map(p => ({
        id: p.phase_number,
        name: p.name,
        weeks: p.weeks,
        color: p.color,
        bg: p.bg_color,
      }))
      setPhases(builtPhases)

      if (builtPhases.length > 0) {
        setSelectedPhase(String(builtPhases[0].id))
      }

      // Fetch exercises
      const exercisesRes = await pb.collection('program_exercises').getList(1, 2000, {
        filter: pb.filter('program = {:pid}', { pid: programId }),
        sort: 'phase_number,sort_order',
      })

      // Build workouts grouped by phase+day
      const workoutMap: Record<string, ProgramWorkout> = {}
      exercisesRes.items.forEach((r: RecordModel) => {
        const key = `p${r.phase_number}_${r.day_id}`
        if (!workoutMap[key]) {
          workoutMap[key] = {
            phase: r.phase_number,
            day: r.day_id,
            dayName: r.day_name,
            dayFocus: r.day_focus,
            title: r.workout_title,
            exercises: [],
          }
        }
        workoutMap[key].exercises.push({
          id: r.exercise_id,
          name: r.exercise_name,
          sets: r.sets,
          reps: r.reps,
          rest: r.rest_seconds,
          muscles: r.muscles,
          note: r.note,
          youtube: r.youtube,
          priority: r.priority,
          isTimer: r.is_timer,
          timerSeconds: r.timer_seconds,
          demoImages: r.demo_images || [],
          demoVideo: r.demo_video || '',
        })
      })
      setWorkouts(Object.values(workoutMap))

      // Fetch related programs (others in catalog)
      try {
        const relatedRes = await pb.collection('programs').getList(1, 6, {
          filter: pb.filter('is_active = true && id != {:pid}', { pid: programId }),
          sort: 'name',
        })
        setRelatedPrograms(relatedRes.items.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          duration_weeks: p.duration_weeks,
          created_by: p.created_by || undefined,
        })))
      } catch {
        // Not critical
      }
    } catch (e) {
      console.error('ProgramDetailPage: fetch error', e)
      setError('Error al cargar el programa.')
    } finally {
      setLoading(false)
    }
  }, [programId])

  useEffect(() => {
    fetchProgram()
  }, [fetchProgram])

  // ── Actions ────────────────────────────────────────────────────────────

  const handleSelectProgram = async () => {
    if (!onSelectProgram) return
    setActionLoading('select')
    try {
      await onSelectProgram(programId)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDuplicate = async () => {
    if (!onDuplicateProgram) return
    setActionLoading('duplicate')
    try {
      await onDuplicateProgram(programId)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Phase workouts ─────────────────────────────────────────────────────

  const phaseNum = parseInt(selectedPhase)
  const phaseWorkouts = workouts
    .filter(w => w.phase === phaseNum)
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))

  const currentPhase = phases.find(p => p.id === phaseNum)

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-32 bg-muted rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    )
  }

  if (error || !program) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <Button variant="ghost" onClick={onBack} className="mb-4 text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4 mr-1.5" /> Volver
        </Button>
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm">{error || 'Programa no encontrado.'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">

      {/* Back button */}
      <Button variant="ghost" onClick={onBack} className="mb-4 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeftIcon className="size-4 mr-1.5" /> Volver a programas
      </Button>

      {/* Hero section */}
      <div className="mb-8">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-1 uppercase">
          {isSharedView ? 'Programa Compartido' : 'Detalle del Programa'}
        </div>
        <h1 className="font-bebas text-4xl md:text-5xl leading-none mb-3">{program.name}</h1>
        {program.description && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-4">{program.description}</p>
        )}

        {/* Meta badges */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {program.duration_weeks > 0 && (
            <Badge variant="secondary" className="text-[10px] font-mono bg-zinc-800 text-zinc-300 border-zinc-700">
              {program.duration_weeks} semanas
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] font-mono bg-zinc-800 text-zinc-300 border-zinc-700">
            {phases.length} fase{phases.length !== 1 ? 's' : ''}
          </Badge>
          {isOwn && (
            <Badge variant="secondary" className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border-sky-500/20">
              Creado por ti
            </Badge>
          )}
          {isActive && (
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30 font-mono">
              ACTIVO
            </Badge>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isSharedView && !userId ? (
            <Button
              onClick={onLogin}
              className="bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-zinc-900 font-bebas text-lg tracking-wide px-5"
            >
              REGISTRATE PARA USAR ESTE PROGRAMA
            </Button>
          ) : (
            <>
              {onSelectProgram && !isActive && (
                <Button
                  onClick={handleSelectProgram}
                  disabled={actionLoading === 'select'}
                  className="bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-zinc-900 font-bebas text-lg tracking-wide px-5"
                >
                  <CheckIcon className="size-4 mr-1.5" />
                  {actionLoading === 'select' ? 'ACTIVANDO...' : isSharedView ? 'ANADIR A MIS PROGRAMAS' : 'USAR PROGRAMA'}
                </Button>
              )}
              {isActive && (
                <Button disabled className="font-bebas text-lg tracking-wide px-5 opacity-60">
                  <CheckIcon className="size-4 mr-1.5" />
                  PROGRAMA ACTIVO
                </Button>
              )}
              {onDuplicateProgram && (
                <Button
                  variant="outline"
                  onClick={handleDuplicate}
                  disabled={actionLoading === 'duplicate'}
                  className="font-mono text-[11px] tracking-wide hover:border-sky-500 hover:text-sky-500"
                >
                  <CopyIcon className="size-3.5 mr-1.5" />
                  {actionLoading === 'duplicate' ? 'DUPLICANDO...' : 'DUPLICAR Y EDITAR'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => shareProgram(programId, program.name)}
                className="font-mono text-[11px] tracking-wide hover:border-pink-500 hover:text-pink-500"
              >
                <ShareIcon className="size-3.5 mr-1.5" />
                COMPARTIR
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Phase Tabs + Exercise List */}
      {phases.length > 0 && (
        <div className="mb-8">
          <Tabs value={selectedPhase} onValueChange={setSelectedPhase}>
            <TabsList className="mb-4 bg-zinc-900/50 border border-border">
              {phases.map(phase => (
                <TabsTrigger
                  key={phase.id}
                  value={String(phase.id)}
                  className="font-mono text-[11px] tracking-wide data-[state=active]:text-foreground"
                >
                  {phase.name}
                  <span className="ml-1.5 text-[9px] text-muted-foreground">({phase.weeks})</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {phases.map(phase => (
              <TabsContent key={phase.id} value={String(phase.id)}>
                {/* Phase info */}
                <div className="mb-4 px-1">
                  <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
                    Fase {phase.id} · Semanas {phase.weeks}
                  </div>
                </div>

                {/* Day workouts */}
                {phaseWorkouts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No hay ejercicios en esta fase.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {phaseWorkouts.map(workout => (
                      <Card key={`${workout.phase}_${workout.day}`} className="overflow-hidden">
                        {/* Day header */}
                        <div className="px-5 py-3 bg-zinc-900/50 border-b border-border">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bebas text-lg tracking-wide text-foreground">
                                {workout.dayName}
                              </span>
                              {workout.dayFocus && (
                                <span className="ml-2 text-[11px] text-muted-foreground">
                                  — {workout.dayFocus}
                                </span>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-[9px] font-mono bg-zinc-800 text-zinc-400">
                              {workout.exercises.length} ejercicio{workout.exercises.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          {workout.title && workout.title !== workout.dayFocus && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">{workout.title}</div>
                          )}
                        </div>

                        {/* Exercise list */}
                        <CardContent className="p-0">
                          {workout.exercises.map((exercise, idx) => (
                            <div
                              key={`${exercise.id}_${idx}`}
                              className={cn(
                                'px-5 py-3.5 border-l-[3px] flex items-start gap-3',
                                PRIORITY_STRIPE[exercise.priority] || 'border-l-zinc-600',
                                idx < workout.exercises.length - 1 && 'border-b border-border',
                              )}
                            >
                              {/* Exercise info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[13px] font-medium text-foreground">
                                    {exercise.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[8px] font-mono px-1.5 py-0',
                                      exercise.priority === 'high' && 'text-red-400 border-red-400/30',
                                      exercise.priority === 'med' && 'text-amber-400 border-amber-400/30',
                                      exercise.priority === 'low' && 'text-emerald-400 border-emerald-400/30',
                                    )}
                                  >
                                    {PRIORITY_LABEL[exercise.priority]}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                  <span>{exercise.sets} x {exercise.reps}</span>
                                  {exercise.rest > 0 && <span>Descanso: {exercise.rest}s</span>}
                                  {exercise.isTimer && exercise.timerSeconds && (
                                    <span>Timer: {exercise.timerSeconds}s</span>
                                  )}
                                </div>
                                {exercise.muscles && (
                                  <div className="text-[10px] text-muted-foreground/70 mt-1">{exercise.muscles}</div>
                                )}
                                {exercise.note && (
                                  <div className="text-[10px] text-muted-foreground/60 mt-1 italic">{exercise.note}</div>
                                )}
                              </div>

                              {/* Demo thumbnail */}
                              {exercise.demoImages && exercise.demoImages.length > 0 && exercise.demoImages[0] && (
                                <div className="w-12 h-12 rounded bg-zinc-800 overflow-hidden shrink-0">
                                  <img
                                    src={exercise.demoImages[0]}
                                    alt={exercise.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* Related programs */}
      {relatedPrograms.length > 0 && (
        <div className="mt-12 mb-8">
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-4 uppercase">
            También te puede interesar
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedPrograms.slice(0, 3).map(rp => (
              <Card
                key={rp.id}
                className="cursor-pointer transition-all hover:border-[hsl(var(--lime))]/30 group"
                onClick={() => {
                  // Navigate to this program's detail
                  window.location.hash = ''
                  // Re-render with new programId
                  window.location.reload()
                }}
              >
                <CardContent className="p-4">
                  <h3 className="font-bebas text-lg tracking-wide text-foreground group-hover:text-[hsl(var(--lime))] mb-1">
                    {rp.name}
                  </h3>
                  {rp.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{rp.description}</p>
                  )}
                  {rp.duration_weeks > 0 && (
                    <Badge variant="secondary" className="text-[9px] font-mono bg-zinc-800 text-zinc-400">
                      {rp.duration_weeks} semanas
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
