import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Image } from 'lucide-react'
import YoutubeModal from './YoutubeModal'
import MediaViewer from './MediaViewer'
import Timer from './Timer'
import SectionTransition from './session/SectionTransition'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'
import { cn } from '../lib/utils'
import WorkoutShareCard from './WorkoutShareCard'
import PRCelebration from './PRCelebration'
import ReferralPrompt, { isReferralPromptShown } from './ReferralPrompt'
import { getCurrentSection } from '../contexts/ActiveSessionContext'
import type { PREvent } from '../hooks/useProgress'
import * as sounds from '../lib/sounds'
import * as notif from '../lib/notifications'
import { PRIORITY_COLORS } from '../lib/style-tokens'
import type { Exercise, Workout, ExerciseLog, SetData, Priority } from '../types'
import { getLocalQuote, type Quote } from '../lib/quotes'

interface Step {
  exercise: Exercise
  setNumber: number
  totalSets: number
  section: 'warmup' | 'main' | 'cooldown'
}

function buildSteps(exercises: Exercise[]): Step[] {
  const steps: Step[] = []
  exercises.forEach(ex => {
    const total = ex.sets === 'múltiples' ? 3 : (parseInt(String(ex.sets)) || 1)
    for (let s = 1; s <= total; s++) {
      steps.push({ exercise: ex, setNumber: s, totalSets: total, section: ex.section || 'main' })
    }
  })
  return steps
}

const CONFETTI_COLORS = ['#c8f542', '#42c8f5', '#f54242', '#f5c842', '#f542c8', '#42f5a8']
const CONFETTI_COUNT  = 22

interface ConfettiPiece {
  id: number
  left: string
  size: number
  color: string
  delay: string
  dur: string
  rot: number
  shape: string
}

function Confetti() {
  const pieces = useRef<ConfettiPiece[]>(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left:  `${5 + Math.random() * 90}%`,
      size:  6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${(Math.random() * 1.4).toFixed(2)}s`,
      dur:   `${(2.2 + Math.random() * 1.8).toFixed(2)}s`,
      rot:   Math.floor(Math.random() * 360),
      shape: Math.random() > 0.5 ? '50%' : '2px',
    }))
  ).current

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-40px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'fixed',
          left: p.left,
          top: '-30px',
          width: p.size,
          height: p.size,
          background: p.color,
          borderRadius: p.shape,
          transform: `rotate(${p.rot}deg)`,
          animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
          willChange: 'transform, opacity',
          zIndex: 9998,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  )
}

// ─── Rest screen ──────────────────────────────────────────────────────────────

interface RestScreenProps {
  seconds: number
  exerciseId?: string
  nextStep: Step | null
  onSkip: () => void
  savedRest?: number
  onAdjust?: (exerciseId: string, seconds: number) => void
}

function RestScreen({ seconds: defaultSeconds, exerciseId, nextStep, onSkip, savedRest, onAdjust }: RestScreenProps) {
  const { t } = useTranslation()
  const initialSeconds = savedRest || defaultSeconds
  const endAtRef = useRef<number>(Date.now() + initialSeconds * 1000)
  const [remaining, setRemaining] = useState<number>(initialSeconds)
  const [totalSecs, setTotalSecs] = useState<number>(initialSeconds)
  const touchStartX = useRef<number | null>(null)
  const hasPlayedWarning = useRef<boolean>(false)
  const hasNotifiedStart = useRef<boolean>(false)
  const hasFinished = useRef<boolean>(false)
  const lastRemainingRef = useRef<number>(initialSeconds)
  const onSkipRef = useRef(onSkip)
  const nextStepRef = useRef(nextStep)
  onSkipRef.current = onSkip
  nextStepRef.current = nextStep

  // Play rest-start sound + notification on mount
  useEffect(() => {
    if (!hasNotifiedStart.current) {
      hasNotifiedStart.current = true
      sounds.playRestStart()
      notif.notifyRestStart(initialSeconds, nextStep?.exercise.name)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Timestamp-based countdown — survives tab backgrounding / setInterval throttling
  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      const prev = lastRemainingRef.current
      if (rem !== prev) {
        if (prev > 10 && rem <= 10 && rem > 0 && !hasPlayedWarning.current) {
          hasPlayedWarning.current = true
          sounds.playWarning()
          sounds.vibrate([100])
          notif.notifyRestEnding(10)
        }
        if (rem > 0 && rem <= 3 && prev === rem + 1 && !document.hidden) {
          sounds.playCountdownTick()
          sounds.vibrate([50])
        }
        lastRemainingRef.current = rem
        setRemaining(rem)
      }
      if (rem <= 0 && !hasFinished.current) {
        hasFinished.current = true
        sounds.playGetReady()
        sounds.vibrate([200, 100, 200])
        const ns = nextStepRef.current
        if (ns) notif.notifyRestDone(ns.exercise.name, ns.setNumber, ns.totalSets)
        onSkipRef.current()
      }
    }

    const id = setInterval(tick, 250)
    const onVis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTouchStart = (e: React.TouchEvent): void => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e: React.TouchEvent): void => {
    if (touchStartX.current !== null && e.changedTouches[0].clientX - touchStartX.current > 60) onSkip()
    touchStartX.current = null
  }

  const adjustTime = (delta: number) => {
    const newTotal = Math.max(10, totalSecs + delta)
    setTotalSecs(newTotal)
    endAtRef.current += delta * 1000
    const rem = Math.max(1, Math.ceil((endAtRef.current - Date.now()) / 1000))
    lastRemainingRef.current = rem
    setRemaining(rem)
    if (exerciseId && onAdjust) onAdjust(exerciseId, newTotal)
  }

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')
  const pct  = totalSecs > 0 ? (remaining / totalSecs) : 0
  const ringR = 62
  const ringSize = 148
  const ringHalf = ringSize / 2
  const ringStroke = 7
  const circumference = 2 * Math.PI * ringR
  const strokeOffset  = circumference * (1 - pct)
  const isUrgent = remaining > 0 && remaining < 10

  const ringColor = isUrgent ? 'hsl(var(--destructive))' : 'hsl(var(--lime))'
  const glowColor = isUrgent ? 'hsl(0 84% 60% / 0.18)' : 'hsl(var(--lime) / 0.1)'

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex-1 flex flex-col items-center justify-center gap-7 px-6 select-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <style>{`
        @keyframes restTickPulse {
          0%   { transform: scale(1); }
          15%  { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        @keyframes restUrgentPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>

      <div className="text-[11px] tracking-[4px] text-muted-foreground uppercase font-mono">{t('session.resting')}</div>

      <div
        className="relative rounded-full transition-shadow duration-500"
        style={{
          width: ringSize, height: ringSize,
          boxShadow: `0 0 36px ${glowColor}`,
          animation: isUrgent ? 'restUrgentPulse 1s ease-in-out infinite' : undefined,
        }}
      >
        <svg width={ringSize} height={ringSize} className="-rotate-90">
          <circle cx={ringHalf} cy={ringHalf} r={ringR} fill="none"
            stroke="hsl(var(--border))" strokeWidth={ringStroke} opacity="0.3" />
          <circle
            cx={ringHalf} cy={ringHalf} r={ringR} fill="none"
            stroke={ringColor}
            strokeWidth={ringStroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s',
              willChange: 'stroke-dashoffset',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            key={remaining}
            className={cn(
              'font-bebas tracking-[2px] leading-none tabular-nums text-[46px]',
              isUrgent ? 'text-destructive' : 'text-foreground'
            )}
            style={{ animation: 'restTickPulse 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
          >
            {mins}:{secs}
          </span>
        </div>
      </div>

      {nextStep && (
        <div className="w-full max-w-[340px] bg-card border border-border rounded-xl px-4 py-3.5">
          <div className="text-[9px] text-muted-foreground tracking-[3px] mb-2 uppercase font-mono">Siguiente</div>
          <div className={cn('h-0.5 rounded mb-2.5', PRIORITY_COLORS[nextStep.exercise.priority]?.stripe || 'bg-muted')} />
          <div className="font-semibold text-[15px] mb-1">{nextStep.exercise.name}</div>
          <div className="font-mono text-[12px] text-lime">
            {nextStep.exercise.reps}
            <span className="text-muted-foreground ml-2.5 text-[11px]">· Serie {nextStep.setNumber}/{nextStep.totalSets}</span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">{nextStep.exercise.muscles}</div>
        </div>
      )}

      {/* Adjust rest time */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => adjustTime(-15)}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground h-11 px-4">-15s</Button>
        <Button variant="outline" onClick={() => adjustTime(15)}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground h-11 px-4">+15s</Button>
        <Button variant="outline" onClick={() => adjustTime(30)}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground h-11 px-4">+30s</Button>
      </div>

      <Button
        variant="outline"
        onClick={onSkip}
        className="border-lime/25 bg-lime/7 text-lime hover:bg-lime/15 font-mono text-[11px] tracking-[2px] px-8"
      >
        {t('session.skipRest')}
      </Button>

      <div className="text-[11px] text-muted-foreground/50 font-mono sm:hidden">{t('session.swipeToSkip')}</div>
    </div>
  )
}

// ─── Exercise screen ──────────────────────────────────────────────────────────

interface ExerciseScreenProps {
  step: Step
  onLogged: (data: { reps: string; note: string; weight?: number; rpe?: number }) => void
  logs?: ExerciseLog[]
}

const ExerciseScreen = memo(function ExerciseScreen({ step, onLogged, logs = [] }: ExerciseScreenProps) {
  const { t } = useTranslation()
  const [editOpen,   setEditOpen]   = useState<boolean>(false)
  const [customReps, setCustomReps] = useState<string>('')
  const [customNote, setCustomNote] = useState<string>('')
  const [customWeight, setCustomWeight] = useState<string>('')
  const [customRpe, setCustomRpe]   = useState<string>('')
  const [showYoutube, setShowYoutube] = useState<boolean>(false)
  const [showMedia, setShowMedia]   = useState<boolean>(false)
  const [flash, setFlash]           = useState<boolean>(false)
  const [flyUp, setFlyUp]           = useState<number>(0)

  const { exercise, setNumber, totalSets } = step
  const recentLogs = logs.slice(0, 2)

  // Progressive overload hint
  const lastLog = logs[0]
  const lastBestReps = lastLog?.sets?.reduce((max: number, s: SetData) => {
    const n = parseInt(s.reps); return (!isNaN(n) && n > max) ? n : max
  }, 0) || 0
  const lastBestWeight = lastLog?.sets?.reduce((max: number, s: SetData) => (s.weight || 0) > max ? (s.weight || 0) : max, 0) || 0

  // Parse "8-12" → "8", leave "12/lado", "máx" etc. as-is
  const defaultReps = /^\d+-\d+$/.test(exercise.reps)
    ? exercise.reps.split('-')[0]
    : exercise.reps

  const doLog = (reps: string | number, note: string = '', weight?: number, rpe?: number): void => {
    setFlash(true)
    setFlyUp(n => n + 1)
    setTimeout(() => setFlash(false), 350)
    onLogged({ reps: String(reps), note, weight, rpe })
  }

  const handleQuick = (): void => doLog(defaultReps)
  const handleForm  = (): void => {
    if (!customReps) return
    const w = customWeight ? parseFloat(customWeight) : undefined
    const r = customRpe ? parseInt(customRpe) : undefined
    doLog(customReps, customNote, w, r)
    setCustomReps(''); setCustomNote(''); setCustomWeight(''); setCustomRpe(''); setEditOpen(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <style>{`
        @keyframes sessionFlash {
          0%   { background: hsl(var(--lime) / 0.1); }
          100% { background: transparent; }
        }
        .ex-session-flash { animation: sessionFlash 0.35s ease-out; }
        @keyframes exerciseEnter {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .exercise-enter { animation: exerciseEnter 0.3s cubic-bezier(0.25, 1, 0.5, 1) both; }
        @keyframes dotPulse {
          0%   { transform: scaleY(1); }
          50%  { transform: scaleY(1.8); }
          100% { transform: scaleY(1); }
        }
        @keyframes formSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .form-slide-in { animation: formSlideIn 0.25s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes setFlyUp {
          0%   { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-48px); opacity: 0; }
        }
        @keyframes dotGlow {
          0%   { box-shadow: 0 0 0 0 hsl(var(--lime) / 0.6); }
          50%  { box-shadow: 0 0 8px 3px hsl(var(--lime) / 0.3); }
          100% { box-shadow: 0 0 0 0 hsl(var(--lime) / 0); }
        }
        @keyframes dotBreathe {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
      `}</style>

      <div className={`flex-1 flex flex-col px-5 sm:px-8 pt-6 pb-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] overflow-auto max-w-2xl mx-auto w-full motion-safe:exercise-enter ${flash ? 'ex-session-flash' : ''}`}>

        {/* Exercise name + set counter */}
        <div className="mb-2">
          <div className="font-bebas leading-none tracking-[2px] mb-1.5"
            style={{ fontSize: 'clamp(42px, 10vw, 64px)' }}>
            {exercise.name}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-[13px] text-lime tracking-wide">{exercise.reps}</span>
            <span className="font-mono text-[11px] text-muted-foreground">· {t('common.rest')} {exercise.rest}s</span>
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
              {exercise.muscles}
            </span>
          </div>
        </div>

        {/* Superset badge */}
        {exercise.supersetGroup && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 rounded-md bg-pink-500/10 border border-pink-500/30">
            <span className="text-[10px] font-mono tracking-wide text-pink-500">SUPERSET</span>
          </div>
        )}

        {/* Set tracker dots */}
        <div className="flex gap-2 items-center mb-5">
          {Array.from({ length: totalSets }).map((_, i) => (
            <div key={i} className={cn(
              'w-7 h-1.5 rounded transition-all duration-300',
              i < setNumber - 1 ? 'bg-lime' : i === setNumber - 1 ? 'bg-lime/40' : 'bg-border'
            )}
            style={
              i === setNumber - 2 && setNumber > 1
                ? { animation: 'dotPulse 0.4s cubic-bezier(0.25, 1, 0.5, 1), dotGlow 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }
                : i === setNumber - 1
                  ? { animation: 'dotBreathe 2s ease-in-out infinite' }
                  : undefined
            }
            />
          ))}
          <span className="font-mono text-[10px] text-muted-foreground ml-1">SERIE {setNumber}/{totalSets}</span>
        </div>

        {/* Progressive overload hint */}
        {lastLog && lastBestReps > 0 && setNumber === 1 && (
          <div className="text-[12px] text-amber-400/80 bg-amber-400/5 rounded-md px-3.5 py-2.5 mb-4 border-l-[3px] border-amber-400/30">
            Ultima vez: <strong>{lastBestReps}</strong> reps
            {lastBestWeight > 0 && <> +<strong>{lastBestWeight}</strong>kg</>}
            {' — '}
            {lastBestWeight > 0
              ? `intenta +${(lastBestWeight + 2.5).toFixed(1)}kg o +1 rep`
              : `intenta ${lastBestReps + 1} reps`
            }
          </div>
        )}

        {/* Exercise note */}
        {exercise.note && (
          <div className="text-[13px] text-muted-foreground bg-muted/30 rounded-md px-3.5 py-2.5 mb-5 border-l-[3px] border-lime/20 italic leading-relaxed">
            {exercise.note}
          </div>
        )}

        {/* Recent history */}
        {recentLogs.length > 0 && (
          <div className="mb-5">
            <div className="text-[9px] text-muted-foreground/50 tracking-[2px] mb-1.5 uppercase font-mono">Últimas sesiones</div>
            {recentLogs.map((log, i) => (
              <div key={i} className="text-[12px] text-muted-foreground/50 mb-0.5">
                <span className="font-mono text-muted-foreground/30 mr-2">{log.date}</span>
                {log.sets?.map((s: SetData, j: number) => (
                  <span key={j} className="mr-1.5">
                    {j + 1}: <span className="text-muted-foreground/60">{s.reps}</span>
                    {s.weight && <span className="text-amber-400/60 ml-0.5">+{s.weight}kg</span>}
                    {s.rpe && <span className="text-pink-500/60 ml-0.5">RPE {s.rpe}</span>}
                    {s.note && <span className="text-muted-foreground/40 ml-0.5">({s.note})</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Timer for timed exercises */}
        {exercise.isTimer && (
          <div className="mb-5 py-6 flex justify-center">
            <Timer initialSeconds={exercise.timerSeconds} label={exercise.name} />
          </div>
        )}

        <div className="flex-1" />

        {/* ── ACTION AREA ── */}
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <button
              onClick={handleQuick}
              aria-label={`Registrar serie completada con ${defaultReps}`}
              className="w-full py-[18px] px-4 rounded-lg cursor-pointer bg-lime/14 text-lime font-mono text-sm font-bold tracking-[1.5px] flex items-center justify-center gap-2.5 transition-[background-color,transform] duration-100 hover:bg-lime/22 active:scale-[0.97] active:bg-lime/24 focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <span className="text-xl leading-none">+</span>
              SERIE COMPLETADA — {defaultReps}
            </button>
            {flyUp > 0 && (
              <span
                key={flyUp}
                aria-hidden="true"
                className="absolute right-4 top-1/2 font-bebas text-2xl text-lime pointer-events-none"
                style={{ animation: 'setFlyUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
              >
                +1
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setEditOpen(v => !v)}
              aria-label={editOpen ? t('session.closeSetEditor') : t('session.editCustomSet')}
              aria-expanded={editOpen}
              className={cn(
                'flex-1 min-h-[44px] px-2.5 rounded-md cursor-pointer font-mono text-[10px] tracking-wide transition-all duration-150 border focus-visible:ring-2 focus-visible:ring-lime/40',
                editOpen
                  ? 'border-lime/30 bg-lime/6 text-lime'
                  : 'border-border text-muted-foreground hover:border-lime/30 hover:text-lime'
              )}
            >
              {t('session.editBtn')}
            </button>

            {exercise.demoImages && exercise.demoImages.length > 0 && (
              <button
                onClick={() => setShowMedia(true)}
                aria-label="Ver fotos del ejercicio"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md cursor-pointer border border-lime/20 bg-lime/5 text-lime text-sm leading-none hover:bg-lime/10 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-lime/40"
              >
                <Image size={15} />
              </button>
            )}

            <button
              onClick={() => setShowYoutube(true)}
              aria-label="Ver tutorial en YouTube"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md cursor-pointer border border-red-500/20 bg-red-500/5 text-red-500 text-sm leading-none hover:bg-red-500/10 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-red-500/40"
            >
              ▶
            </button>
          </div>

          {editOpen && (
            <div className="px-3.5 py-3 bg-lime/4 rounded-lg border border-lime/12 form-slide-in">
              <div className="text-[9px] text-lime tracking-[2px] mb-2.5 uppercase font-mono">Registrar serie personalizada</div>
              <div className="flex gap-2">
                <Input
                  value={customReps}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomReps(e.target.value)}
                  placeholder={`Reps (ej: ${exercise.reps})`}
                  maxLength={20}
                  aria-label="Repeticiones"
                  className="flex-1 min-w-0 h-9 text-xs"
                />
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="999"
                  value={customWeight}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomWeight(e.target.value)}
                  placeholder={t('session.weightPlaceholder')}
                  aria-label="Lastre en kilogramos"
                  className="w-[88px] h-9 text-xs"
                />
                <Input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={customRpe}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomRpe(e.target.value)}
                  placeholder="RPE"
                  title={t('session.rpeTitle')}
                  aria-label="RPE del 1 al 10"
                  className="w-[56px] h-9 text-xs"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={customNote}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomNote(e.target.value)}
                  placeholder={t('session.optionalNote')}
                  maxLength={200}
                  aria-label="Nota opcional"
                  className="flex-1 min-w-0 h-9 text-xs"
                />
                <Button
                  onClick={handleForm}
                  disabled={!customReps}
                  size="sm"
                  className={cn(
                    'h-9 px-5 text-[11px] font-bold tracking-wide',
                    customReps
                      ? 'bg-lime text-lime-foreground hover:bg-lime/90'
                      : 'bg-lime/20 text-muted-foreground cursor-not-allowed'
                  )}
                >
                  GUARDAR
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showYoutube && <YoutubeModal query={exercise.youtube?.trim() || exercise.name} onClose={() => setShowYoutube(false)} />}
      {showMedia && <MediaViewer exercise={exercise} onClose={() => setShowMedia(false)} />}
    </div>
  )
})

// ─── Note screen ──────────────────────────────────────────────────────────────

interface NoteScreenProps {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  onSave: (note: string) => void
}

function NoteScreen({ workoutTitle, totalSetsLogged, durationMin, onSave }: NoteScreenProps) {
  const [note, setNote] = useState<string>('')
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] gap-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-300">
      <div className="font-bebas text-4xl sm:text-5xl tracking-[2px] text-emerald-500 text-center leading-none">
        ¡Último set listo!
      </div>
      <div className="text-[11px] text-muted-foreground tracking-[2px] font-mono">
        {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
      </div>

      <div className="w-full max-w-[420px] bg-card border border-border rounded-xl px-6 py-5">
        <div className="text-[10px] text-lime tracking-[2px] mb-2.5 uppercase font-mono">Nota de sesión</div>
        <div className="text-[13px] text-muted-foreground mb-3">¿Cómo fue? ¿Algo que destacar?</div>
        <Textarea
          value={note}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
          placeholder="Ej: Dominadas mucho mejor hoy, llegué a 8 seguidas. Lumbar bien."
          rows={3}
          autoFocus
          className="text-[13px] resize-y leading-relaxed"
        />
        <div className="flex gap-2.5 mt-3">
          <Button
            onClick={() => onSave(note.trim())}
            className="bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-lg tracking-wide px-6"
          >
            GUARDAR
          </Button>
          <Button
            variant="outline"
            onClick={() => onSave('')}
            className="font-mono text-[11px] tracking-wide px-4"
          >
            SALTAR
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Celebrate screen ─────────────────────────────────────────────────────────

interface CelebrateScreenProps {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  exercises: Exercise[]
  onDone: () => void
  userName?: string
  avatarUrl?: string | null
  userId?: string
  referralCode?: string | null
  totalSessions?: number
}

function CelebrateScreen({ workoutTitle, totalSetsLogged, durationMin, exercises, onDone, userName, avatarUrl, userId, referralCode, totalSessions }: CelebrateScreenProps) {
  const [quote, setQuote] = useState<Quote>(getLocalQuote)
  const [showReferral, setShowReferral] = useState(false)

  useEffect(() => {
    if (userId && referralCode && (totalSessions ?? 0) >= 3 && !isReferralPromptShown(userId)) {
      setShowReferral(true)
    }
  }, [userId, referralCode, totalSessions])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('https://zenquotes.io/api/random', { signal: ctrl.signal })
      .then(r => r.json())
      .then(([item]: [{ q?: string; a?: string }]) => { if (item?.q) setQuote(item as Quote) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={onDone}
      className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] gap-7 cursor-pointer text-center relative w-full"
    >
      <Confetti />

      <div className="size-[88px] rounded-full bg-muted border border-border flex items-center justify-center text-[40px] leading-none text-lime"
        style={{ animation: 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
        ✓
      </div>

      <style>{`
        @keyframes popIn {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div style={{ animation: 'fadeUp 0.5s 0.15s ease-out both' }}>
        <div className="font-bebas tracking-[3px] text-foreground leading-none mb-2"
          style={{ fontSize: 'clamp(40px, 10vw, 64px)' }}>
          SESIÓN COMPLETADA
        </div>
        <div className="font-mono text-[11px] text-muted-foreground tracking-[2px]">
          {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
        </div>
      </div>

      <div className="max-w-[380px]" style={{ animation: 'fadeUp 0.5s 0.35s ease-out both' }}>
        <div className="h-px mb-6 bg-gradient-to-r from-transparent via-border to-transparent" />
        {quote && (
          <>
            <div className="text-base italic text-foreground/70 leading-relaxed mb-2.5">"{quote.q}"</div>
            <div className="font-mono text-[11px] text-muted-foreground tracking-wide">— {quote.a}</div>
          </>
        )}
        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div style={{ animation: 'fadeUp 0.5s 0.5s ease-out both' }} className="flex flex-col items-center gap-3">
        <div className="flex gap-3 items-center">
          <Button
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDone() }}
            className="min-w-[160px] sm:min-w-[200px] font-bebas text-xl tracking-[2px] px-9 py-3.5 bg-lime text-lime-foreground hover:bg-lime/90"
          >
            IR AL DASHBOARD
          </Button>
          <WorkoutShareCard workoutTitle={workoutTitle} totalSets={totalSetsLogged} durationMin={durationMin} exercises={exercises} quote={quote} userName={userName} avatarUrl={avatarUrl} referralCode={referralCode} />
        </div>
        <div className="text-[11px] text-muted-foreground/50 font-mono tracking-wide">o toca en cualquier lugar</div>

        {/* Referral prompt after 3rd workout */}
        {showReferral && referralCode && userId && (
          <ReferralPrompt
            userId={userId}
            displayName={userName || ''}
            referralCode={referralCode}
            onDismiss={() => setShowReferral(false)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Main SessionView ─────────────────────────────────────────────────────────

type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
}

interface SessionViewProps {
  workout: Workout
  workoutKey: string
  onLogSet: (exerciseId: string, workoutKey: string, data: { reps: string; note: string; weight?: number; rpe?: number }) => Promise<PREvent | null>
  onMarkDone: (workoutKey: string, note: string) => void
  onGoToDashboard: () => void
  onExitSession: () => void
  getExerciseLogs: (exerciseId: string) => ExerciseLog[]
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
  /** Persisted progress from context (survives navigation) */
  initialProgress?: SessionProgress
  /** Callback to persist progress changes to context */
  onProgressChange?: (update: Partial<SessionProgress>) => void
  /** Original session start timestamp (for accurate duration after restore) */
  startedAt?: number
  /** User profile for share card */
  userName?: string
  avatarUrl?: string | null
  /** For referral prompt */
  userId?: string
  referralCode?: string | null
  getTotalSessions?: () => number
  /** Warmup/cooldown section skip handlers */
  onSkipWarmup?: () => void
  onSkipCooldown?: () => void
  onSkipRemainingCooldown?: () => void
  /** Section start time for tracking section durations */
  sectionStartTime?: number | null
  onSectionStartTimeChange?: (time: number | null) => void
}

export default function SessionView({
  workout,
  workoutKey,
  onLogSet,
  onMarkDone,
  onGoToDashboard,
  onExitSession,
  getExerciseLogs,
  getRestForExercise,
  setRestForExercise,
  initialProgress,
  onProgressChange,
  startedAt,
  userName,
  avatarUrl,
  userId,
  referralCode,
  getTotalSessions,
  onSkipWarmup,
  onSkipCooldown,
  onSkipRemainingCooldown,
  sectionStartTime: externalSectionStartTime,
  onSectionStartTimeChange,
}: SessionViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const steps = useRef<Step[]>(buildSteps(workout.exercises)).current

  const [stepIdx,   setStepIdx]   = useState<number>(initialProgress?.stepIdx ?? 0)
  const [phase,     setPhase]     = useState<SessionPhase>(initialProgress?.phase ?? 'exercise')
  const [setsCount, setSetsCount] = useState<number>(initialProgress?.setsCount ?? 0)
  const [showExit,  setShowExit]  = useState<boolean>(false)
  const [prEvent,   setPREvent]   = useState<PREvent | null>(null)
  // Track which section transition to show
  const [transitionType, setTransitionType] = useState<'warmup-to-main' | 'main-to-cooldown'>('warmup-to-main')
  // Index to advance to after transition
  const pendingStepIdx = useRef<number | null>(null)

  // Sync progress to context so it survives navigation away and back
  useEffect(() => {
    onProgressChange?.({ stepIdx, phase, setsCount })
  }, [stepIdx, phase, setsCount]) // eslint-disable-line react-hooks/exhaustive-deps
  const sessionStartTime = useRef<number>(startedAt || Date.now())

  // Swipe gesture refs
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const swiping = useRef(false)

  const currentStep = steps[stepIdx]
  const nextStep    = steps[stepIdx + 1] || null
  const isLastStep  = stepIdx === steps.length - 1

  // Build exercise-level index for swipe navigation
  // Maps exercise boundary → first step index of each unique exercise
  const exerciseBoundaries = useRef<number[]>(
    steps.reduce<number[]>((acc, s, i) => {
      if (i === 0 || s.exercise.id !== steps[i - 1].exercise.id) acc.push(i)
      return acc
    }, [])
  ).current

  const currentExerciseIndex = exerciseBoundaries.findIndex((bIdx, i) => {
    const nextBoundary = exerciseBoundaries[i + 1] ?? steps.length
    return stepIdx >= bIdx && stepIdx < nextBoundary
  })
  const hasPrevExercise = currentExerciseIndex > 0
  const hasNextExercise = currentExerciseIndex < exerciseBoundaries.length - 1

  const goToPrevExercise = useCallback(() => {
    if (currentExerciseIndex <= 0) return
    const prevIdx = exerciseBoundaries[currentExerciseIndex - 1]
    setStepIdx(prevIdx)
    setPhase('exercise')
  }, [currentExerciseIndex, exerciseBoundaries])

  const goToNextExercise = useCallback(() => {
    if (currentExerciseIndex >= exerciseBoundaries.length - 1) return
    const nextIdx = exerciseBoundaries[currentExerciseIndex + 1]
    setStepIdx(nextIdx)
    setPhase('exercise')
  }, [currentExerciseIndex, exerciseBoundaries])

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    swiping.current = false
  }, [])

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    // Only trigger if horizontal swipe is dominant and > 70px
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goToNextExercise()    // swipe left → next
      else goToPrevExercise()            // swipe right → prev
    }
  }, [goToNextExercise, goToPrevExercise])

  // Request notification permission when session starts
  useEffect(() => { notif.requestPermission() }, [])

  const handleLogged = useCallback(async ({ reps, note, weight, rpe }: { reps: string; note: string; weight?: number; rpe?: number }) => {
    const pr = await onLogSet(currentStep.exercise.id, workoutKey, { reps, note, weight, rpe })
    if (pr) setPREvent(pr)
    const newCount = setsCount + 1
    setSetsCount(newCount)
    sounds.playSetComplete()
    sounds.vibrate([80])

    const remaining = steps.length - (stepIdx + 1)
    notif.notifySetComplete(currentStep.exercise.name, currentStep.setNumber, currentStep.totalSets, remaining)

    if (isLastStep) {
      setPhase('note')
    } else {
      // Detect section transition (warmup→main or main→cooldown)
      const currentSection = currentStep.section
      const nextSection = nextStep?.section || 'main'
      if (currentSection !== nextSection) {
        const tt = currentSection === 'warmup' ? 'warmup-to-main' : 'main-to-cooldown'
        setTransitionType(tt as 'warmup-to-main' | 'main-to-cooldown')
        pendingStepIdx.current = stepIdx + 1
        setPhase('section-transition')
        return
      }

      // Check superset: if current and next exercise share a supersetGroup, skip rest
      const currentGroup = currentStep.exercise.supersetGroup
      const nextExGroup = nextStep?.exercise.supersetGroup
      if (currentGroup && nextExGroup && currentGroup === nextExGroup) {
        // Superset — go directly to next exercise
        setStepIdx(i => i + 1)
        setPhase('exercise')
      } else {
        setPhase('rest')
      }
    }
  }, [currentStep, isLastStep, nextStep, onLogSet, workoutKey, setsCount, stepIdx, steps.length])

  const handleRestDone = useCallback(() => {
    setStepIdx(i => i + 1)
    setPhase('exercise')
    setPREvent(null)
  }, [])

  const handleSectionContinue = useCallback(() => {
    if (pendingStepIdx.current !== null) {
      setStepIdx(pendingStepIdx.current)
      pendingStepIdx.current = null
    }
    onSectionStartTimeChange?.(Date.now())
    setPhase('exercise')
  }, [onSectionStartTimeChange])

  const handleSkipWarmup = useCallback(() => {
    const firstMainIdx = steps.findIndex(s => (s.section || 'main') !== 'warmup')
    if (firstMainIdx >= 0) {
      setStepIdx(firstMainIdx)
      setPhase('exercise')
    }
    onSkipWarmup?.()
    toast.info(t('warmupCooldown.nudge.warmupSkipped'), { duration: 3000 })
  }, [onSkipWarmup, t, steps])

  const handleSectionSkipCooldown = useCallback(() => {
    setPhase('note')
    onSkipCooldown?.()
    toast.info(t('warmupCooldown.nudge.cooldownSkipped'), { duration: 3000 })
  }, [onSkipCooldown, t])

  const handleSkipRemainingCooldown = useCallback(() => {
    setPhase('note')
    onSkipRemainingCooldown?.()
    toast.info(t('warmupCooldown.nudge.cooldownSkipped'), { duration: 3000 })
  }, [onSkipRemainingCooldown, t])

  // Determine current section for skip button visibility
  const stepSection = currentStep?.section || 'main'
  const hasWarmup = workout.exercises.some(e => e.section === 'warmup')
  const hasCooldown = workout.exercises.some(e => e.section === 'cooldown')
  const isInWarmup = stepSection === 'warmup' && phase === 'exercise'
  const isInCooldown = stepSection === 'cooldown' && (phase === 'exercise' || phase === 'rest')

  const handleNoteSaved = useCallback((note: string) => {
    onMarkDone(workoutKey, note)
    sounds.playSessionComplete()
    sounds.vibrate([100, 50, 100, 50, 200])
    notif.notifySessionComplete(workout.title, setsCount)
    setPhase('celebrate')
  }, [onMarkDone, workoutKey, workout.title, setsCount])

  const handleInterruptConfirm = useCallback(() => {
    onExitSession()
  }, [onExitSession])

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background overflow-hidden">
      {/* ── TOP BAR ── */}
      {phase !== 'celebrate' && (
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between px-4 h-[calc(52px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]">
            {/* Back — just navigate away, session stays alive in context */}
            <button
              onClick={() => navigate(-1)}
              className="bg-transparent border-none cursor-pointer text-muted-foreground min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-foreground transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-lime/40"
              aria-label="Volver"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>

            <div className="text-center min-w-0 flex-1 px-2">
              {phase === 'exercise' && currentStep && (
                <div className="font-mono text-[10px] text-muted-foreground/60 tracking-[2px] truncate">
                  {currentStep.exercise.name.toUpperCase()}
                </div>
              )}
              {phase === 'rest' && (
                <div className="font-mono text-[10px] text-muted-foreground tracking-[3px]">DESCANSO</div>
              )}
              {phase === 'section-transition' && (
                <div className="font-mono text-[10px] text-lime tracking-[3px]">
                  {t(`warmupCooldown.sections.${transitionType === 'warmup-to-main' ? 'warmup' : 'main'}`).toUpperCase()}
                </div>
              )}
              {phase === 'note' && (
                <div className="font-mono text-[10px] text-lime tracking-[3px]">COMPLETADO</div>
              )}
              <div className="font-mono text-[9px] text-muted-foreground/40 tracking-wide tabular-nums">
                {phase === 'note' ? exerciseBoundaries.length : currentExerciseIndex + 1}/{exerciseBoundaries.length} · {phase === 'note' ? steps.length : stepIdx + 1}/{steps.length} series
              </div>
            </div>

            {/* Discard button */}
            <button
              onClick={() => setShowExit(true)}
              className="bg-transparent border-none cursor-pointer text-muted-foreground min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-red-400 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-red-500/40"
              aria-label="Descartar sesion"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          {/* Session progress bar */}
          <div className="h-[3px] bg-muted">
            <div className="h-full bg-lime rounded-r-full transition-[width] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
              style={{ width: `${((phase === 'note' ? steps.length : stepIdx + 1) / steps.length) * 100}%` }} />
          </div>

          {/* Section skip buttons */}
          {isInWarmup && hasWarmup && onSkipWarmup && (
            <div className="flex justify-center py-1.5 border-b border-border">
              <button
                onClick={handleSkipWarmup}
                className="font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors px-3 py-1"
              >
                {t('warmupCooldown.skip.warmup')}
              </button>
            </div>
          )}
          {isInCooldown && hasCooldown && onSkipRemainingCooldown && (
            <div className="flex justify-center py-1.5 border-b border-border">
              <button
                onClick={handleSkipRemainingCooldown}
                className="font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors px-3 py-1"
              >
                {t('warmupCooldown.skip.remaining')}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'exercise' && currentStep && (
        <div
          className="flex-1 flex flex-col overflow-hidden relative"
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          {/* Navigation arrows — always visible */}
          {(hasPrevExercise || hasNextExercise) && (
            <div className="flex absolute top-1/2 -translate-y-1/2 left-0 right-0 justify-between pointer-events-none z-10 px-1 sm:px-2">
              {hasPrevExercise ? (
                <button
                  onClick={goToPrevExercise}
                  className="pointer-events-auto size-9 sm:size-11 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-lime/40"
                  aria-label="Ejercicio anterior"
                >
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="10,3 5,8 10,13" /></svg>
                </button>
              ) : <div />}
              {hasNextExercise ? (
                <button
                  onClick={goToNextExercise}
                  className="pointer-events-auto size-9 sm:size-11 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-lime/40"
                  aria-label="Siguiente ejercicio"
                >
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,3 11,8 6,13" /></svg>
                </button>
              ) : <div />}
            </div>
          )}
          <ExerciseScreen
            key={stepIdx}
            step={currentStep}
            onLogged={handleLogged}
            logs={getExerciseLogs(currentStep.exercise.id)}
          />
        </div>
      )}

      {phase === 'rest' && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* PR celebration banner */}
          {prEvent && (
            <PRCelebration
              prEvent={prEvent}
              userName={userName}
              avatarUrl={avatarUrl}
              referralCode={referralCode}
              onDismiss={() => setPREvent(null)}
            />
          )}
          {/* Navigation arrows during rest */}
          {(hasPrevExercise || hasNextExercise) && (
            <div className="flex absolute top-1/2 -translate-y-1/2 left-0 right-0 justify-between pointer-events-none z-10 px-1 sm:px-2">
              {hasPrevExercise ? (
                <button
                  onClick={goToPrevExercise}
                  className="pointer-events-auto size-9 sm:size-11 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-lime/40"
                  aria-label="Ejercicio anterior"
                >
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="10,3 5,8 10,13" /></svg>
                </button>
              ) : <div />}
              {hasNextExercise ? (
                <button
                  onClick={goToNextExercise}
                  className="pointer-events-auto size-9 sm:size-11 rounded-full bg-muted/60 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-lime/40"
                  aria-label="Siguiente ejercicio"
                >
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,3 11,8 6,13" /></svg>
                </button>
              ) : <div />}
            </div>
          )}
          <RestScreen
            key={`rest-${stepIdx}`}
            seconds={currentStep?.exercise.rest || 90}
            exerciseId={currentStep?.exercise.id}
            nextStep={nextStep}
            onSkip={handleRestDone}
            savedRest={currentStep && getRestForExercise ? getRestForExercise(currentStep.exercise.id, currentStep.exercise.rest || 90) : undefined}
            onAdjust={setRestForExercise ? (id, secs) => setRestForExercise(id, secs) : undefined}
          />
        </div>
      )}

      {phase === 'section-transition' && (
        <SectionTransition
          type={transitionType}
          onContinue={handleSectionContinue}
          onSkip={transitionType === 'main-to-cooldown' ? handleSectionSkipCooldown : undefined}
        />
      )}

      {phase === 'note' && (
        <NoteScreen
          workoutTitle={workout.title}
          totalSetsLogged={setsCount}
          durationMin={Math.round((Date.now() - sessionStartTime.current) / 60000)}
          onSave={handleNoteSaved}
        />
      )}

      {phase === 'celebrate' && (
        <CelebrateScreen
          workoutTitle={workout.title}
          totalSetsLogged={setsCount}
          durationMin={Math.round((Date.now() - sessionStartTime.current) / 60000)}
          exercises={workout.exercises}
          onDone={onGoToDashboard}
          userName={userName}
          avatarUrl={avatarUrl}
          userId={userId}
          referralCode={referralCode}
          totalSessions={getTotalSessions?.() ?? 0}
        />
      )}

      {/* Discard Dialog */}
      <Dialog open={showExit} onOpenChange={setShowExit}>
        <DialogContent className="max-w-[320px] max-sm:max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="font-bebas text-[28px] tracking-[2px]">{t('session.discardTitle')}</DialogTitle>
            <DialogDescription>
              {setsCount > 0
                ? t('session.discardWithSets', { count: setsCount })
                : t('session.discardEmpty')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2.5 sm:flex-col">
            <Button
              variant="outline"
              onClick={handleInterruptConfirm}
              className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 font-bebas text-lg tracking-wide"
            >
              {t('session.discardButton')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowExit(false)}
              className="font-mono text-[11px] tracking-wide"
            >
              CONTINUAR ENTRENANDO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
