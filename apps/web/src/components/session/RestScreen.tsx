import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { usePausableCountdown } from '@calistenia/core/hooks/usePausableCountdown'
import { formatCountdown, type CountdownCue } from '@calistenia/core/lib/countdown'
import { PRIORITY_COLORS } from '@calistenia/core/lib/style-tokens'
import type { Step } from '@calistenia/core/lib/session-machine'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import * as notif from '../../lib/notifications'
import { restCues } from '../../lib/training-cues'
import { useResyncOnVisible } from '../../hooks/useResyncOnVisible'

interface RestScreenProps {
  seconds: number
  exerciseId?: string
  nextStep: Step | null
  onSkip: () => void
  savedRest?: number
  onAdjust?: (exerciseId: string, seconds: number) => void
}

export default function RestScreen({ seconds: defaultSeconds, exerciseId, nextStep, onSkip, savedRest, onAdjust }: RestScreenProps) {
  const { t } = useTranslation()
  const initialSeconds = savedRest || defaultSeconds
  const touchStartX = useRef<number | null>(null)
  const hasNotifiedStart = useRef<boolean>(false)
  const onSkipRef = useRef(onSkip)
  const nextStepRef = useRef(nextStep)
  onSkipRef.current = onSkip
  nextStepRef.current = nextStep

  // Las notificaciones no caben en `restCues` porque dependen del siguiente ejercicio,
  // así que se componen encima: el sonido lo pone la plataforma, el texto esta pantalla.
  const handleCue = useCallback((cue: CountdownCue) => {
    restCues(cue)
    if (cue === 'warning') notif.notifyRestEnding(10)
    if (cue === 'complete') {
      const ns = nextStepRef.current
      if (ns) notif.notifyRestDone(ns.exercise.name, ns.setNumber, ns.totalSets)
    }
  }, [])

  const handleComplete = useCallback(() => { onSkipRef.current() }, [])

  const { secondsLeft: remaining, progress, resync, adjust } =
    usePausableCountdown({
      seconds: initialSeconds,
      onCue: handleCue,
      onComplete: handleComplete,
    })

  useResyncOnVisible(resync)

  // Play rest-start sound + notification on mount
  useEffect(() => {
    if (!hasNotifiedStart.current) {
      hasNotifiedStart.current = true
      restCues('start')
      notif.notifyRestStart(initialSeconds, nextStep?.exercise.name)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- sonido y aviso de inicio de descanso, una vez al montar

  const handleTouchStart = (e: React.TouchEvent): void => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e: React.TouchEvent): void => {
    if (touchStartX.current !== null && e.changedTouches[0].clientX - touchStartX.current > 60) onSkip()
    touchStartX.current = null
  }

  const adjustTime = (delta: number) => {
    const newTotal = adjust(delta)
    if (exerciseId && onAdjust) onAdjust(exerciseId, newTotal)
  }

  const pct  = progress
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
            {formatCountdown(remaining)}
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
        variant="lime"
        onClick={onSkip}
        className="font-mono text-[11px] tracking-[2px] px-8"
      >
        {t('session.skipRest')}
      </Button>

      <div className="text-[11px] text-muted-foreground/50 font-mono sm:hidden">{t('session.swipeToSkip')}</div>
    </div>
  )
}
