import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'
import { pb, isPocketBaseAvailable, getCurrentUser } from '../lib/pocketbase'
import { pbProgramEditUrl, pbExerciseEditUrl } from '../lib/pocketbase-admin'
import { calculateWorkoutDuration, formatDuration } from '../lib/duration'
import { inferDifficulty, DIFFICULTY_COLORS } from '../lib/difficulty'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import type { ProgramMeta } from '../types'
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
  onBack: () => void
  onNavigateToProgram?: (programId: string) => void
  onSelectProgram?: (programId: string) => Promise<void>
  onDuplicateProgram?: (programId: string) => Promise<void>
  onDeleteProgram?: (programId: string) => Promise<void>
  /** If true, show as shared view (for non-logged-in or add-to-mine) */
  isSharedView?: boolean
  onLogin?: () => void
}

export default function ProgramDetailPage({
  programId,
  userId,
  activeProgram,
  onBack,
  onNavigateToProgram,
  onSelectProgram,
  onDuplicateProgram,
  onDeleteProgram,
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
          pbRecordId: r.id,
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

  // Total exercise count
  const totalExercises = workouts.reduce((sum, w) => sum + w.exercises.length, 0)

  // Difficulty level
  const allExercises = useMemo(() => workouts.flatMap(w => w.exercises), [workouts])
  const difficulty = useMemo(() => inferDifficulty(allExercises), [allExercises])
  const diffStyle = DIFFICULTY_COLORS[difficulty]

  // Total estimated duration (sum of all workout durations)
  const totalDurationMinutes = useMemo(() => {
    return workouts.reduce((sum, w) => sum + calculateWorkoutDuration(w.exercises), 0)
  }, [workouts])

  // Per-workout duration for phase workouts
  const workoutDurations = useMemo(() => {
    const map: Record<string, number> = {}
    phaseWorkouts.forEach(w => {
      map[`${w.phase}_${w.day}`] = calculateWorkoutDuration(w.exercises)
    })
    return map
  }, [phaseWorkouts])

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-muted rounded w-24" />
          <div className="h-14 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="flex gap-3">
            <div className="h-10 bg-muted rounded w-40" />
            <div className="h-10 bg-muted rounded w-32" />
          </div>
          <div className="h-[1px] bg-muted" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-muted rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  if (error || !program) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeftIcon className="size-4" />
          <span className="font-mono text-[11px] tracking-widest uppercase">Volver</span>
        </button>
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center">
            <svg className="size-8 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm">{error || 'Programa no encontrado.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">

      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 -ml-1">
        <ArrowLeftIcon className="size-4" />
        <span className="font-mono text-[11px] tracking-widest uppercase">Volver a programas</span>
      </button>

      {/* Hero section */}
      <div className="mb-10">
        <div className="text-[11px] text-muted-foreground tracking-[0.3em] mb-2 uppercase font-mono">
          {isSharedView ? 'Programa Compartido' : 'Detalle del Programa'}
        </div>
        <h1 className="font-bebas text-4xl md:text-6xl leading-none mb-4 tracking-wide">{program.name}</h1>
        {program.description && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-6">{program.description}</p>
        )}

        {/* Meta stats */}
        <div className="flex items-center gap-4 flex-wrap mb-6">
          {program.duration_weeks > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-lime-400 font-bebas text-xl">{program.duration_weeks}</span>
              <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">semanas</span>
            </div>
          )}
          <div className="w-px h-5 bg-muted" />
          <div className="flex items-center gap-2">
            <span className="text-lime-400 font-bebas text-xl">{phases.length}</span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">fase{phases.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="w-px h-5 bg-muted" />
          <div className="flex items-center gap-2">
            <span className="text-lime-400 font-bebas text-xl">{totalExercises}</span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">ejercicios</span>
          </div>
          {totalDurationMinutes > 0 && (
            <>
              <div className="w-px h-5 bg-muted" />
              <div className="flex items-center gap-2">
                <span className="text-lime-400 font-bebas text-xl">{formatDuration(totalDurationMinutes)}</span>
                <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">total est.</span>
              </div>
            </>
          )}
          <div className="w-px h-5 bg-muted" />
          <Badge
            variant="outline"
            className={cn(
              'text-[9px] px-2.5 py-0.5 font-mono tracking-widest border',
              diffStyle.text, diffStyle.bg, diffStyle.border
            )}
          >
            {difficulty.toUpperCase()}
          </Badge>
          {isOwn && (
            <>
              <div className="w-px h-5 bg-muted" />
              <span className="text-[10px] font-mono tracking-widest text-sky-400/70 uppercase">Creado por ti</span>
            </>
          )}
          {isActive && (
            <>
              <div className="w-px h-5 bg-muted" />
              <span className="text-[9px] font-mono tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full uppercase">Activo</span>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {isSharedView && !userId ? (
            <Button
              onClick={onLogin}
              className="bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime-400/10"
            >
              REGISTRATE PARA USAR ESTE PROGRAMA
            </Button>
          ) : (
            <>
              {onSelectProgram && !isActive && (
                <Button
                  onClick={handleSelectProgram}
                  disabled={actionLoading === 'select'}
                  className="bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime-400/10"
                >
                  <CheckIcon className="size-4 mr-2" />
                  {actionLoading === 'select' ? 'ACTIVANDO...' : isSharedView ? 'ANADIR A MIS PROGRAMAS' : 'USAR PROGRAMA'}
                </Button>
              )}
              {isActive && (
                <Button disabled className="font-bebas text-lg tracking-widest px-6 h-11 opacity-50">
                  <CheckIcon className="size-4 mr-2" />
                  PROGRAMA ACTIVO
                </Button>
              )}
              {onDuplicateProgram && (
                <Button
                  variant="outline"
                  onClick={handleDuplicate}
                  disabled={actionLoading === 'duplicate'}
                  className="font-mono text-[11px] tracking-widest h-11 px-5 border-border hover:border-sky-500/50 hover:text-sky-400"
                >
                  <CopyIcon className="size-3.5 mr-2" />
                  {actionLoading === 'duplicate' ? 'DUPLICANDO...' : 'DUPLICAR'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => shareProgram(programId, program.name)}
                className="font-mono text-[11px] tracking-widest h-11 px-5 border-border hover:border-pink-500/50 hover:text-pink-400"
              >
                <ShareIcon className="size-3.5 mr-2" />
                COMPARTIR
              </Button>
              {(() => {
                const u = getCurrentUser()
                const role = u?.role as string | undefined
                return (role === 'admin' || role === 'editor') ? (
                  <Button
                    variant="outline"
                    onClick={() => window.open(pbProgramEditUrl(programId), '_blank')}
                    className="font-mono text-[11px] tracking-widest h-11 px-5 border-amber-500/20 text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5"
                  >
                    EDITAR EN PB ↗
                  </Button>
                ) : null
              })()}
              {onDeleteProgram && isOwn && !isActive && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm('¿Eliminar este programa? Esta accion no se puede deshacer.')) {
                      onDeleteProgram(programId)
                    }
                  }}
                  className="font-mono text-[11px] tracking-widest h-11 px-5 border-red-500/20 text-red-400 hover:border-red-500/40 hover:bg-red-500/5"
                >
                  ELIMINAR
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-muted/60 mb-8" />

      {/* Phase Tabs + Exercise List */}
      {phases.length > 0 && (
        <div className="mb-10">
          <Tabs value={selectedPhase} onValueChange={setSelectedPhase}>
            <TabsList className="mb-6 bg-muted/80 border border-border p-1 gap-1">
              {phases.map(phase => (
                <TabsTrigger
                  key={phase.id}
                  value={String(phase.id)}
                  className="font-mono text-[11px] tracking-widest data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-400 uppercase px-4 py-2"
                >
                  {phase.name}
                  <span className="ml-2 text-[9px] text-muted-foreground">({phase.weeks})</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {phases.map(phase => (
              <TabsContent key={phase.id} value={String(phase.id)}>
                {/* Phase info */}
                <div className="mb-5">
                  <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase font-mono">
                    Fase {phase.id} · Semanas {phase.weeks}
                  </div>
                </div>

                {/* Day workouts */}
                {phaseWorkouts.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-sm">
                    No hay ejercicios en esta fase.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {phaseWorkouts.map(workout => (
                      <div key={`${workout.phase}_${workout.day}`} className="rounded-xl bg-muted/60 overflow-hidden">
                        {/* Day header */}
                        <div className="px-5 py-4 border-b border-border/60">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="font-bebas text-xl tracking-widest text-foreground uppercase">
                                {workout.dayName}
                              </span>
                              {workout.dayFocus && (
                                <span className="text-[11px] text-muted-foreground font-mono tracking-wide">
                                  {workout.dayFocus}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {workoutDurations[`${workout.phase}_${workout.day}`] > 0 && (
                                <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                                  ~{workoutDurations[`${workout.phase}_${workout.day}`]} min
                                </span>
                              )}
                              <span className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase">
                                {workout.exercises.length} ejercicio{workout.exercises.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                          {workout.title && workout.title !== workout.dayFocus && (
                            <div className="text-[11px] text-muted-foreground mt-1">{workout.title}</div>
                          )}
                        </div>

                        {/* Exercise list */}
                        <div>
                          {workout.exercises.map((exercise, idx) => (
                            <div
                              key={`${exercise.id}_${idx}`}
                              className={cn(
                                'px-5 py-4 border-l-[3px] flex items-center gap-4 hover:bg-muted/30 transition-colors',
                                PRIORITY_STRIPE[exercise.priority] || 'border-l-border',
                                idx < workout.exercises.length - 1 && 'border-b border-border/40',
                              )}
                            >
                              {/* Demo thumbnail */}
                              {exercise.demoImages && exercise.demoImages.length > 0 && exercise.demoImages[0] && (
                                <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden shrink-0">
                                  <img
                                    src={exercise.demoImages[0]}
                                    alt={exercise.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              )}

                              {/* Sets x Reps in accent */}
                              <div className="shrink-0 w-16 text-center">
                                <span className="font-bebas text-lg text-lime-400 tracking-wide">
                                  {exercise.sets}x{exercise.reps}
                                </span>
                              </div>

                              {/* Exercise info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <Link
                                    to={`/exercises/${exercise.id}`}
                                    className="text-[13px] font-semibold text-foreground truncate hover:text-lime-400 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {exercise.name}
                                  </Link>
                                  {(() => {
                                    const u = getCurrentUser()
                                    const role = u?.role as string | undefined
                                    return (role === 'admin' || role === 'editor') && exercise.pbRecordId ? (
                                      <a
                                        href={pbExerciseEditUrl(exercise.pbRecordId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-amber-400/60 hover:text-amber-400 transition-colors shrink-0"
                                        title="Editar en PocketBase"
                                      >
                                        <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                                        </svg>
                                      </a>
                                    ) : null
                                  })()}
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[8px] font-mono px-1.5 py-0 shrink-0',
                                      exercise.priority === 'high' && 'text-red-400 border-red-400/30',
                                      exercise.priority === 'med' && 'text-amber-400 border-amber-400/30',
                                      exercise.priority === 'low' && 'text-emerald-400 border-emerald-400/30',
                                    )}
                                  >
                                    {PRIORITY_LABEL[exercise.priority]}
                                  </Badge>
                                </div>
                                {exercise.muscles && (
                                  <div className="text-[11px] text-muted-foreground">
                                    {exercise.muscles.split(',').map(m => m.trim()).filter(Boolean).join(' · ')}
                                  </div>
                                )}
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/60 font-mono">
                                  {exercise.rest > 0 && <span>Descanso: {exercise.rest}s</span>}
                                  {exercise.isTimer && exercise.timerSeconds && (
                                    <span>Timer: {exercise.timerSeconds}s</span>
                                  )}
                                </div>
                                {exercise.note && (
                                  <div className="text-[10px] text-muted-foreground/60 mt-1 italic">{exercise.note}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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
        <div className="mt-16 mb-8">
          <h2 className="font-bebas text-2xl tracking-widest mb-6 uppercase">También te puede interesar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedPrograms.slice(0, 3).map(rp => (
              <div
                key={rp.id}
                className="group cursor-pointer rounded-xl bg-muted/60 p-5 transition-all hover:bg-muted/60"
                onClick={() => onNavigateToProgram?.(rp.id)}
              >
                <h3 className="font-bebas text-lg tracking-wide text-foreground group-hover:text-lime-400 transition-colors mb-2 uppercase">
                  {rp.name}
                </h3>
                {rp.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3">{rp.description}</p>
                )}
                {rp.duration_weeks > 0 && (
                  <span className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase">
                    {rp.duration_weeks} semanas
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
