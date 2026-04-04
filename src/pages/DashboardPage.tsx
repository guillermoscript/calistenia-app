import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PHASES as FALLBACK_PHASES } from '../data/workouts'
import WeekPlanWidget from '../components/WeekPlanWidget'
import ProgramSelectorModal from '../components/ProgramSelectorModal'
import { cn } from '../lib/utils'
import { todayStr, localHour, localDay, diffDays } from '../lib/dateUtils'
import { PHASE_COLORS, CARDIO_ACTIVITY } from '../lib/style-tokens'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import WaterTracker from '../components/WaterTracker'
import StreakMilestone, { getActiveMilestone, markMilestoneShown } from '../components/StreakMilestone'
import WorkoutReminderWidget from '../components/WorkoutReminderWidget'
import CardioWidget from '../components/cardio/CardioWidget'
import SleepDashboardWidget from '../components/sleep/SleepDashboardWidget'
import type { SleepLastEntry } from '../components/sleep/SleepDashboardWidget'
import LeaderboardWidget from '../components/friends/LeaderboardWidget'
import ActivityFeedWidget from '../components/friends/ActivityFeedWidget'
import PhasePhotoBanner from '../components/progress/PhasePhotoBanner'
import { useWater } from '../hooks/useWater'
import { useSleep } from '../hooks/useSleep'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import type { CardioSession } from '../types'
import type { CardioAggregateStats } from '../hooks/useCardioStats'
import { toast } from 'sonner'


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
  labelKey?: string
}

const GOALS: GoalDef[] = [
  { label: 'Pull-ups seguidas',  key: 'pr_pullups',   unit: 'reps', goal: 20, accent: 'text-sky-500',  border: 'border-l-sky-500', labelKey: 'dashboard.goal.pullups' },
  { label: 'Push-ups',           key: 'pr_pushups',   unit: 'reps', goal: 50, accent: 'text-lime',     border: 'border-l-lime', labelKey: 'dashboard.goal.pushups' },
  { label: 'L-sit',              key: 'pr_lsit',      unit: 's',    goal: 30, accent: 'text-amber-400',border: 'border-l-amber-400', labelKey: 'dashboard.goal.lsit' },
  { label: 'Pistol Squat',       key: 'pr_pistol',    unit: 'reps', goal: 1,  accent: 'text-pink-500', border: 'border-l-pink-500', labelKey: 'dashboard.goal.pistol' },
  { label: 'Handstand libre',    key: 'pr_handstand', unit: 's',    goal: 60, accent: 'text-red-500',  border: 'border-l-red-500', labelKey: 'dashboard.goal.handstand' },
]

interface GoalCardProps {
  goal: GoalDef
  current: number
  onUpdate: (val: number) => void
}

function GoalCard({ goal, current, onUpdate }: GoalCardProps) {
  const { t } = useTranslation()
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
        <div className={cn('text-[13px]', reached ? 'text-lime' : 'text-foreground')}>{goal.labelKey ? t(goal.labelKey) : goal.label}</div>
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
            placeholder={t('dashboard.goalExample', { value: current || goal.goal })}
            className="flex-1 h-8 text-xs"
            aria-label={goal.label}
          />
          <Button size="sm" onClick={handleSubmit} className="h-8 px-3 text-xs">{t('common.save').toUpperCase()}</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-8 px-2 text-xs">✕</Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          className="h-9 sm:h-7 px-3 sm:px-2.5 text-[11px] tracking-wide hover:border-lime hover:text-lime"
        >
          {t('dashboard.registerPR')}
        </Button>
      )}
    </div>
  )
}


// ── Greeting helper ──────────────────────────────────────────────────────────

function getGreetingKey(): string {
  const h = localHour()
  if (h < 12) return 'dashboard.greeting.morning'
  if (h < 19) return 'dashboard.greeting.afternoon'
  return 'dashboard.greeting.evening'
}


// ── Dashboard Page ───────────────────────────────────────────────────────────

interface DashboardPageProps {
  nutritionTotals?: { calories: number; protein: number; carbs: number; fat: number }
  nutritionGoals?: { dailyCalories: number } | null
  cardioWeeklyStats?: CardioAggregateStats
  cardioLastSession?: CardioSession | null
}

export default function DashboardPage({
  nutritionTotals, nutritionGoals,
  cardioWeeklyStats, cardioLastSession,
}: DashboardPageProps) {
  const { settings, usePB, activeProgram, programs, phases: phasesProp, weekDays } = useWorkoutState()
  const {
    getTotalSessions, getLongestStreak, getWeeklyDoneCount, getMonthActivity,
    updateSettings, isWorkoutDone, getLastSessionDate, selectProgram: onSelectProgram,
    duplicateProgram,
  } = useWorkoutActions()
  const { userId, user } = useAuthState()
  const displayName = (user as any)?.display_name || (user as any)?.name || ''
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const onGoToWorkout = useCallback(() => navigate('/workout'), [navigate])
  const onGoToNutrition = useCallback(() => navigate('/nutrition'), [navigate])
  const onGoToCardio = useCallback(() => navigate('/cardio'), [navigate])
  const onCreateProgram = useCallback(() => navigate('/programs/new'), [navigate])
  const onEditProgram = useCallback((id: string) => navigate(`/programs/${id}/edit`), [navigate])
  const onDuplicateProgram = useCallback(async (id: string) => {
    const newId = await duplicateProgram(id)
    if (newId) navigate(`/programs/${newId}/edit`)
  }, [duplicateProgram, navigate])
  const PHASES = phasesProp || FALLBACK_PHASES
  const [showProgramModal, setShowProgramModal] = useState(false)
  const { todayTotal: waterTotal, goal: waterGoal, addWater, adding: waterAdding } = useWater(userId ?? null)
  const { entries: leaderboardEntries, load: loadLeaderboard } = useLeaderboard(userId ?? null)
  const { items: feedItems, load: loadFeed } = useActivityFeed(userId ?? null)
  const { entries: sleepEntries } = useSleep(userId ?? null)
  const sleepLastEntry: SleepLastEntry | null = useMemo(() => {
    if (sleepEntries.length === 0) return null
    const e = sleepEntries[0] // already sorted by date desc
    return { date: e.date, duration_minutes: e.duration_minutes, quality: e.quality, bedtime: e.bedtime, wake_time: e.wake_time, awake_minutes: e.awake_minutes }
  }, [sleepEntries])
  useEffect(() => { if (userId) { loadLeaderboard(); loadFeed() } }, [userId, loadLeaderboard, loadFeed])
  const weeklyLeaderboard = leaderboardEntries.sessions_week
  const totalSessions = getTotalSessions()
  const streak = getLongestStreak()
  const [dismissedMilestone, setDismissedMilestone] = useState(false)
  const activeMilestone = useMemo(() => {
    if (!userId || dismissedMilestone) return null
    return getActiveMilestone(streak, userId)
  }, [streak, userId, dismissedMilestone])
  const weeklyDone = getWeeklyDoneCount()
  const monthActivity = getMonthActivity()
  const phase = PHASES.find(p => p.id === settings.phase) || PHASES[0]
  const phaseAccent = PHASE_COLORS[phase.id] || PHASE_COLORS[1]
  const today_str = todayStr()
  const daysElapsed = settings.startDate ? diffDays(today_str, settings.startDate) : 0
  const weekElapsed = Math.floor(daysElapsed / 7) + 1
  const totalWeeks = activeProgram?.duration_weeks || 26
  const progress = Math.min(100, (daysElapsed / (totalWeeks * 7)) * 100)
  const calDays = Object.entries(monthActivity)

  const daysSinceLastSession = useMemo(() => {
    const last = getLastSessionDate ? getLastSessionDate() : null
    if (!last) return null
    return diffDays(today_str, last)
  }, [getLastSessionDate, today_str])

  const showNudge = daysSinceLastSession !== null && daysSinceLastSession >= 3

  const [showConfig, setShowConfig] = useState(false)

  // Build display name from userId or fallback
  const greeting = t(getGreetingKey())
  const todayFormatted = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

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
            {t('common.week')} <strong className="text-foreground">{Math.min(weekElapsed, totalWeeks)}</strong> {t('common.of')} {totalWeeks}
            {activeProgram && (
              <span className="text-lime"> · {activeProgram.name}</span>
            )}
          </div>
          <Badge variant={usePB ? 'outline' : 'secondary'} className={cn('text-[9px]', usePB ? 'text-emerald-600 border-emerald-500/40 bg-emerald-500/10' : 'text-amber-600 border-amber-500/40 bg-amber-500/10')}>
            {usePB ? t('dashboard.synced') : t('dashboard.localOnly')}
          </Badge>
        </div>
      </div>

      {/* Nudge — prominent when present */}
      {showNudge && (
        <div className="mb-6 p-4 md:p-5 bg-amber-500/5 border border-amber-500/30 rounded-xl flex items-center gap-4 flex-wrap">
          <div className="flex-1">
            <div className="text-[10px] text-amber-600 dark:text-amber-400 tracking-widest mb-1 uppercase">
              {t('dashboard.nudge.title', { days: daysSinceLastSession })}
            </div>
            <div className="text-sm text-muted-foreground">{t('dashboard.nudge.subtitle')}</div>
          </div>
          <Button
            onClick={onGoToWorkout}
            className="bg-amber-500 hover:bg-amber-400 text-white font-bebas text-lg tracking-wide w-full sm:w-auto"
          >
            {t('dashboard.nudge.cta')}
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <div id="tour-progress" className="mb-6">
        <div className="flex justify-between mb-2">
          <span className={cn('text-[11px]', phaseAccent.text)}>{phase.nameKey ? t(phase.nameKey) : phase.name} · Semanas {phase.weeks}</span>
          <span className="text-[11px] text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Phase Photo Nudge Banner */}
      <PhasePhotoBanner
        currentPhase={phase.id}
        userId={userId || null}
        hasCompletedWorkoutInPhase={totalSessions > 0}
      />

      {/* ═══ TODAY'S WORKOUT HERO ══════════════════════════════════════════ */}
      {(() => {
        const todayDayId = (['dom','lun','mar','mie','jue','vie','sab'] as const)[localDay()]
        const todayDay = weekDays.find(d => d.id === todayDayId)
        const todayIsRest = todayDay?.type === 'rest'
        const todayIsCardio = todayDay?.type === 'cardio'
        const todayIsYoga = todayDay?.type === 'yoga'
        const todayWorkoutKey = `p${settings.phase || 1}_${todayDayId}`
        const todayDone = isWorkoutDone(todayWorkoutKey, today_str)

        return (
          <div
            className={cn(
              'mb-6 p-5 rounded-xl border-2 transition-all',
              todayDone
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : todayIsYoga
                  ? 'border-purple-400/30 bg-purple-400/5 cursor-pointer hover:border-purple-400/50 active:scale-[0.99]'
                  : todayIsCardio
                    ? 'border-emerald-400/30 bg-emerald-400/5 cursor-pointer hover:border-emerald-400/50 active:scale-[0.99]'
                    : todayIsRest
                      ? 'border-border bg-card'
                      : 'border-[hsl(var(--lime))]/30 bg-[hsl(var(--lime))]/5 cursor-pointer hover:border-[hsl(var(--lime))]/50 active:scale-[0.99]',
            )}
            onClick={() => {
              if (todayDone) return
              if (todayIsYoga) navigate(`/workout?day=${todayDayId}`)
              else if (todayIsCardio) navigate(`/workout?day=${todayDayId}`)
              else if (!todayIsRest) navigate(`/workout?day=${todayDayId}`)
            }}
            role={!todayIsRest && !todayDone ? 'button' : undefined}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">
                  {todayDone ? t('dashboard.todayWorkout') : todayIsYoga ? t('dashboard.todayYoga', { defaultValue: 'YOGA DE HOY' }) : todayIsCardio ? t('dashboard.todayCardio') : todayIsRest ? t('dashboard.todayRest') : t('dashboard.todayWorkout')}
                </div>
                <div className="font-bebas text-2xl md:text-3xl leading-none">
                  {todayDone ? (
                    <span className="text-emerald-500">{t('dashboard.completed')}</span>
                  ) : todayIsYoga ? (
                    <span className="text-purple-400">{t('dashboard.yoga', { defaultValue: 'Yoga' })}</span>
                  ) : todayIsCardio ? (
                    <span className="text-emerald-400">{t(`cardio.${todayDay?.cardioConfig?.activityType || 'running'}`)}</span>
                  ) : todayIsRest ? (
                    <span className="text-muted-foreground">{t('dashboard.restDay')}</span>
                  ) : (
                    <span className="text-[hsl(var(--lime))]">{todayDay?.focusKey ? t(todayDay.focusKey) : todayDay?.focus || t('dashboard.train')}</span>
                  )}
                </div>
                {activeProgram && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {activeProgram.name} · {t('workout.phaseLabel', { phase: settings.phase || 1 })}
                  </div>
                )}
              </div>
              {todayDone ? (
                <div className="size-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg className="size-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
              ) : todayIsYoga ? (
                <div className="size-12 rounded-full bg-purple-400/10 flex items-center justify-center shrink-0">
                  <span className="text-2xl">🧘</span>
                </div>
              ) : todayIsCardio ? (
                <div className="text-3xl shrink-0">{CARDIO_ACTIVITY[todayDay?.cardioConfig?.activityType || 'running']?.icon || '🏃'}</div>
              ) : todayIsRest ? (
                <div className="text-3xl shrink-0">😴</div>
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
            label={t('dashboard.quickAction.workout')}
            description={t('dashboard.quickAction.workoutDesc')}
            accent="text-lime"
            onClick={onGoToWorkout}
          />
          <QuickAction
            icon={<svg className="size-5 text-amber-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 1v4a3 3 0 006 0V1" /><line x1="8" y1="8" x2="8" y2="15" /><line x1="5" y1="1" x2="5" y2="5" /><line x1="8" y1="1" x2="8" y2="4" /><line x1="11" y1="1" x2="11" y2="5" /></svg>}
            label={t('dashboard.quickAction.nutrition')}
            description={t('dashboard.quickAction.nutritionDesc')}
            accent="text-amber-400"
            onClick={() => navigate('/nutrition')}
          />
          <QuickAction
            icon={<svg className="size-5 text-sky-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="3" r="1.5" /><path d="M5 16l2-5 3 2v5" /><path d="M8 8l-3 3 1.5 1" /><path d="M8 8l2-2 3 1" /></svg>}
            label={t('dashboard.quickAction.cardio')}
            description={t('dashboard.quickAction.cardioDesc')}
            accent="text-sky-500"
            onClick={() => navigate('/cardio')}
          />
          <QuickAction
            icon={<svg className="size-5 text-pink-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2" /><line x1="5" y1="6" x2="11" y2="6" /><line x1="5" y1="8.5" x2="11" y2="8.5" /><line x1="5" y1="11" x2="9" y2="11" /><polyline points="10,3 12,5 14,1" strokeWidth="2" /></svg>}
            label={t('dashboard.quickAction.freeSession')}
            description={t('dashboard.quickAction.freeSessionDesc')}
            accent="text-pink-500"
            onClick={() => navigate('/free-session')}
          />
          <QuickAction
            icon={<svg className="size-5 text-red-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="1" x2="8" y2="15" /><rect x="5" y="3" width="6" height="2.5" rx="0.5" /><rect x="5" y="6.75" width="6" height="2.5" rx="0.5" /><rect x="5" y="10.5" width="6" height="2.5" rx="0.5" /></svg>}
            label={t('dashboard.quickAction.lumbar')}
            description={t('dashboard.quickAction.lumbarDesc')}
            accent="text-red-500"
            onClick={() => navigate('/lumbar')}
          />
          <QuickAction
            icon={<svg className="size-5 text-purple-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1,12 5,7 8,9 12,4 15,6" /><line x1="1" y1="14" x2="15" y2="14" /></svg>}
            label={t('dashboard.quickAction.progress')}
            description={t('dashboard.quickAction.progressDesc')}
            accent="text-purple-500"
            onClick={() => navigate('/progress')}
          />
          <QuickAction
            icon={<svg className="size-5 text-teal-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="8" y2="11"/><path d="M10.5 10l1 1 2-2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label={t('dashboard.quickAction.logWorkout')}
            description={t('dashboard.quickAction.logWorkoutDesc')}
            accent="text-teal-400"
            onClick={() => navigate('/log-workout')}
          />
        </div>
      </div>

      {/* ═══ TODAY'S SNAPSHOT ═════════════════════════════════════════════════ */}
      <div className={cn('grid grid-cols-1 gap-4 mb-6', 'sm:grid-cols-2 lg:grid-cols-3')}>
        {onGoToNutrition && (
          <button onClick={onGoToNutrition} className="text-left p-4 bg-card border border-border rounded-xl hover:border-lime/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative size-11 shrink-0" role="img" aria-label={`${nutritionGoals ? Math.round(((nutritionTotals?.calories || 0) / nutritionGoals.dailyCalories) * 100) : 0}% ${t('dashboard.nutritionCaloriesLabel')}`}>
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
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('dashboard.nutrition')}</div>
                {nutritionGoals ? (
                  <div className="text-sm">
                    <span className="text-foreground font-medium">{Math.round(nutritionTotals?.calories || 0)}</span>
                    <span className="text-muted-foreground"> / {nutritionGoals.dailyCalories} kcal</span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{t('dashboard.defineGoal')}</div>
                )}
              </div>
            </div>
          </button>
        )}
        <div className={cn(!onGoToNutrition && 'col-span-full')}>
          <WaterTracker todayTotal={waterTotal} goal={waterGoal} onAdd={addWater} adding={waterAdding} compact />
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
              <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase shrink-0">{t('dashboard.program')}</div>
              <span className="font-bebas text-lg text-[hsl(var(--lime))] truncate">{activeProgram.name}</span>
            </div>
            {programs && programs.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProgramModal(true)}
                className="text-[10px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))] h-8 shrink-0"
              >
                {t('dashboard.changeProgram')}
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
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">{t('dashboard.stats.total')}</div>
          </div>
          <div className="text-center">
            <span className={cn('font-bebas text-3xl md:text-4xl leading-none', streak >= 3 ? 'text-orange-500' : 'text-sky-500')}>{streak}</span>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">{t('dashboard.stats.bestStreak')}</div>
          </div>
          <div className="text-center">
            <div className="font-bebas text-3xl md:text-4xl text-amber-400 leading-none">{weeklyDone}<span className="text-lg text-muted-foreground">/{settings.weeklyGoal || 5}</span></div>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">{t('dashboard.stats.thisWeek')}</div>
          </div>
        </div>

        {/* Activity heatmap */}
        <div className="flex gap-1 flex-wrap" role="img" aria-label={t('dashboard.activeDaysLabel', { count: Object.values(monthActivity).filter(Boolean).length })}>
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

      {/* ═══ STREAK MILESTONE ═══════════════════════════════════════════════ */}
      {activeMilestone && userId && (
        <StreakMilestone
          streak={activeMilestone}
          userId={userId}
          userName={displayName}
          referralCode={(user as any)?.referral_code}
          onDismiss={() => setDismissedMilestone(true)}
        />
      )}

      {/* ═══ CONFIGURATION (collapsed) ═══════════════════════════════════════ */}
      <div className="pt-4">
        <button
          onClick={() => setShowConfig(c => !c)}
          className="flex items-center justify-between w-full mb-4 group"
        >
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase group-hover:text-foreground transition-colors">
            {t('dashboard.config')}
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
                  <div className="text-[9px] text-muted-foreground tracking-widest uppercase">{t('dashboard.program')}</div>
                  <div className="font-bebas text-xl text-lime">{activeProgram.name}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {programs && programs.length > 1 && (
                    <Button variant="outline" size="sm" onClick={() => setShowProgramModal(true)}
                      className="text-[10px] tracking-widest hover:border-lime hover:text-lime h-10 sm:h-8">
                      {t('dashboard.changeProgramFull')}
                    </Button>
                  )}
                  {onCreateProgram && (
                    <Button variant="outline" size="sm" onClick={onCreateProgram}
                      className="text-[10px] tracking-widest hover:border-sky-500 hover:text-sky-500 h-10 sm:h-8">
                      {t('dashboard.createProgram')}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Phase + Goals side by side */}
            <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
              <Card className={cn('border-l-[3px]', phaseAccent.border)}>
                <CardContent className="p-5">
                  <div className={cn('text-[10px] tracking-widest mb-2 uppercase', phaseAccent.text)}>{t('dashboard.currentPhase')}</div>
                  <div className="font-bebas text-2xl mb-1">{t('dashboard.phaseLabel', { id: phase.id, name: phase.nameKey ? t(phase.nameKey) : phase.name })}</div>
                  <div className="text-xs text-muted-foreground mb-3">{t('dashboard.phaseWeeks', { weeks: phase.weeks })}</div>
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
                  <div className="text-[10px] text-muted-foreground tracking-widest mb-3 uppercase">{t('dashboard.goals6m')}</div>
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
          onSelect={async (id: string) => {
            const ok = await onSelectProgram(id)
            if (ok) {
              toast.success(t('programs.switchSuccess', { defaultValue: 'Programa cambiado correctamente' }))
              setShowProgramModal(false)
            } else {
              toast.error(t('programs.switchError', { defaultValue: 'Error al cambiar de programa. Intenta de nuevo.' }))
            }
            return ok
          }}
          onClose={() => setShowProgramModal(false)}
          onDuplicate={onDuplicateProgram ? (id: string) => { setShowProgramModal(false); onDuplicateProgram(id) } : undefined}
          onEdit={onEditProgram ? (id: string) => { setShowProgramModal(false); onEditProgram(id) } : undefined}
          userId={userId}
        />
      )}
    </div>
  )
}
