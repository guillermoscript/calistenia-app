import { useMemo, useState, useEffect, useCallback } from 'react'
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
import { useWater } from '../hooks/useWater'
import type { Settings, Phase, WeekDay, ProgramMeta } from '../types'


interface StatCardProps {
  value: string | number
  label: string
  sub?: string
  accent?: string
}

function StatCard({ value, label, sub, accent = 'text-lime' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className={cn('font-bebas text-5xl leading-none mb-1', accent)}>{value}</div>
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

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
          className="h-7 px-2.5 text-[11px] tracking-wide hover:border-lime hover:text-lime"
        >
          ACTUALIZAR MARCA
        </Button>
      )}
    </div>
  )
}

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
}

export default function DashboardPage({
  settings, getTotalSessions, getLongestStreak, getWeeklyDoneCount, getMonthActivity,
  updateSettings, usePB, isWorkoutDone, getLastSessionDate, onGoToWorkout,
  activeProgram, programs, phases: phasesProp, weekDays, onSelectProgram,
  onCreateProgram, onEditProgram, onDuplicateProgram, userId,
  nutritionTotals, nutritionGoals, onGoToNutrition,
}: DashboardPageProps) {
  const PHASES = phasesProp || FALLBACK_PHASES
  const [showProgramModal, setShowProgramModal] = useState(false)
  const { todayTotal: waterTotal, goal: waterGoal, addWater } = useWater(userId ?? null)
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const isMobile = windowWidth < 768

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

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">

      {/* ═══ ZONE 1: Header + What to do today ═══════════════════════════════ */}
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Dashboard</div>
      <div className="flex items-center gap-4 mb-1 flex-wrap">
        <div className={cn('font-bebas leading-none', isMobile ? 'text-4xl' : 'text-5xl')}>TU PROGRESO</div>
        <Badge variant={usePB ? 'outline' : 'secondary'} className={cn('text-[9px]', usePB ? 'text-emerald-600 border-emerald-500/40 bg-emerald-500/10' : 'text-amber-600 border-amber-500/40 bg-amber-500/10')}>
          {usePB ? '● POCKETBASE' : '● LOCAL'}
        </Badge>
      </div>
      <div className="text-sm text-muted-foreground mb-6">
        Semana <strong className="text-foreground">{Math.min(weekElapsed, totalWeeks)}</strong> de {totalWeeks} ·{' '}
        Día <strong className="text-foreground">{Math.min(daysElapsed + 1, totalWeeks * 7)}</strong> de {totalWeeks * 7}
        {activeProgram && (
          <span className="text-lime"> · {activeProgram.name}</span>
        )}
      </div>

      {/* Nudge — prominent when present */}
      {showNudge && (
        <div className="mb-6 p-4 md:p-5 bg-amber-500/5 border border-amber-500/30 rounded-xl flex items-center gap-4 flex-wrap">
          <div className="flex-1">
            <div className="text-[10px] text-amber-600 dark:text-amber-400 tracking-widest mb-1 uppercase">
              Llevas {daysSinceLastSession} días sin entrenar
            </div>
            <div className="text-sm text-muted-foreground">No pierdas el ritmo — incluso 20 minutos hacen la diferencia.</div>
          </div>
          <Button
            onClick={onGoToWorkout}
            className={cn('bg-amber-500 hover:bg-amber-400 text-white font-bebas text-lg tracking-wide', isMobile && 'w-full')}
          >
            ENTRENAR HOY
          </Button>
        </div>
      )}

      {/* Progress bar — compact, always visible */}
      <Card id="tour-progress" className="mb-6">
        <CardContent className="p-4">
          <div className="flex justify-between mb-2 text-sm">
            <span className={cn('text-[11px]', phaseAccent.text)}>{phase.name} · Semanas {phase.weeks}</span>
            <span className="text-[11px] text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </CardContent>
      </Card>

      {/* Today row: Nutrition + Water side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {onGoToNutrition && (
          <button onClick={onGoToNutrition} className="text-left p-4 bg-card border border-border rounded-xl hover:border-lime/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative size-11 shrink-0" role="img" aria-label={`${nutritionGoals ? Math.round(((nutritionTotals?.calories || 0) / nutritionGoals.dailyCalories) * 100) : 0}% de calorías diarias`}>
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
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Nutrición</div>
                {nutritionGoals ? (
                  <div className="text-sm">
                    <span className="text-foreground font-medium">{Math.round(nutritionTotals?.calories || 0)}</span>
                    <span className="text-muted-foreground"> / {nutritionGoals.dailyCalories} kcal</span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Configurar macros</div>
                )}
              </div>
            </div>
          </button>
        )}
        <div className={cn(!onGoToNutrition && 'col-span-full')}>
          <WaterTracker todayTotal={waterTotal} goal={waterGoal} onAdd={addWater} compact />
        </div>
      </div>

      {/* Weekly Plan */}
      <div id="tour-weekly-plan" className="mb-6">
        <WeekPlanWidget selectedPhase={settings.phase || 1} isWorkoutDone={isWorkoutDone} weekDays={weekDays} />
      </div>

      {/* ═══ ZONE 2: Stats + History ═════════════════════════════════════════ */}
      <div className="border-t border-border pt-6 mb-6">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-4 uppercase">Resumen</div>

        {/* Compact stats row — 4 values inline */}
        <div id="tour-stats" className="grid grid-cols-4 gap-3 mb-6">
          <div className="text-center">
            <div className="font-bebas text-3xl md:text-4xl text-lime leading-none">{totalSessions}</div>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">Sesiones</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className={cn('font-bebas text-3xl md:text-4xl leading-none', streak >= 3 ? 'text-orange-500' : 'text-sky-500')}>{streak}</span>
              {streak >= 3 && <span className="text-lg">🔥</span>}
            </div>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">Racha</div>
          </div>
          <div className="text-center">
            <div className="font-bebas text-3xl md:text-4xl text-amber-400 leading-none">{weeklyDone}<span className="text-lg text-muted-foreground">/{settings.weeklyGoal || 5}</span></div>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">Semana</div>
          </div>
          <div className="text-center">
            <div className="font-bebas text-3xl md:text-4xl text-pink-500 leading-none">{Math.round(progress)}%</div>
            <div className="text-[10px] text-muted-foreground tracking-wide mt-1">Programa</div>
          </div>
        </div>

        {/* Activity heatmap */}
        <div className="flex gap-1 flex-wrap" role="img" aria-label={`${Object.values(monthActivity).filter(Boolean).length} días activos este mes`}>
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

      {/* ═══ ZONE 3: Configuration (collapsed) ═══════════════════════════════ */}
      <div className="border-t border-border pt-6">
        <button
          onClick={() => setShowConfig(c => !c)}
          className="flex items-center justify-between w-full mb-4 group"
        >
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase group-hover:text-foreground transition-colors">
            Configuración
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
                      className="text-[10px] tracking-widest hover:border-lime hover:text-lime h-8">
                      CAMBIAR
                    </Button>
                  )}
                  {onCreateProgram && (
                    <Button variant="outline" size="sm" onClick={onCreateProgram}
                      className="text-[10px] tracking-widest hover:border-sky-500 hover:text-sky-500 h-8">
                      + NUEVO
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Phase + Goals side by side */}
            <div className={cn('grid gap-5', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
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
                          className={cn('h-7 px-3 text-[10px] tracking-wide transition-all', isSelected && cn('border-current', pa.text))}>
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
