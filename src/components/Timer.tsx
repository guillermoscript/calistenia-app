import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from './ui/button'
import { playTimerComplete, playCountdownTick, playWarning, vibrate } from '../lib/sounds'
import { notifyTimerDone } from '../lib/notifications'

interface TimerProps {
  initialSeconds?: number
  onComplete?: () => void
  autoStart?: boolean
  label?: string
}

export default function Timer({ initialSeconds = 60, onComplete, autoStart = false, label = "Descanso" }: TimerProps) {
  const [seconds, setSeconds] = useState<number>(initialSeconds)
  const [totalSeconds, setTotalSeconds] = useState<number>(initialSeconds)
  const [running, setRunning] = useState<boolean>(autoStart)
  const [done, setDone] = useState<boolean>(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }, [])

  // Single interval — only re-create when running state changes, not on every tick
  useEffect(() => {
    if (!running) { clearTimer(); return }

    intervalRef.current = setInterval(() => {
      setSeconds(s => {
        // Sound effects based on remaining time
        if (s === 11) { playWarning(); vibrate([100]) }
        if (s >= 2 && s <= 4) { playCountdownTick(); vibrate([50]) }

        if (s <= 1) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          setRunning(false)
          setDone(true)
          playTimerComplete()
          vibrate([200, 100, 200])
          notifyTimerDone(label)
          onCompleteRef.current?.()
          return 0
        }
        return s - 1
      })
    }, 1000)

    return clearTimer
  }, [running, clearTimer, label])

  const toggle = () => {
    if (done) { setSeconds(totalSeconds); setDone(false); setRunning(true); return }
    setRunning(r => !r)
  }

  const reset = () => {
    clearTimer()
    setSeconds(totalSeconds)
    setRunning(false)
    setDone(false)
  }

  const adjustTime = (delta: number) => {
    const newTotal = Math.max(5, totalSeconds + delta)
    setTotalSeconds(newTotal)
    setSeconds(s => Math.max(1, s + delta))
  }

  // Ring: starts FULL (offset = 0), drains to EMPTY (offset = circ)
  const remaining = done ? 0 : seconds
  const pct = totalSeconds > 0 ? remaining / totalSeconds : 0
  const r = 52
  const circ = 2 * Math.PI * r
  const strokeOffset = circ * (1 - pct)

  // SVG stroke: done=emerald, running=lime, paused=sky
  const isUrgent = remaining > 0 && remaining <= 10
  const ringColor = done
    ? 'hsl(160 84% 60%)'
    : isUrgent
      ? 'hsl(var(--destructive))'
      : running
        ? 'hsl(var(--lime))'
        : 'hsl(199 89% 62%)'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[130px] h-[130px]">
        <svg width="130" height="130" className="-rotate-90">
          <circle cx="65" cy="65" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="6"/>
          <circle cx="65" cy="65" r={r} fill="none"
            stroke={ringColor}
            strokeWidth="6"
            strokeDasharray={circ}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <div>
            <div className={`font-bebas text-[32px] leading-none transition-colors duration-300 ${
              done ? 'text-emerald-400' : isUrgent ? 'text-destructive' : 'text-foreground'
            }`}>
              {done ? '✓' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
            </div>
            <div className="font-mono text-[9px] text-muted-foreground tracking-wide">
              {done ? 'LISTO' : label.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Time adjustment */}
      {!done && (
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => adjustTime(-15)}
            className="h-6 px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground">-15s</Button>
          <Button size="sm" variant="outline" onClick={() => adjustTime(15)}
            className="h-6 px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground">+15s</Button>
          <Button size="sm" variant="outline" onClick={() => adjustTime(30)}
            className="h-6 px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground">+30s</Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={toggle}
          className={
            running
              ? 'font-mono text-[11px] tracking-[2px] text-destructive hover:text-destructive hover:bg-destructive/10'
              : 'font-mono text-[11px] tracking-[2px] text-[hsl(var(--lime))] hover:text-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/10'
          }
        >
          {done ? 'REPETIR' : running ? 'PAUSAR' : 'INICIAR'}
        </Button>
        <Button size="sm" variant="outline" onClick={reset} className="font-mono text-[11px] px-3.5">
          ↺
        </Button>
      </div>
    </div>
  )
}
