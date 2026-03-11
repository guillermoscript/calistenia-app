import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'

export default function Timer({ initialSeconds = 60, onComplete, autoStart = false, label = "Descanso" }) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [running, setRunning] = useState(autoStart)
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            setDone(true)
            onComplete?.()
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)()
              ;[0, 0.15, 0.3].forEach(delay => {
                const o = ctx.createOscillator(); const g = ctx.createGain()
                o.connect(g); g.connect(ctx.destination)
                o.frequency.value = 880; o.type = 'sine'
                g.gain.setValueAtTime(0.3, ctx.currentTime + delay)
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2)
                o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.2)
              })
            } catch (e) {}
            return 0
          }
          return s - 1
        })
      }, 1000)
    }
    return () => clearInterval(intervalRef.current)
  }, [running, seconds])

  const toggle = () => {
    if (done) { setSeconds(initialSeconds); setDone(false); setRunning(true); return }
    setRunning(r => !r)
  }
  const reset = () => { clearInterval(intervalRef.current); setSeconds(initialSeconds); setRunning(false); setDone(false) }

  const pct = ((initialSeconds - seconds) / initialSeconds) * 100
  const r = 52; const circ = 2 * Math.PI * r
  const strokeDash = circ * (1 - pct / 100)

  // SVG stroke: done=emerald, running=lime, paused=sky
  const ringColor = done
    ? 'hsl(160 84% 60%)'
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
            strokeWidth="6" strokeDasharray={circ} strokeDashoffset={strokeDash}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <div>
            <div className={`font-bebas text-[32px] leading-none ${done ? 'text-emerald-400' : 'text-foreground'}`}>
              {done ? '✓' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
            </div>
            <div className="font-mono text-[9px] text-muted-foreground tracking-wide">
              {done ? 'LISTO' : label.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
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
