import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { X, Pause } from 'lucide-react'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { useCircuitSession } from '../../contexts/CircuitSessionContext'
import { useLocalize } from '../../hooks/useLocalize'
import * as sounds from '../../lib/sounds'
import type { CircuitDefinition } from '../../types'

// ── Confetti (reused from SessionView pattern) ──────────────────────────────

const CONFETTI_COLORS = ['#c8f542', '#42c8f5', '#f54242', '#f5c842', '#f542c8', '#42f5a8']
const CONFETTI_COUNT = 22

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
      left: `${5 + Math.random() * 90}%`,
      size: 6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${(Math.random() * 1.4).toFixed(2)}s`,
      dur: `${(2.2 + Math.random() * 1.8).toFixed(2)}s`,
      rot: Math.floor(Math.random() * 360),
      shape: Math.random() > 0.5 ? '50%' : '2px',
    })),
  ).current

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-40px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
        {pieces.map(p => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.left,
              top: -20,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.shape,
              transform: `rotate(${p.rot}deg)`,
              animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
            }}
          />
        ))}
      </div>
    </>
  )
}

// ── Timer ring (simplified from Timer.tsx for inline use) ────────────────────

const RING_SIZE = 180
const RING_STROKE = 8
const RING_R = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_R
const RING_HALF = RING_SIZE / 2

interface CountdownRingProps {
  seconds: number
  totalSeconds: number
  isPaused: boolean
  label: string
  labelColor: string
  onComplete: () => void
}

function CountdownRing({ seconds: initialSeconds, totalSeconds, isPaused, label, labelColor, onComplete }: CountdownRingProps) {
  const [remaining, setRemaining] = useState(initialSeconds)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const completedRef = useRef(false)

  // Reset when initialSeconds changes (new exercise/phase)
  useEffect(() => {
    setRemaining(initialSeconds)
    completedRef.current = false
  }, [initialSeconds])

  useEffect(() => {
    if (isPaused || remaining <= 0) return

    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev === 11) { sounds.playWarning(); sounds.vibrate([100]) }
        if (prev <= 4 && prev > 1) { sounds.playCountdownTick(); sounds.vibrate([50]) }
        if (prev <= 1) {
          clearInterval(id)
          sounds.playTimerComplete()
          sounds.vibrate([200, 100, 200])
          if (!completedRef.current) {
            completedRef.current = true
            // Defer to avoid setState during render
            setTimeout(() => onCompleteRef.current(), 0)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(id)
  }, [isPaused, remaining])

  const pct = totalSeconds > 0 ? remaining / totalSeconds : 0
  const strokeOffset = RING_CIRC * (1 - pct)
  const isUrgent = remaining > 0 && remaining <= 10

  const ringColor = remaining <= 0
    ? 'hsl(160 84% 60%)'
    : isUrgent
      ? 'hsl(var(--destructive))'
      : labelColor

  return (
    <div className="relative flex flex-col items-center">
      <div
        className="relative rounded-full transition-shadow duration-500"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          <circle cx={RING_HALF} cy={RING_HALF} r={RING_R} fill="none"
            stroke="hsl(var(--border))" strokeWidth={RING_STROKE} opacity="0.3" />
          <circle cx={RING_HALF} cy={RING_HALF} r={RING_R} fill="none"
            stroke={ringColor}
            strokeWidth={RING_STROKE}
            strokeDasharray={RING_CIRC}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div
            className={`font-bebas leading-none ${isUrgent ? 'text-destructive' : 'text-foreground'}`}
            style={{ fontSize: remaining >= 600 ? '36px' : '44px' }}
          >
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </div>
          <div
            className="font-mono text-[10px] tracking-[2px] mt-1"
            style={{ color: labelColor }}
          >
            {label}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Format elapsed time ─────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Main Component ──────────────────────────────────────────────────────────

interface CircuitViewProps {
  circuit: CircuitDefinition
}

export default function CircuitView({ circuit }: CircuitViewProps) {
  const { t } = useTranslation()
  const l = useLocalize()
  const navigate = useNavigate()
  const {
    progress,
    startedAt,
    isPaused,
    advanceExercise,
    advanceFromGetReady,
    advanceToNextPhase,
    pause,
    resume,
    completeCircuit,
    abandonCircuit,
  } = useCircuitSession()

  const [elapsed, setElapsed] = useState(0)
  const [showExit, setShowExit] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Wake lock to prevent screen sleep during circuit ──────────────────────

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch {
        // Wake lock request failed (e.g., low battery, not supported)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }

    requestWakeLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      wakeLock?.release()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // ── Elapsed timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!startedAt) return
    // Initialize from startedAt
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))

    if (isPaused || progress.phase === 'celebrate') return

    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    return () => clearInterval(id)
  }, [startedAt, isPaused, progress.phase])

  // ── Play celebration sound ────────────────────────────────────────────────

  useEffect(() => {
    if (progress.phase === 'celebrate') {
      sounds.playSessionComplete()
      sounds.vibrate([100, 50, 100, 50, 200])
    }
  }, [progress.phase])

  // Play get ready sound
  useEffect(() => {
    if (progress.phase === 'getReady') {
      sounds.playGetReady()
      sounds.vibrate([200, 100, 200])
    }
  }, [progress.phase])

  // Play round complete sound
  useEffect(() => {
    if (progress.phase === 'roundRest') {
      sounds.playGetReady()
      sounds.vibrate([100, 50, 100])
    }
  }, [progress.phase])

  // ── Current exercise ──────────────────────────────────────────────────────

  const currentExercise = circuit.exercises[progress.currentExerciseIndex]
  const nextExerciseIndex = progress.currentExerciseIndex + 1
  const nextExercise = nextExerciseIndex < circuit.exercises.length
    ? circuit.exercises[nextExerciseIndex]
    : progress.currentRound + 1 < circuit.rounds
      ? circuit.exercises[0]
      : null

  // ── Completion handler ────────────────────────────────────────────────────

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      await completeCircuit(note || undefined)
      navigate('/', { replace: true })
    } finally {
      setSaving(false)
    }
  }, [completeCircuit, note, navigate])

  // ── Exit handler ──────────────────────────────────────────────────────────

  const handleExit = useCallback(() => {
    abandonCircuit()
    navigate('/circuit', { replace: true })
  }, [abandonCircuit, navigate])

  // ── Rest durations ────────────────────────────────────────────────────────

  const getRestDuration = () => {
    if (progress.phase === 'roundRest') return circuit.restBetweenRounds
    if (circuit.mode === 'timed') {
      return currentExercise?.restSecondsOverride ?? circuit.restSeconds ?? 30
    }
    return circuit.restBetweenExercises
  }

  const getWorkDuration = () => {
    return currentExercise?.workSecondsOverride ?? circuit.workSeconds ?? 30
  }

  // ── Celebrate phase ───────────────────────────────────────────────────────

  if (progress.phase === 'celebrate') {
    const elapsedMin = Math.floor(elapsed / 60)
    const elapsedSec = elapsed % 60

    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col items-center justify-center px-6 text-center gap-6">
        <Confetti />

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

        <div
          className="size-[88px] rounded-full bg-muted border border-border flex items-center justify-center text-[40px] leading-none text-lime"
          style={{ animation: 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
        >
          ✓
        </div>

        <div style={{ animation: 'fadeUp 0.5s 0.15s ease-out both' }}>
          <div
            className="font-bebas tracking-[3px] text-foreground leading-none mb-2"
            style={{ fontSize: 'clamp(36px, 9vw, 56px)' }}
          >
            {t('circuit.circuitComplete')}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground tracking-[2px] space-x-2">
            <span>{l(circuit.name).toUpperCase()}</span>
            <span>·</span>
            <span>{t('circuit.roundsCompleted', { completed: circuit.rounds, total: circuit.rounds })}</span>
            <span>·</span>
            <span>{t('circuit.totalExercises', { count: progress.completedExercises })}</span>
            <span>·</span>
            <span>{t('circuit.duration', { minutes: elapsedMin, seconds: elapsedSec })}</span>
          </div>
        </div>

        <div className="w-full max-w-[360px]" style={{ animation: 'fadeUp 0.5s 0.35s ease-out both' }}>
          <div className="h-px mb-4 bg-gradient-to-r from-transparent via-border to-transparent" />
          <label className="block text-left font-mono text-[10px] text-muted-foreground tracking-[2px] mb-1.5">
            {t('circuit.noteLabel').toUpperCase()}
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('circuit.notePlaceholder')}
            maxLength={500}
            className="min-h-[80px] text-sm resize-none"
          />
          <div className="h-px mt-4 bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        <div style={{ animation: 'fadeUp 0.5s 0.5s ease-out both' }}>
          <Button
            onClick={handleComplete}
            disabled={saving}
            className="min-w-[200px] font-bebas text-xl tracking-[2px] px-9 py-3.5 bg-lime text-lime-foreground hover:bg-lime/90"
          >
            {saving ? '...' : t('circuit.finish')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Active workout phases ─────────────────────────────────────────────────

  const isGetReady = progress.phase === 'getReady'
  const isRest = progress.phase === 'rest' || progress.phase === 'roundRest'
  const isWork = progress.phase === 'work'
  const isExercise = progress.phase === 'exercise'

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex-1 min-w-0">
          <div className="font-bebas text-lg tracking-[1px] truncate">{l(circuit.name)}</div>
          <div className="font-mono text-[10px] text-muted-foreground tracking-[1px]">
            {t('circuit.roundOf', { current: progress.currentRound + 1, total: circuit.rounds })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Elapsed time */}
          <div className="text-right">
            <div className="font-mono text-[10px] text-muted-foreground tracking-[1px]">
              {t('circuit.elapsed').toUpperCase()}
            </div>
            <div className="font-bebas text-lg leading-none tabular-nums">
              {formatElapsed(elapsed)}
            </div>
          </div>

          {/* Pause button */}
          <button
            onClick={pause}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label={t('circuit.paused')}
          >
            <Pause size={18} />
          </button>

          {/* Close button */}
          <button
            onClick={() => setShowExit(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
            aria-label={t('circuit.exitConfirm')}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-5 overflow-y-auto">

        {/* ── Get Ready phase (both modes) ──────────────────────────────── */}
        {isGetReady && currentExercise && (
          <div className="flex flex-col items-center gap-5 w-full max-w-md text-center">
            {/* Exercise name */}
            <div className="font-bebas tracking-[2px] text-foreground leading-tight"
              style={{ fontSize: 'clamp(24px, 7vw, 38px)' }}>
              {l(currentExercise.name)}
            </div>

            {/* Countdown ring */}
            <CountdownRing
              key="get-ready"
              seconds={5}
              totalSeconds={5}
              isPaused={isPaused}
              label={t('circuit.getReady')}
              labelColor="hsl(var(--lime))"
              onComplete={advanceFromGetReady}
            />

            {/* Position */}
            <div className="font-mono text-[11px] text-muted-foreground tracking-[2px]">
              {t('circuit.exercisePosition', {
                current: 1,
                total: circuit.exercises.length,
              })}
            </div>
          </div>
        )}

        {/* ── Circuit mode: exercise phase ─────────────────────────────────── */}
        {isExercise && currentExercise && (
          <div className="flex flex-col items-center gap-5 w-full max-w-md text-center">
            {/* Exercise name */}
            <div>
              <div className="font-bebas tracking-[2px] text-foreground leading-tight"
                style={{ fontSize: 'clamp(28px, 8vw, 44px)' }}>
                {l(currentExercise.name)}
              </div>
              {currentExercise.reps && (
                <div className="font-mono text-lg text-lime mt-1">
                  {currentExercise.reps}
                </div>
              )}
            </div>

            {/* Position */}
            <div className="font-mono text-[11px] text-muted-foreground tracking-[2px]">
              {t('circuit.exercisePosition', {
                current: progress.currentExerciseIndex + 1,
                total: circuit.exercises.length,
              })}
            </div>

            {/* Next exercise preview */}
            {nextExercise && (
              <p className="font-mono text-[11px] text-muted-foreground/60 tracking-[1px] mt-3">
                {t('circuit.nextUp', { name: l(nextExercise.name) })}
              </p>
            )}

            {/* Done button */}
            <Button
              onClick={() => {
                sounds.vibrate([50])
                advanceExercise()
              }}
              className="w-full max-w-[320px] h-14 font-bebas text-2xl tracking-[2px] bg-lime text-lime-foreground hover:bg-lime/90"
            >
              {t('circuit.done')} ✓
            </Button>

            {/* Skip link */}
            <button
              onClick={() => {
                sounds.vibrate([30])
                advanceExercise()
              }}
              className="font-mono text-[11px] text-muted-foreground/60 tracking-[1px] hover:text-muted-foreground transition-colors"
            >
              {t('circuit.skip')}
            </button>
          </div>
        )}

        {/* ── Timed mode: work phase ───────────────────────────────────────── */}
        {isWork && currentExercise && (
          <div className="flex flex-col items-center gap-5 w-full max-w-md text-center">
            {/* Exercise name */}
            <div className="font-bebas tracking-[2px] text-foreground leading-tight"
              style={{ fontSize: 'clamp(24px, 7vw, 38px)' }}>
              {l(currentExercise.name)}
            </div>

            {/* Countdown ring */}
            <CountdownRing
              key={`work-${progress.currentRound}-${progress.currentExerciseIndex}`}
              seconds={getWorkDuration()}
              totalSeconds={getWorkDuration()}
              isPaused={isPaused}
              label={t('circuit.work')}
              labelColor="hsl(var(--lime))"
              onComplete={advanceExercise}
            />

            {/* Position */}
            <div className="font-mono text-[11px] text-muted-foreground tracking-[2px]">
              {t('circuit.exercisePosition', {
                current: progress.currentExerciseIndex + 1,
                total: circuit.exercises.length,
              })}
            </div>

            {/* Next exercise preview */}
            {nextExercise && (
              <p className="font-mono text-[11px] text-muted-foreground/60 tracking-[1px] mt-3">
                {t('circuit.nextUp', { name: l(nextExercise.name) })}
              </p>
            )}
          </div>
        )}

        {/* ── Rest phase (both modes) ──────────────────────────────────────── */}
        {isRest && (
          <div className="flex flex-col items-center gap-5 w-full max-w-md text-center">
            {/* Round complete message */}
            {progress.phase === 'roundRest' && (
              <div className="font-bebas text-2xl tracking-[2px] text-lime mb-2">
                {t('circuit.roundComplete', { round: progress.currentRound + 1 })}
              </div>
            )}

            {/* Countdown ring */}
            <CountdownRing
              key={`rest-${progress.currentRound}-${progress.currentExerciseIndex}-${progress.phase}`}
              seconds={getRestDuration()}
              totalSeconds={getRestDuration()}
              isPaused={isPaused}
              label={t('circuit.rest')}
              labelColor="hsl(var(--destructive))"
              onComplete={advanceToNextPhase}
            />

            {/* Next exercise preview */}
            {nextExercise && (
              <div className="font-mono text-[11px] text-muted-foreground tracking-[1px]">
                {t('circuit.nextUp', { name: l(nextExercise.name) })}
              </div>
            )}

            {/* Skip rest */}
            <button
              onClick={() => {
                sounds.vibrate([30])
                advanceToNextPhase()
              }}
              className="font-mono text-[11px] text-muted-foreground/60 tracking-[1px] hover:text-muted-foreground transition-colors"
            >
              {t('circuit.skip')}
            </button>
          </div>
        )}
      </main>

      {/* ── Pause overlay ──────────────────────────────────────────────────── */}
      {isPaused && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          onClick={resume}
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-5 cursor-pointer"
        >
          <div className="font-bebas text-[48px] tracking-[4px] text-foreground">
            {t('circuit.paused')}
          </div>
          <Button
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); resume() }}
            className="min-w-[160px] font-bebas text-xl tracking-[2px] px-8 py-3 bg-lime text-lime-foreground hover:bg-lime/90"
          >
            {t('circuit.resume')}
          </Button>
          <p className="font-mono text-[10px] text-muted-foreground/40 tracking-[1px] mt-4">
            {t('circuit.tapToResume')}
          </p>
        </div>
      )}

      {/* ── Exit confirm dialog ────────────────────────────────────────────── */}
      <Dialog open={showExit} onOpenChange={setShowExit}>
        <DialogContent className="max-w-[320px] max-sm:max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="font-bebas text-[28px] tracking-[2px]">
              {t('circuit.exitConfirm')}
            </DialogTitle>
            <DialogDescription>
              {t('circuit.exitMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2.5 sm:flex-col">
            <Button
              variant="outline"
              onClick={handleExit}
              className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 font-bebas text-lg tracking-wide"
            >
              {t('circuit.exitButton')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowExit(false)}
              className="font-mono text-[11px] tracking-wide"
            >
              {t('circuit.exitCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
