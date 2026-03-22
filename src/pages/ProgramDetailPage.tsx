import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'
import { pb, isPocketBaseAvailable, getCurrentUser } from '../lib/pocketbase'
import { pbExerciseEditUrl } from '../lib/pocketbase-admin'
import { calculateWorkoutDuration, formatDuration } from '../lib/duration'
import { inferDifficulty, DIFFICULTY_COLORS } from '../lib/difficulty'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { PRIORITY_COLORS } from '../lib/style-tokens'
import type { ProgramMeta, Priority } from '../types'
import type { RecordModel } from 'pocketbase'
import { ShareButton } from '../components/ShareButton'
import { shareProgram } from '../lib/share'
import { ArrowLeftIcon, CopyIcon, CheckIcon, EditIcon } from '../components/icons/nav-icons'

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
  pbRecordId?: string
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'Alta',
  med: 'Media',
  low: 'Baja',
}

// ── Day order ──────────────────────────────────────────────────────────────

const DAY_ORDER = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']

function formatRelativeDate(isoDate: string): { text: string; fresh: boolean } {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000)
  const fresh = days < 7
  if (days === 0) return { text: 'hoy', fresh }
  if (days === 1) return { text: 'ayer', fresh }
  if (days < 7) return { text: `hace ${days} días`, fresh }
  if (days < 30) return { text: `hace ${Math.floor(days / 7)} sem`, fresh }
  return { text: `hace ${Math.floor(days / 30)} mes${Math.floor(days / 30) > 1 ? 'es' : ''}`, fresh }
}

// Map JS getDay() (0=Sun) to our day IDs
const JS_DAY_TO_ID: Record<number, string> = {
  0: 'dom', 1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab',
}
const TODAY_DAY_ID = JS_DAY_TO_ID[new Date().getDay()]

function ChevronIcon({ className, expanded }: { className?: string; expanded: boolean }) {
  return (
    <svg
      className={cn(className, 'transition-transform duration-200', expanded && 'rotate-180')}
      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    >
      <polyline points="4,6 8,10 12,6" />
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

interface ProgramDetailPageProps {
  programId: string
  userId?: string
  userRole?: import('../types').UserRole
  activeProgram?: ProgramMeta | null
  onBack: () => void
  onNavigateToProgram?: (programId: string) => void
  onSelectProgram?: (programId: string) => Promise<void>
  onDuplicateProgram?: (programId: string) => Promise<void>
  onDeleteProgram?: (programId: string) => Promise<void>
  onEditProgram?: (programId: string) => void
  /** If true, show as shared view (for non-logged-in or add-to-mine) */
  isSharedView?: boolean
  onLogin?: () => void
}

export default function ProgramDetailPage({
  programId,
  userId,
  userRole = 'user',
  activeProgram,
  onBack,
  onNavigateToProgram,
  onSelectProgram,
  onDuplicateProgram,
  onDeleteProgram,
  onEditProgram,
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [lastSessions, setLastSessions] = useState<Record<string, string>>({})

  const isActive = activeProgram?.id === programId
  const isOwn = program?.created_by === userId
  const currentUser = getCurrentUser()
  const isAdminOrEditor = currentUser?.role === 'admin' || currentUser?.role === 'editor'

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
      const progRecord = await pb.collection('programs').getOne(programId, { $autoCancel: false })
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
        $autoCancel: false,
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
        $autoCancel: false,
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

      // Fetch last session per workout day (for history context)
      if (userId) {
        try {
          const sessionsRes = await pb.collection('sessions').getList(1, 200, {
            filter: pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: programId }),
            sort: '-completed_at',
            $autoCancel: false,
          })
          const sessionMap: Record<string, string> = {}
          sessionsRes.items.forEach((s: RecordModel) => {
            const key = s.workout_key as string
            if (key && !sessionMap[key]) {
              sessionMap[key] = s.completed_at || s.created
            }
          })
          setLastSessions(sessionMap)
        } catch {
          // Not critical
        }
      }

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
    } catch (e: any) {
      if (e?.code === 0) return // auto-cancelled, ignore
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
  const phaseWorkouts = useMemo(() =>
    workouts
      .filter(w => w.phase === phaseNum)
      .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)),
    [workouts, phaseNum]
  )

  // Auto-expand first day when phase changes
  useEffect(() => {
    if (phaseWorkouts.length > 0) {
      setExpandedDays(new Set([`${phaseWorkouts[0].phase}_${phaseWorkouts[0].day}`]))
    }
  }, [phaseNum, phaseWorkouts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = useCallback((key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

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
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12" role="status" aria-busy="true" aria-label="Cargando programa">
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
        <button onClick={onBack} aria-label="Volver a programas" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeftIcon className="size-4" />
          <span className="font-mono text-[11px] tracking-widest uppercase">Volver</span>
        </button>
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center motion-safe:animate-scale-in">
            <svg className="size-8 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
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
      <button onClick={onBack} aria-label="Volver a programas" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 -ml-1">
        <ArrowLeftIcon className="size-4" />
        <span className="font-mono text-[11px] tracking-widest uppercase">Volver a programas</span>
      </button>

      {/* Hero section */}
      <div className="mb-10">
        <div className="text-[11px] text-muted-foreground tracking-[0.3em] mb-2 uppercase font-mono motion-safe:animate-fade-in">
          {isSharedView ? 'Programa Compartido' : 'Detalle del Programa'}
        </div>
        <h1 className="font-bebas text-4xl md:text-6xl leading-none mb-4 tracking-wide motion-safe:animate-fade-in" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>{program.name}</h1>
        {program.description && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-6 motion-safe:animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>{program.description}</p>
        )}

        {/* Meta stats */}
        <div className="flex items-center gap-4 flex-wrap mb-6 motion-safe:animate-fade-in" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
          {program.duration_weeks > 0 && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-lime font-bebas text-xl">{program.duration_weeks}</span>
                <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">semanas</span>
              </div>
              <div className="w-px h-5 bg-muted" />
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="text-lime font-bebas text-xl">{phases.length}</span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">fase{phases.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="w-px h-5 bg-muted" />
          <div className="flex items-center gap-2">
            <span className="text-lime font-bebas text-xl">{totalExercises}</span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">ejercicios</span>
          </div>
          {totalDurationMinutes > 0 && (
            <>
              <div className="w-px h-5 bg-muted" />
              <div className="flex items-center gap-2">
                <span className="text-lime font-bebas text-xl">{formatDuration(totalDurationMinutes)}</span>
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
        <div className="flex items-center gap-3 flex-wrap motion-safe:animate-fade-in" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
          {isSharedView && !userId ? (
            <Button
              onClick={onLogin}
              className="bg-lime hover:bg-lime/90 active:scale-[0.98] text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime/10 transition-transform"
            >
              REGÍSTRATE PARA USAR ESTE PROGRAMA
            </Button>
          ) : (
            <>
              {onSelectProgram && !isActive && (
                <Button
                  onClick={handleSelectProgram}
                  disabled={actionLoading === 'select'}
                  className="bg-lime hover:bg-lime/90 active:scale-[0.98] text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime/10 transition-transform"
                >
                  <CheckIcon className="size-4 mr-2" />
                  {actionLoading === 'select' ? 'ACTIVANDO...' : isSharedView ? 'AÑADIR A MIS PROGRAMAS' : 'USAR PROGRAMA'}
                </Button>
              )}
              {isActive && (
                <Button asChild className="bg-lime hover:bg-lime/90 active:scale-[0.98] text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime/10 transition-transform motion-safe:animate-workday-pulse">
                  <Link to="/workout">
                    IR A ENTRENAR
                  </Link>
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
              <ShareButton
                onShare={(method) => shareProgram(program.name, programId, method)}
                className="font-mono text-[11px] tracking-widest h-11 px-5 border-border hover:border-pink-500/50 hover:text-pink-400"
                size="default"
              />
              {onEditProgram && (isOwn || userRole === 'admin' || userRole === 'editor') && (
                <Button
                  variant="outline"
                  onClick={() => onEditProgram(programId)}
                  className="font-mono text-[11px] tracking-widest h-11 px-5 border-amber-500/20 text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5"
                >
                  <EditIcon className="size-3.5 mr-2" />
                  EDITAR
                </Button>
              )}
              {onDeleteProgram && isOwn && !isActive && (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
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
        <div className="mb-10 motion-safe:animate-fade-in" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
          <Tabs value={selectedPhase} onValueChange={setSelectedPhase}>
            <div className="relative mb-6">
              <div className="overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
                <TabsList className="bg-muted/80 border border-border p-1 gap-1 w-max md:w-auto">
                  {phases.map(phase => (
                    <TabsTrigger
                      key={phase.id}
                      value={String(phase.id)}
                      className="font-mono text-[11px] tracking-widest data-[state=active]:bg-lime/10 data-[state=active]:text-lime uppercase px-3 md:px-4 py-2 shrink-0"
                    >
                      {phase.name}
                      <span className="ml-1.5 text-[9px] text-muted-foreground hidden sm:inline">({phase.weeks})</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {/* Fade mask — right edge scroll hint (mobile only) */}
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
            </div>

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
                  <div className="text-center py-16 motion-safe:animate-fade-in">
                    <div className="font-bebas text-2xl text-muted-foreground/40 mb-2 tracking-widest">SIN EJERCICIOS</div>
                    <p className="text-sm text-muted-foreground">Esta fase aún no tiene ejercicios configurados.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {phaseWorkouts.map((workout, wi) => {
                      const dayKey = `${workout.phase}_${workout.day}`
                      const isExpanded = expandedDays.has(dayKey)
                      const workoutKey = `p${workout.phase}_${workout.day}`
                      const lastSession = lastSessions[workoutKey]
                      const sessionInfo = lastSession ? formatRelativeDate(lastSession) : null
                      const isToday = isActive && workout.day === TODAY_DAY_ID

                      return (
                        <div key={dayKey} className={cn(
                          'rounded-xl bg-muted/60 overflow-hidden motion-safe:animate-slide-up',
                          isToday && 'ring-1 ring-lime/30',
                        )} style={{ animationDelay: `${wi * 75}ms`, animationFillMode: 'both' }}>
                          {/* Day header — clickable */}
                          <button
                            type="button"
                            onClick={() => toggleDay(dayKey)}
                            className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                            aria-expanded={isExpanded}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className={cn(
                                  'font-bebas text-xl tracking-widest uppercase',
                                  isToday ? 'text-lime' : 'text-foreground',
                                )}>
                                  {workout.dayName}
                                </span>
                                {isToday && (
                                  <span className="text-[9px] font-mono tracking-widest text-lime bg-lime/10 px-1.5 py-0.5 rounded-full uppercase">
                                    Hoy
                                  </span>
                                )}
                                {workout.dayFocus && (
                                  <span className="text-[11px] text-muted-foreground font-mono tracking-wide">
                                    {workout.dayFocus}
                                  </span>
                                )}
                                <span className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase">
                                  {workout.exercises.length} ej · ~{workoutDurations[dayKey] || 0} min
                                </span>
                              </div>
                              {sessionInfo && (
                                <div className={cn(
                                  'text-[10px] font-mono mt-1',
                                  sessionInfo.fresh ? 'text-emerald-400/70' : 'text-amber-400/50',
                                )}>
                                  Último: {sessionInfo.text}
                                </div>
                              )}
                            </div>
                            <ChevronIcon className="size-4 text-muted-foreground shrink-0" expanded={isExpanded} />
                          </button>

                          {/* Exercise list — collapsible */}
                          {isExpanded && (
                            <div className="border-t border-border/60 motion-safe:animate-fade-in">
                              {workout.exercises.map((exercise, idx) => (
                                <div
                                  key={`${exercise.id}_${idx}`}
                                  className={cn(
                                    'px-5 py-4 border-l-[3px] flex items-center gap-4 hover:bg-muted/30 transition-colors',
                                    PRIORITY_COLORS[exercise.priority as Priority]?.border || 'border-l-border',
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
                                    <span className="font-bebas text-lg text-lime tracking-wide">
                                      {exercise.sets}x{exercise.reps}
                                    </span>
                                  </div>

                                  {/* Exercise info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <Link
                                        to={`/exercises/${exercise.id}`}
                                        className="text-[13px] font-semibold text-foreground truncate hover:text-lime transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {exercise.name}
                                      </Link>
                                      {isAdminOrEditor && exercise.pbRecordId && (
                                        <a
                                          href={pbExerciseEditUrl(exercise.pbRecordId)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-amber-400/60 hover:text-amber-400 transition-colors shrink-0"
                                          aria-label={`Editar ${exercise.name} en PocketBase`}
                                        >
                                          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                            <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                                          </svg>
                                        </a>
                                      )}
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[8px] font-mono px-1.5 py-0 shrink-0',
                                          PRIORITY_COLORS[exercise.priority as Priority]?.badge,
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
                          )}
                        </div>
                      )
                    })}
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
            {relatedPrograms.slice(0, 3).map((rp, ri) => (
              <button
                key={rp.id}
                type="button"
                className="group text-left cursor-pointer rounded-xl bg-muted/60 p-5 transition-all hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:animate-fade-in"
                style={{ animationDelay: `${ri * 100}ms`, animationFillMode: 'both' }}
                onClick={() => onNavigateToProgram?.(rp.id)}
              >
                <h3 className="font-bebas text-lg tracking-wide text-foreground group-hover:text-lime transition-colors mb-2 uppercase">
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
              </button>
            ))}
          </div>
        </div>
      )}
      {onDeleteProgram && (
        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Eliminar programa"
          description="¿Eliminar este programa? Esta acción no se puede deshacer."
          confirmLabel="ELIMINAR"
          cancelLabel="CANCELAR"
          variant="destructive"
          onConfirm={() => onDeleteProgram(programId)}
        />
      )}
    </div>
  )
}
