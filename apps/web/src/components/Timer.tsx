import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { usePausableCountdown } from '@calistenia/core/hooks/usePausableCountdown'
import { TIMER_CUE_THRESHOLDS, formatCountdown } from '@calistenia/core/lib/countdown'
import { timerCues } from '../lib/training-cues'
import { useResyncOnVisible } from '../hooks/useResyncOnVisible'
import { notifyTimerDone } from '../lib/notifications'

interface TimerProps {
  initialSeconds?: number
  onComplete?: () => void
  autoStart?: boolean
  label?: string
}

type Phase = 'idle' | 'countdown' | 'running' | 'paused' | 'done'

const SIZE = 180
const STROKE_W = 8
const R = (SIZE - STROKE_W) / 2
const CIRC = 2 * Math.PI * R
const HALF = SIZE / 2

export default function Timer({ initialSeconds = 60, onComplete, autoStart = false, label }: TimerProps) {
  const { t } = useTranslation()
  const effectiveLabel = label ?? t('timer.rest')
  const [phase, setPhase] = useState<Phase>(autoStart ? 'countdown' : 'idle')
  const [countdownNum, setCountdownNum] = useState<number>(3)
  /**
   * Duración con la que arranca la cuenta. Sale del prop, pero «↺» y «repetir» la
   * releen del total ya ajustado: quien sumó +30 s espera repetir esos 30 s.
   */
  const [duration, setDuration] = useState<number>(initialSeconds)
  /** Cambiarlo rearranca la cuenta con la misma duración (repetir sin tocar nada). */
  const [runId, setRunId] = useState<number>(0)
  const onCompleteRef = useRef(onComplete)
  const labelRef = useRef(effectiveLabel)
  onCompleteRef.current = onComplete
  labelRef.current = effectiveLabel

  useEffect(() => { setDuration(initialSeconds) }, [initialSeconds])

  const handleComplete = useCallback(() => {
    setPhase('done')
    notifyTimerDone(labelRef.current)
    onCompleteRef.current?.()
  }, [])

  // La cuenta, los umbrales y el «solo una vez» son los compartidos con el móvil: este
  // componente ya solo dibuja. Antes descontaba de un contador con `setInterval`, así
  // que se quedaba corto de verdad si la pestaña se dormía.
  const { secondsLeft: seconds, totalSeconds, progress, resync, adjust } = usePausableCountdown({
    seconds: duration,
    paused: phase !== 'running',
    thresholds: TIMER_CUE_THRESHOLDS,
    minTotalSeconds: 5,
    resetKey: runId,
    onCue: timerCues,
    onComplete: handleComplete,
  })

  useResyncOnVisible(resync)

  // 3-second countdown before exercise starts
  useEffect(() => {
    if (phase !== 'countdown') return
    setCountdownNum(3)
    timerCues('precount')

    const id = setInterval(() => {
      setCountdownNum(n => {
        if (n <= 1) {
          clearInterval(id)
          setPhase('running')
          return 0
        }
        timerCues('precount')
        return n - 1
      })
    }, 1000)

    return () => clearInterval(id)
  }, [phase])

  /** Vuelve al principio con el total que haya ahora (que puede venir de ±15/+30). */
  const restart = (next: Phase) => {
    setDuration(totalSeconds)
    setRunId(n => n + 1)
    setPhase(next)
  }

  const handleStart = () => {
    if (phase === 'done') { restart('countdown'); return }
    if (phase === 'paused') { setPhase('running'); return }
    setPhase('countdown')
  }

  const handlePause = () => setPhase('paused')

  const reset = () => restart('idle')

  const adjustTime = (delta: number) => { adjust(delta) }

  const remaining = seconds
  const strokeOffset = CIRC * (1 - progress)

  const isUrgent = remaining > 0 && remaining <= 10
  const ringColor =
    phase === 'done' ? 'hsl(160 84% 60%)' :
    phase === 'countdown' ? 'hsl(45 93% 58%)' :
    isUrgent ? 'hsl(var(--destructive))' :
    phase === 'running' ? 'hsl(var(--lime))' :
    'hsl(199 89% 62%)'

  const glowColor =
    phase === 'done' ? 'hsl(160 84% 60% / 0.25)' :
    phase === 'countdown' ? 'hsl(45 93% 58% / 0.2)' :
    isUrgent ? 'hsl(0 84% 60% / 0.2)' :
    phase === 'running' ? 'hsl(var(--lime) / 0.12)' :
    'transparent'

  return (
    <div className="flex flex-col items-center gap-4" role="timer" aria-label={effectiveLabel}>
      <style>{`
        @keyframes countPulse {
          0%   { transform: scale(0.5); opacity: 0; }
          40%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ringPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes timerPulseUrgent {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes doneCheck {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ringFlash {
          0%   { stroke-width: ${STROKE_W}; opacity: 1; }
          50%  { stroke-width: ${STROKE_W + 6}; opacity: 0.6; }
          100% { stroke-width: ${STROKE_W}; opacity: 1; }
        }
        @keyframes tickPulse {
          0%   { transform: scale(1); }
          15%  { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .timer-fade-in { animation: fadeSlideIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>

      <div
        className="relative rounded-full transition-shadow duration-500"
        style={{
          width: SIZE, height: SIZE,
          boxShadow: `0 0 40px ${glowColor}`,
          animation: isUrgent && phase === 'running' ? 'timerPulseUrgent 1s ease-in-out infinite' : undefined,
          willChange: phase === 'running' || phase === 'countdown' ? 'transform' : undefined,
        }}
      >
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          {/* Track */}
          <circle cx={HALF} cy={HALF} r={R} fill="none"
            stroke="hsl(var(--border))" strokeWidth={STROKE_W} opacity="0.3"/>
          {/* Progress ring */}
          <circle cx={HALF} cy={HALF} r={R} fill="none"
            stroke={ringColor}
            strokeWidth={STROKE_W}
            strokeDasharray={CIRC}
            strokeDashoffset={phase === 'countdown' ? 0 : strokeOffset}
            strokeLinecap="round"
            style={{
              transition: phase === 'countdown' ? 'stroke 0.3s' : 'stroke-dashoffset 0.9s linear, stroke 0.3s',
              animation: phase === 'countdown'
                ? 'ringPulse 1s ease-in-out infinite'
                : phase === 'done'
                  ? 'ringFlash 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
                  : undefined,
              willChange: 'stroke-dashoffset',
            }}
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center text-center">
          {phase === 'countdown' ? (
            <span
              key={countdownNum}
              className="font-bebas text-[72px] leading-none text-amber-400"
              style={{ animation: 'countPulse 0.6s cubic-bezier(0.22, 1, 0.36, 1) both' }}
            >
              {countdownNum}
            </span>
          ) : (
            <div className="flex flex-col items-center">
              {phase === 'done' ? (
                <div className="text-emerald-400" style={{ animation: 'doneCheck 0.4s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              ) : (
                <div
                key={phase === 'running' ? seconds : 'static'}
                className={`font-bebas leading-none ${
                  isUrgent ? 'text-destructive' : 'text-foreground'
                }`}
                style={{
                  fontSize: seconds >= 600 ? '36px' : '44px',
                  animation: phase === 'running' ? 'tickPulse 0.3s cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
                }}>
                  {formatCountdown(seconds)}
                </div>
              )}
              <div className="font-mono text-[10px] text-muted-foreground/60 tracking-[2px] mt-1">
                {phase === 'done' ? t('timer.completed') : effectiveLabel.toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* "Prepárate" label during countdown */}
      {phase === 'countdown' && (
        <div className="font-mono text-[11px] text-amber-400/70 tracking-[3px] uppercase timer-fade-in">
          {t('timer.getReady')}
        </div>
      )}

      {/* Time adjustment — only when idle or paused */}
      {(phase === 'idle' || phase === 'paused') && (
        <div className="flex gap-1.5 timer-fade-in">
          <Button size="sm" variant="outline" onClick={() => adjustTime(-15)}
            className="h-8 min-w-[44px] px-2.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
            -15s
          </Button>
          <Button size="sm" variant="outline" onClick={() => adjustTime(15)}
            className="h-8 min-w-[44px] px-2.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
            +15s
          </Button>
          <Button size="sm" variant="outline" onClick={() => adjustTime(30)}
            className="h-8 min-w-[44px] px-2.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
            +30s
          </Button>
        </div>
      )}

      {/* Controls */}
      <div key={phase} className="flex gap-2.5 timer-fade-in">
        {phase === 'running' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePause}
            className="font-mono text-[11px] tracking-[2px] text-destructive hover:text-destructive hover:bg-destructive/10 h-10 min-w-[44px] px-5"
          >
            {t('timer.pause')}
          </Button>
        ) : phase !== 'countdown' && (
          <Button
            size="sm"
            // Ghost a propósito, no `variant="lime"`: su hermano de pausa es un
            // ghost con `text-destructive` y sin filete, y darle borde y tinte
            // solo a este descuadraría la pareja.
            variant="ghost"
            onClick={handleStart}
            className="font-mono text-[11px] tracking-[2px] text-lime hover:text-lime hover:bg-lime/10 h-10 min-w-[44px] px-5"
          >
            {phase === 'done' ? t('timer.repeat') : phase === 'paused' ? t('timer.resume') : t('timer.start')}
          </Button>
        )}
        {(phase === 'paused' || phase === 'done') && (
          <Button size="sm" variant="outline" onClick={reset}
            aria-label={t('timer.reset')}
            className="font-mono text-[11px] min-w-[44px] h-10 px-3.5">
            ↺
          </Button>
        )}
      </div>
    </div>
  )
}
