import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PHASES as FALLBACK_PHASES } from '../data/workouts'
import WeekPlanWidget from '../components/WeekPlanWidget'
import ProgramSelectorModal from '../components/ProgramSelectorModal'
import { cn } from '../lib/utils'
import { PHASE_COLORS } from '../lib/style-tokens'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import WaterTracker from '../components/WaterTracker'
import WorkoutReminderWidget from '../components/WorkoutReminderWidget'
import CardioWidget from '../components/cardio/CardioWidget'
import SleepDashboardWidget from '../components/sleep/SleepDashboardWidget'
import type { SleepLastEntry } from '../components/sleep/SleepDashboardWidget'
import LeaderboardWidget from '../components/friends/LeaderboardWidget'
import ActivityFeedWidget from '../components/friends/ActivityFeedWidget'
import { useWater } from '../hooks/useWater'
import { useSleep } from '../hooks/useSleep'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useActivityFeed } from '../hooks/useActivityFeed'
import type { Settings, Phase, WeekDay, ProgramMeta, CardioSession } from '../types'
import type { CardioAggregateStats } from '../hooks/useCardioStats'


// ── Quick Action Card ────────────────────────────────────────────────────────

interface QuickActionProps {
  icon: React.ReactNode
  label: string
  description: string
  accent: string
  onClick: () => void
}

function QuickAction({ icon, label, description, accent, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left p-3 sm:p-4 bg-card border border-border rounded-xl min-h-[56px]',
        'hover:border-current transition-all duration-200',
        'hover:shadow-sm active:scale-[0.98]',
        accent,
      )}
    >
      <div className="flex items-center sm:items-start gap-2.5 sm:gap-3">
        <div className={cn(
          'size-9 sm:size-10 rounded-lg flex items-center justify-center shrink-0 text-lg',
          'bg-current/10 transition-colors',
        )}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] sm:text-sm font-medium text-foreground group-hover:text-current transition-colors">{label}</div>
          <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 hidden sm:block">{description}</div>
        </div>
      </div>
    </button>
  )
}


// ── Goal Card ────────────────────────────────────────────────────────────────

interface GoalDef {
  label: string
  key: string
  unit: string
  goal: number
  accent: string
  border: string
}

const GOALS: GoalDef[] = [
  { label: 'Pull-ups seguidas',  key: 'pr_pullups',   unit: 'reps', goal: 20, accent: 'text-sky-500',  border: 'border-l-sky-500' },
  { label: 'Push-ups',           key: 'pr_pushups',   unit: 'reps', goal: 50, accent: 'text-lime',     border: 'border-l-lime' },
  { label: 'L-sit',              key: 'pr_lsit',      unit: 's',    goal: 30, accent: 'text-amber-400',border: 'border-l-amber-400' },
  { label: 'Pistol Squat',       key: 'pr_pistol',    unit: 'reps', goal: 1,  accent: 'text-pink-500', border: 'border-l-pink-500' },
  { label: 'Handstand libre',    key: 'pr_handstand', unit: 's',    goal: 60, accent: 'text-red-500',  border: 'border-l-red-500' },
]

interface GoalCardProps {
  goal: GoalDef
  current: number
  onUpdate: (val: number) => void
}

function GoalCard({ goal, current, onUpdate }: GoalCardProps) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const pct = Math.min(100, ((current || 0) / goal.goal) * 100)
  const reached = pct >= 100

  const handleSubmit = () => {
    const n = parseFloat(inputVal)
    if (!isNaN(n) && n >= 0) onUpdate(n)
    setEditing(false)
    setInputVal('')
  }

  return (
    <div className={cn('px-4 py-3.5 bg-card rounded-lg border border-border border-l-[3px]', goal.border, reached && 'border-lime/30')}>
      <div className="flex justify-between items-center mb-2.5">
        <div className={cn('text-[13px]', reached ? 'text-lime' : 'text-foreground')}>{goal.label}</div>
        <div className="text-[11px] text-muted-foreground">
          <span className={cn(reached ? 'text-emerald-500' : goal.accent)}>{current || 0}</span>
          <span className="text-muted-foreground"> / {goal.goal}{goal.unit}</span>
        </div>
      </div>
      <Progress value={pct} className="h-1.5 mb-2.5" />
      {editing ? (
        <div className="flex gap-2 items-center">
          <Input
            autoFocus
            type="number"
            min="0"
            value={inputVal}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputVal(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder={`Ej: ${current || goal.goal}`}
            className="flex-1 h-8 text-xs"
            aria-label={goal.label}
          />
          <Button size="sm" onClick={handleSubmit} className="h-8 px-3 text-xs">GUARDAR</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-8 px-2 text-xs">✕</Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          className="h-9 sm:h-7 px-3 sm:px-2.5 text-[11px] tracking-wide hover:border-lime hover:text-lime"
        >
          REGISTRAR PR
        </Button>
      )}
    </div>
  )
}


// ── Greeting helper ──────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos dias'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatToday(): string {
  return new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}


// ── Dashboard Page ───────────────────────────────────────────────────────────

interface DashboardPageProps {
  settings: Settings
  getTotalSessions: () => number
  getLongestStreak: () => number
  getWeeklyDoneCount: () => number
  getMonthActivity: () => Record<string, boolean>
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  usePB: boolean
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getLastSessionDate: () => string | null
  onGoToWorkout: () => void
  activeProgram: ProgramMeta | null
  programs: ProgramMeta[]
  phases: Phase[]
  weekDays: WeekDay[]
  onSelectProgram: (programId: string) => Promise<void>
  onCreateProgram?: () => void
  onEditProgram?: (programId: string) => void
  onDuplicateProgram?: (programId: string) => void
  userId?: string
  nutritionTotals?: { calories: number; protein: number; carbs: number; fat: number }
  nutritionGoals?: { dailyCalories: number } | null
  onGoToNutrition?: () => void
  cardioWeeklyStats?: CardioAggregateStats
  cardioLastSession?: CardioSession | null
  onGoToCardio?: () => void
}

export default function DashboardPage({
  settings, getTotalSessions, getLongestStreak, getWeeklyDoneCount, getMonthActivity,
  updateSettings, usePB, isWorkoutDone, getLastSessionDate, onGoToWorkout,
  activeProgram, programs, phases: phasesProp, weekDays, onSelectProgram,
  onCreateProgram, onEditProgram, onDuplicateProgram, userId,
  nutritionTotals, nutritionGoals, onGoToNutrition,
  cardioWeeklyStats, cardioLastSession, onGoToCardio,
}: DashboardPageProps) {
  const navigate = useNavigate()
  const PHASES = phasesProp || FALLBACK_PHASES
  const [showProgramModal, setShowProgramModal] = useState(false)
  const { todayTotal: waterTotal, goal: waterGoal, addWater } = useWater(userId ?? null)
  const { entries: leaderboardEntries, load: loadLeaderboard } = useLeaderboard(userId ?? null)
  const { items: feedItems, load: loadFeed } = useActivityFeed(userId ?? null)
  const { entries: sleepEntries } = useSleep(userId ?? null)
  const sleepLastEntry: SleepLastEntry | null = useMemo(() => {
    if (sleepEntries.length === 0) return null
    const e = sleepEntries[0] // already sorted by date desc
    return { date: e.date, duration_minutes: e.duration_minutes, quality: e.quality, bedtime: e.bedtime, wake_time: e.wake_time }
  }, [sleepEntries])
  useEffect(() => { if (userId) { loadLeaderboard(); loadFeed() } }, [userId, loadLeaderboard, loadFeed])
  const weeklyLeaderboard = leaderboardEntries.sessions_week
  const totalSessions = getTotalSessions()
  const streak = getLongestStreak()
  const weeklyDone = getWeeklyDoneCount()
  const monthActivity = getMonthActivity()
  const phase = PHASES.find(p => p.id === settings.phase) || PHASES[0]
  const phaseAccent = PHASE_COLORS[phase.id] || PHASE_COLORS[1]
  const startDate = settings.startDate ? new Date(settings.startDate) : new Date()
  const daysElapsed = Math.floor((new Date().getTime() - startDate.getTime()) / 86400000)
  const weekElapsed = Math.floor(daysElapsed / 7) + 1
  const totalWeeks = activeProgram?.duration_weeks || 26
  const progress = Math.min(100, (daysElapsed / (totalWeeks * 7)) * 100)
  const calDays = Object.entries(monthActivity)
  const today_str = new Date().toISOString().split('T')[0]

  const daysSinceLastSession = useMemo(() => {
    const last = getLastSessionDate ? getLastSessionDate() : null
    if (!last) return null
    return Math.floor((new Date().getTime() - new Date(last).getTime()) / 86400000)
  }, [getLastSessionDate])

  const showNudge = daysSinceLastSession !== null && daysSinceLastSession >= 3

  const [showConfig, setShowConfig] = useState(false)

  // Build display name from userId or fallback
  const greeting = getGreeting()
  const todayFormatted = formatToday()

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">

      {/* ═══ WELCOME HEADER ═══════════════════════════════════════════════════ */}
      <div className="mb-6">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase mb-1">
          {todayFormatted}
        </div>
        <h1 className="font-bebas leading-none mb-1 text-4xl md:text-5xl">
          {greeting}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            Semana <strong className="text-foreground">{Math.min(weekElapsed, totalWeeks)}</strong> de {totalWeeks}
            {activeProgram && (
              <span className="text-lime"> · {activeProgram.name}</span>
            )}
          </div>
          <Badge variant={usePB ? 'outline' : 'secondary'} className={cn('text-[9px]', usePB ? 'text-emerald-600 border-emerald-500/40 bg-emerald-500/10' : 'text-amber-600 border-amber-500/40 bg-amber-500/10')}>
            {usePB ? '● Sincronizado' : '● Solo local'}
          </Badge>
        </div>
      </div>

      {/* Nudge — prominent when present */}
      {showNudge && (
        <div className="mb-6 p-4 md:p-5 bg-amber-500/5 border border-amber-500/30 rounded-xl flex items-center gap-4 flex-wrap">
          <div className="flex-1">
            <div className="text-[10px] text-amber-600 dark:text-amber-400 tracking-widest mb-1 uppercase">
              Llevas {daysSinceLastSession} dias sin entrenar
            </div>
            <div className="text-sm text-muted-foreground">No pierdas el ritmo — incluso 20 minutos hacen la diferencia.</div>
          </div>
          <Button
            onClick={onGoToWorkout}
            className="bg-amber-500 hover:bg-amber-400 text-white font-bebas text-lg tracking-wide w-full sm:w-auto"
          >
            ENTRENAR HOY
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <div id="tour-progress" className="mb-6">
        <div className="flex justify-between mb-2">
          <span className={cn('text-[11px]', phaseAccent.text)}>{phase.name} · Semanas {phase.weeks}</span>
          <span className="text-[11px] text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* ═══ TODAY'S WORKOUT HERO ══════════════════════════════════════════ */}
      {(() => {
        const todayDayId = (['dom','lun','mar','mie','jue','vie','sab'] as const)[new Date().getDay()]
        const todayDay = weekDays.find(d => d.id === todayDayId)
        const todayIsRest = todayDay?.type === 'rest'
        const todayWorkoutKey = `p${settings.phase || 1}_${todayDayId}`
        const todayDone = isWorkoutDone(todayWorkoutKey)

        return (
          <div
            className={cn(
              'mb-6 p-5 rounded-xl border-2 transition-all',
              todayDone
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : todayIsRest
                  ? 'border-border bg-card'
                  : 'border-[hsl(var(--lime))]/30 bg-[hsl(var(--lime))]/5 cursor-pointer hover:border-[hsl(var(--lime))]/50 active:scale-[0.99]',
            )}
            onClick={() => !todayIsRest && !todayDone && navigate(`/workout?day=${todayDayId}`)}
            role={!todayIsRest && !todayDone ? 'button' : undefined}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">
                  {todayDone ? 'Entrenamiento de hoy' : todayIsRest ? 'Hoy toca descanso' : 'Entrenamiento de hoy'}
                </div>
                <div className="font-bebas text-2xl md:text-3xl leading-none">
                  {todayDone ? (
                    <span className="text-emerald-500">COMPLETADO</span>
                  ) : todayIsRest ? (
                    <span className="text-muted-foreground">DIA DE DESCANSO</span>
                  ) : (
                    <span className="text-[hsl(var(--lime))]">{todayDay?.focus || 'ENTRENAR'}</span>
                  )}
                </div>
                {activeProgram && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {activeProgram.name} · Fase {settings.phase || 1}
                  </div>
                )}
              </div>
              {todayDone ? (
                <div className="size-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg className="size-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
              ) : todayIsRest ? (
                <div className="text-3xl shrink-0">🧘</div>
              ) : (
                <div className="size-12 rounded-full bg-[hsl(var(--lime))]/10 flex items-center justify-center shrink-0">
                  <svg className="size-6 text-[hsl(var(--lime))]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ═══ QUICK ACTIONS ═══════════════════════════════════════════════════ */}
      <div className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <QuickAction
            icon={<svg className="size-5 text-lime" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="6" width="3" height="4" rx="0.5" /><rect x="12" y="6" width="3" height="4" rx="0.5" /><line x1="4" y1="8" x2="12" y2="8" /><rect x="2.5" y="5" width="2" height="6" rx="0.5" /><rect x="11.5" y="5" width="2" height="6" rx="0.5" /></svg>}
            label="Entrenar"
            description="Seguir tu programa de hoy"
            accent="text-lime"
            onClick={onGoToWorkout}
          />
          <QuickAction
            icon={<svg className="size-5 text-amber-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 1v4a3 3 0 006 0V1" /><line x1="8" y1="8" x2="8" y2="15" /><line x1="5" y1="1" x2="5" y2="5" /><line x1="8" y1="1" x2="8" y2="4" /><line x1="11" y1="1" x2="11" y2="5" /></svg>}
            label="Nutricion"
            description="Registrar comidas y macros"
            accent="text-amber-400"
            onClick={() => navigate('/nutrition')}
          />
          <QuickAction
            icon={<svg className="size-5 text-sky-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="3" r="1.5" /><path d="M5 16l2-5 3 2v5" /><path d="M8 8l-3 3 1.5 1" /><path d="M8 8l2-2 3 1" /></svg>}
            label="Cardio"
            description="Correr, caminar o pedalear con GPS"
            accent="text-sky-500"
            onClick={() => navigate('/cardio')}
          />
          <QuickAction
            icon={<svg className="size-5 text-pink-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2" /><line x1="5" y1="6" x2="11" y2="6" /><line x1="5" y1="8.5" x2="11" y2="8.5" /><line x1="5" y1="11" x2="9" y2="11" /><polyline points="10,3 12,5 14,1" strokeWidth="2" /></svg>}
            label="Sesion Libre"
            description="Entrena lo que quieras hoy"
            accent="text-pink-500"
            onClick={() => navigate('/free-session')}
          />
          <QuickAction
            icon={<svg className="size-5 text-red-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="1" x2="8" y2="15" /><rect x="5" y="3" width="6" height="2.5" rx="0.5" /><rect x="5" y="6.75" width="6" height="2.5" rx="0.5" /><rect x="5" y="10.5" width="6" height="2.5" rx="0.5" /></svg>}
            label="Lumbar"
            description="Rutina de espalda baja"
            accent="text-red-500"
            onClick={() => navigate('/lumbar')}
          />
          <QuickAction
            icon={<svg className="size-5 text-purple-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1,12 5,7 8,9 12,4 15,6" /><line x1="1" y1="14" x2="15" y2="14" /></svg>}
            label="Progreso"
            description="Ver tu historial y estadisticas"
            accent="text-purple-500"
            onClick={() => navigate('/progress')}
          />
        </div>
      </div>

      {/* ═══ TODAY'S SNAPSHOT ═════════════════════════════════════════════════ */}
      <div className={cn('grid grid-cols-1 gap-4 mb-6', 'sm:grid-cols-2 lg:grid-cols-3')}>
        {onGoToNutrition && (
          <button onClick={onGoToNutrition} className="text-left p-4 bg-card border border-border rounded-xl hover:border-lime/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative size-11 shrink-0" role="img" aria-label={`${nutritionGoals ? Math.round(((nutritionTotals?.calories || 0) / nutritionGoals.dailyCalories) * 100) : 0}% de calorias diarias`}>
                <svg width="44" height="44" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" className="text-muted" strokeWidth="4" />
                  <circle
                    cx="22" cy="22" r="17"
                    fill="none" stroke="currentColor"
                    className={cn(
                      nutritionGoals && nutritionTotals && nutritionTotals.calories > nutritionGoals.dailyCalories
                        ? 'text-red-500' : 'text-lime'
                    )}
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 17}
                    strokeDashoffset={2 * Math.PI * 17 * (1 - Math.min((nutritionTotals?.calories || 0) / (nutritionGoals?.dailyCalories || 1), 1))}
                    transform="rotate(-90 22 22)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] font-bold">
                    {nutritionGoals ? `${Math.round(((nutritionTotals?.calories || 0) / nutritionGoals.dailyCalories) * 100)}%` : '—'}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Nutricion</div>
                {nutritionGoals ? (
                  <div className="text-sm">
                    <span className="text-foreground font-medium">{Math.round(nutritionTotals?.calories || 0)}</span>
                    <span className="text-muted-foreground"> / {nutritionGoals.dailyCalories} kcal</span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Define tu meta diaria</div>
                )}
              </div>
            </div>
          </button>
        )}
        <div className={cn(!onGoToNutrition && 'col-span-full')}>
          <WaterTracker todayTotal={waterTotal} goal={waterGoal} onAdd={addWater} compact />
        </div>
        {onGoToCardio && cardioWeeklyStats && (
          <CardioWidget
            weeklyStats={cardioWeeklyStats}
            lastSession={cardioLastSession ?? null}
            onNavigate={onGoToCardio}
          />
        )}
        <SleepDashboardWidget
          lastEntry={sleepLastEntry}
          onRegister={() => navigate('/sleep')}
        />
      </div>

      {/* Leaderboard widget — only if following someone */}
      {/* Social widgets — only if following someone */}
      {(weeklyLeaderboard.length > 1 || feedItems.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {weeklyLeaderboard.length > 1 && (
            <LeaderboardWidget
              entries={weeklyLeaderboard}
              onNavigate={() => navigate('/leaderboard')}
            />
          )}
          {feedItems.length > 0 && (
            <ActivityFeedWidget
              items={feedItems}
              onNavigate={() => navigate('/feed')}
            />
          )}
        </div>
      )}

      {/* Active Program + Weekly Plan */}
      <div id="tour-weekly-plan" className="mb-6">
        {activeProgram && (
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase shrink-0">Programa</div>
              <span className="font-bebas text-lg text-[hsl(var(--lime))] truncate">{activeProgram.name}</span>
            </div>
            {programs && programs.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProgramModal(true)}
                className="text-[10px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))] h-8 shrink-0"
              >
                CAMBIAR
              </Button>
            )}
          </div>
        )}
        <WeekPlanWidget selectedPhase={settings.phase || 1} isWorkoutDone={isWorkoutDone} weekDays={weekDays} />
      </div>

      {/* ═══ STATS + ACTIVITY ════════════════════════════════════════════════ */}
      <div className="mb-6">
        <div id="tour-stats" className="grid grid-cols-3 gap-3 mb-5">
          <div className="text-center">
            <div className="font-bebas text-3xl md:text-4xl text-lime leading-none">{totalSessions}</div>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">Total</div>
          </div>
          <div className="text-center">
            <span className={cn('font-bebas text-3xl md:text-4xl leading-none', streak >= 3 ? 'text-orange-500' : 'text-sky-500')}>{streak}</span>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">Mejor racha</div>
          </div>
          <div className="text-center">
            <div className="font-bebas text-3xl md:text-4xl text-amber-400 leading-none">{weeklyDone}<span className="text-lg text-muted-foreground">/{settings.weeklyGoal || 5}</span></div>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">Esta semana</div>
          </div>
        </div>

        {/* Activity heatmap */}
        <div className="flex gap-1 flex-wrap" role="img" aria-label={`${Object.values(monthActivity).filter(Boolean).length} dias activos este mes`}>
          {calDays.map(([date, active]) => (
            <div
              key={date}
              title={date}
              className={cn(
                'size-5 rounded-sm',
                active
                  ? 'bg-lime'
                  : date === today_str
                    ? 'bg-lime/15 border border-lime/40'
                    : 'bg-muted border border-transparent'
              )}
            />
          ))}
        </div>
      </div>

      {/* ═══ CONFIGURATION (collapsed) ═══════════════════════════════════════ */}
      <div className="pt-4">
        <button
          onClick={() => setShowConfig(c => !c)}
          className="flex items-center justify-between w-full mb-4 group"
        >
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase group-hover:text-foreground transition-colors">
            Configuracion
          </div>
          <svg
            className={cn('size-4 text-muted-foreground transition-transform', showConfig && 'rotate-180')}
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <polyline points="4,6 8,10 12,6" />
          </svg>
        </button>

        {showConfig && (
          <div className="space-y-5 motion-safe:animate-fade-in">
            {/* Active program */}
            {activeProgram && (
              <div id="tour-active-program" className="flex items-center gap-3 flex-wrap">
                <div className="flex-1">
                  <div className="text-[9px] text-muted-foreground tracking-widest uppercase">Programa</div>
                  <div className="font-bebas text-xl text-lime">{activeProgram.name}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {programs && programs.length > 1 && (
                    <Button variant="outline" size="sm" onClick={() => setShowProgramModal(true)}
                      className="text-[10px] tracking-widest hover:border-lime hover:text-lime h-10 sm:h-8">
                      CAMBIAR PROGRAMA
                    </Button>
                  )}
                  {onCreateProgram && (
                    <Button variant="outline" size="sm" onClick={onCreateProgram}
                      className="text-[10px] tracking-widest hover:border-sky-500 hover:text-sky-500 h-10 sm:h-8">
                      CREAR PROGRAMA
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Phase + Goals side by side */}
            <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
              <Card className={cn('border-l-[3px]', phaseAccent.border)}>
                <CardContent className="p-5">
                  <div className={cn('text-[10px] tracking-widest mb-2 uppercase', phaseAccent.text)}>Fase Actual</div>
                  <div className="font-bebas text-2xl mb-1">Fase {phase.id}: {phase.name}</div>
                  <div className="text-xs text-muted-foreground mb-3">Semanas {phase.weeks}</div>
                  <div className="flex gap-2 flex-wrap">
                    {PHASES.map(p => {
                      const pa = PHASE_COLORS[p.id] || PHASE_COLORS[1]
                      const isSelected = settings.phase === p.id
                      return (
                        <Button key={p.id} variant="outline" size="sm"
                          onClick={() => updateSettings({ phase: p.id })} aria-pressed={isSelected}
                          className={cn('h-9 sm:h-7 px-4 sm:px-3 text-[11px] sm:text-[10px] tracking-wide transition-all', isSelected && cn('border-current', pa.text))}>
                          F{p.id}
                        </Button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="text-[10px] text-muted-foreground tracking-widest mb-3 uppercase">Objetivos a 6 meses</div>
                  <div className="flex flex-col gap-2.5">
                    {GOALS.map(goal => (
                      <GoalCard key={goal.key} goal={goal}
                        current={(settings as unknown as Record<string, number>)[goal.key] || 0}
                        onUpdate={val => updateSettings({ [goal.key]: val })} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Workout Reminders */}
            <WorkoutReminderWidget userId={userId} />
          </div>
        )}
      </div>

      {showProgramModal && (
        <ProgramSelectorModal
          programs={programs}
          activeProgram={activeProgram}
          onSelect={async (id: string) => { await onSelectProgram(id); setShowProgramModal(false) }}
          onClose={() => setShowProgramModal(false)}
          onDuplicate={onDuplicateProgram ? (id: string) => { setShowProgramModal(false); onDuplicateProgram(id) } : undefined}
          onEdit={onEditProgram ? (id: string) => { setShowProgramModal(false); onEditProgram(id) } : undefined}
          userId={userId}
        />
      )}
    </div>
  )
}
