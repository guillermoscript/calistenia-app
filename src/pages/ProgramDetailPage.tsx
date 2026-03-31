import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'
import { localDay } from '../lib/dateUtils'
import { pb, isPocketBaseAvailable, getCurrentUser } from '../lib/pocketbase'
import { pbExerciseEditUrl } from '../lib/pocketbase-admin'
import { calculateWorkoutDuration, formatDuration } from '../lib/duration'
import { inferDifficulty, DIFFICULTY_COLORS } from '../lib/difficulty'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { PRIORITY_COLORS, CARDIO_ACTIVITY } from '../lib/style-tokens'
import type { ProgramMeta, Priority, CardioDayConfig, CardioActivityType } from '../types'
import type { RecordModel } from 'pocketbase'
import { ShareButton } from '../components/ShareButton'
import { shareProgram } from '../lib/share'
import { ArrowLeftIcon, CopyIcon, CheckIcon, EditIcon } from '../components/icons/nav-icons'
import { useTranslation } from 'react-i18next'
import { localize } from '../lib/i18n-db'

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
  dayType?: string
  title: string
  exercises: ProgramExercise[]
  cardioConfig?: CardioDayConfig
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

const PRIORITY_LABEL_KEY: Record<string, string> = {
  high: 'priority.high',
  med: 'priority.med',
  low: 'priority.low',
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
const TODAY_DAY_ID = JS_DAY_TO_ID[localDay()]

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
  onSelectProgram?: (programId: string) => Promise<boolean>
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
  const { t, i18n: i18nInstance } = useTranslation()
  const locale = i18nInstance.language
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
      setError(t('programDetail.cannotConnect'))
      setLoading(false)
      return
    }

    try {
      // Fetch program
      const progRecord = await pb.collection('programs').getOne(programId, { $autoCancel: false })
      const meta: ProgramMeta = {
        id: progRecord.id,
        name: localize(progRecord.name, locale),
        description: localize(progRecord.description, locale),
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
        name: localize(p.name, locale),
        weeks: p.weeks,
        color: p.color,
        bg: p.bg_color,
      }))
      setPhases(builtPhases)

      if (builtPhases.length > 0) {
        setSelectedPhase(String(builtPhases[0].id))
      }

      // Fetch exercises and day config
      const [exercisesRes, dayConfigRes] = await Promise.all([
        pb.collection('program_exercises').getList(1, 2000, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
          sort: 'phase_number,sort_order',
          $autoCancel: false,
        }),
        pb.collection('program_day_config').getList(1, 200, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
          sort: 'phase_number,sort_order',
          $autoCancel: false,
        }).catch(() => ({ items: [] })),
      ])

      // Build workouts grouped by phase+day
      const workoutMap: Record<string, ProgramWorkout> = {}

      // First, add cardio days from day config
      dayConfigRes.items.forEach((dc: RecordModel) => {
        if (dc.day_type === 'cardio') {
          const key = `p${dc.phase_number}_${dc.day_id}`
          if (!workoutMap[key]) {
            workoutMap[key] = {
              phase: dc.phase_number,
              day: dc.day_id,
              dayName: localize(dc.day_name, locale),
              dayFocus: localize(dc.day_focus, locale),
              dayType: 'cardio',
              title: localize(dc.day_focus, locale),
              exercises: [],
              cardioConfig: {
                activityType: (dc.cardio_activity_type || 'running') as CardioActivityType,
                targetDistanceKm: dc.cardio_target_distance_km || undefined,
                targetDurationMin: dc.cardio_target_duration_min || undefined,
              },
            }
          }
        }
      })

      exercisesRes.items.forEach((r: RecordModel) => {
        const key = `p${r.phase_number}_${r.day_id}`
        if (!workoutMap[key]) {
          workoutMap[key] = {
            phase: r.phase_number,
            day: r.day_id,
            dayName: localize(r.day_name, locale),
            dayFocus: localize(r.day_focus, locale),
            dayType: r.day_type,
            title: localize(r.workout_title, locale),
            exercises: [],
          }
        }
        workoutMap[key].exercises.push({
          id: r.exercise_id,
          name: localize(r.exercise_name, locale),
          sets: r.sets,
          reps: r.reps,
          rest: r.rest_seconds,
          muscles: localize(r.muscles, locale),
          note: localize(r.note, locale),
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
          name: localize(p.name, locale),
          description: localize(p.description, locale),
          duration_weeks: p.duration_weeks,
          created_by: p.created_by || undefined,
        })))
      } catch {
        // Not critical
      }
    } catch (e: any) {
      if (e?.code === 0) return // auto-cancelled, ignore
      console.error('ProgramDetailPage: fetch error', e)
      setError(t('programDetail.loadError'))
    } finally {
      setLoading(false)
    }
  }, [programId, locale])

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
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12" role="status" aria-busy="true" aria-label={t('common.loading')}>
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
        <button onClick={onBack} aria-label={t('programDetail.backToPrograms')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeftIcon className="size-4" />
          <span className="font-mono text-[11px] tracking-widest uppercase">{t('programDetail.back')}</span>
        </button>
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center motion-safe:animate-scale-in">
            <svg className="size-8 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm">{error || t('programDetail.notFound')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">

      {/* Back button */}
      <button onClick={onBack} aria-label={t('programDetail.backToPrograms')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 -ml-1">
        <ArrowLeftIcon className="size-4" />
        <span className="font-mono text-[11px] tracking-widest uppercase">{t('programDetail.backToPrograms')}</span>
      </button>

      {/* Hero section */}
      <div className="mb-10">
        <div className="text-[11px] text-muted-foreground tracking-[0.3em] mb-2 uppercase font-mono motion-safe:animate-fade-in">
          {isSharedView ? t('programDetail.sharedProgram') : t('programDetail.programDetail')}
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
                <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{t('programDetail.weeks')}</span>
              </div>
              <div className="w-px h-5 bg-muted" />
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="text-lime font-bebas text-xl">{phases.length}</span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{t('programDetail.phases', { count: phases.length })}</span>
          </div>
          <div className="w-px h-5 bg-muted" />
          <div className="flex items-center gap-2">
            <span className="text-lime font-bebas text-xl">{totalExercises}</span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{t('programDetail.exercises')}</span>
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
              <span className="text-[10px] font-mono tracking-widest text-sky-400/70 uppercase">{t('programDetail.createdByYou')}</span>
            </>
          )}
          {isActive && (
            <>
              <div className="w-px h-5 bg-muted" />
              <span className="text-[9px] font-mono tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full uppercase">{t('programDetail.active')}</span>
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
              {t('programDetail.signUpToUse')}
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
                  {actionLoading === 'select' ? t('programDetail.activating') : isSharedView ? t('programDetail.addToMine') : t('programDetail.useProgram')}
                </Button>
              )}
              {isActive && (
                <Button asChild className="bg-lime hover:bg-lime/90 active:scale-[0.98] text-zinc-900 font-bebas text-lg tracking-widest px-6 h-11 shadow-lg shadow-lime/10 transition-transform motion-safe:animate-workday-pulse">
                  <Link to="/workout">
                    {t('programDetail.goToWorkout')}
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
                  {actionLoading === 'duplicate' ? t('programDetail.duplicating') : t('programDetail.duplicate')}
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
                  {t('programDetail.edit')}
                </Button>
              )}
              {onDeleteProgram && isOwn && !isActive && (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="font-mono text-[11px] tracking-widest h-11 px-5 border-red-500/20 text-red-400 hover:border-red-500/40 hover:bg-red-500/5"
                >
                  {t('common.delete')}
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
                    {t('programDetail.phaseLabel', { id: phase.id })} · {t('programDetail.weeksLabel', { weeks: phase.weeks })}
                  </div>
                </div>

                {/* Day workouts */}
                {phaseWorkouts.length === 0 ? (
                  <div className="text-center py-16 motion-safe:animate-fade-in">
                    <div className="font-bebas text-2xl text-muted-foreground/40 mb-2 tracking-widest">{t('programDetail.noExercises')}</div>
                    <p className="text-sm text-muted-foreground">{t('programDetail.noExercisesDesc')}</p>
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
                                    {t('programDetail.today')}
                                  </span>
                                )}
                                {workout.dayFocus && (
                                  <span className="text-[11px] text-muted-foreground font-mono tracking-wide">
                                    {workout.dayFocus}
                                  </span>
                                )}
                                <span className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase">
                                  {workout.dayType === 'cardio'
                                    ? `${CARDIO_ACTIVITY[workout.cardioConfig?.activityType || 'running']?.icon || '🏃'} ${t(`cardio.${workout.cardioConfig?.activityType || 'running'}`)}`
                                    : `${workout.exercises.length} ${t('programDetail.exercises')} · ~${workoutDurations[dayKey] || 0} ${t('common.minutes')}`
                                  }
                                </span>
                              </div>
                              {sessionInfo && (
                                <div className={cn(
                                  'text-[10px] font-mono mt-1',
                                  sessionInfo.fresh ? 'text-emerald-400/70' : 'text-amber-400/50',
                                )}>
                                  {t('programDetail.lastSession')}: {sessionInfo.text}
                                </div>
                              )}
                            </div>
                            <ChevronIcon className="size-4 text-muted-foreground shrink-0" expanded={isExpanded} />
                          </button>

                          {/* Exercise list — collapsible */}
                          {isExpanded && workout.dayType === 'cardio' && (
                            <div className="border-t border-border/60 motion-safe:animate-fade-in px-5 py-6 text-center">
                              <div className="text-3xl mb-2">{CARDIO_ACTIVITY[workout.cardioConfig?.activityType || 'running']?.icon || '🏃'}</div>
                              <div className="font-bebas text-lg text-emerald-400 tracking-wide mb-1">
                                {t(`cardio.${workout.cardioConfig?.activityType || 'running'}`)}
                              </div>
                              <div className="flex justify-center gap-4 text-sm text-muted-foreground">
                                {workout.cardioConfig?.targetDistanceKm && (
                                  <span>{t('programDetail.goal')}: <strong className="text-emerald-400">{workout.cardioConfig.targetDistanceKm} km</strong></span>
                                )}
                                {workout.cardioConfig?.targetDurationMin && (
                                  <span>{t('programDetail.duration')}: <strong className="text-emerald-400">{workout.cardioConfig.targetDurationMin} min</strong></span>
                                )}
                              </div>
                            </div>
                          )}
                          {isExpanded && workout.dayType !== 'cardio' && (
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
                                        {t(PRIORITY_LABEL_KEY[exercise.priority])}
                                      </Badge>
                                    </div>
                                    {exercise.muscles && (
                                      <div className="text-[11px] text-muted-foreground">
                                        {exercise.muscles.split(',').map(m => m.trim()).filter(Boolean).join(' · ')}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/60 font-mono">
                                      {exercise.rest > 0 && <span>{t('programDetail.rest')}: {exercise.rest}s</span>}
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
          <h2 className="font-bebas text-2xl tracking-widest mb-6 uppercase">{t('programDetail.alsoInterested')}</h2>
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
                    {rp.duration_weeks} {t('programDetail.weeks')}
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
          title={t('programDetail.deleteProgram')}
          description={t('programDetail.deleteConfirm')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          variant="destructive"
          onConfirm={() => onDeleteProgram(programId)}
        />
      )}
    </div>
  )
}
