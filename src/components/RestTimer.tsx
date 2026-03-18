import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { playRestStart, playGetReady, playCountdownTick, playWarning, vibrate } from '../lib/sounds'

const LS_REST_PREFS = 'calistenia_rest_prefs'

function getRestPref(exerciseId?: string): number | null {
  if (!exerciseId) return null
  try {
    const prefs = JSON.parse(localStorage.getItem(LS_REST_PREFS) || '{}')
    return prefs[exerciseId] || null
  } catch { return null }
}

function saveRestPref(exerciseId: string, seconds: number) {
  try {
    const prefs = JSON.parse(localStorage.getItem(LS_REST_PREFS) || '{}')
    prefs[exerciseId] = seconds
    localStorage.setItem(LS_REST_PREFS, JSON.stringify(prefs))
  } catch {}
}

interface RestTimerProps {
  seconds?: number
  exerciseId?: string
  onDone?: () => void
}

export default function RestTimer({ seconds: initSecs = 90, exerciseId, onDone }: RestTimerProps) {
  const savedPref = exerciseId ? getRestPref(exerciseId) : null
  const startSecs = savedPref || initSecs
  const [s, setS] = useState<number>(startSecs)
  const [totalSecs, setTotalSecs] = useState<number>(startSecs)
  const [running, setRunning] = useState<boolean>(true)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sound on mount
  useEffect(() => { playRestStart() }, [])

  useEffect(() => {
    if (!running) return
    ref.current = setInterval(() => {
      setS(prev => {
        if (prev <= 1) {
          clearInterval(ref.current!)
          playGetReady()
          vibrate([200, 100, 200])
          onDone?.()
          return 0
        }
        // Warning at 10s
        if (prev === 11) { playWarning(); vibrate([100]) }
        // Countdown 3, 2, 1
        if (prev <= 4 && prev > 1) { playCountdownTick(); vibrate([50]) }
        return prev - 1
      })
    }, 1000)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [running])

  const adjustTime = (delta: number) => {
    const newTotal = Math.max(10, totalSecs + delta)
    const newS = Math.max(1, s + delta)
    setTotalSecs(newTotal)
    setS(newS)
    if (exerciseId) saveRestPref(exerciseId, newTotal)
  }

  return (
    <div className="fixed bottom-6 right-6 z-[999] bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 shadow-lg animate-[slideUp_0.3s_ease]">
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      <div>
        <div className="font-mono text-[10px] text-muted-foreground tracking-[2px] mb-0.5">DESCANSO</div>
        <div className={`font-bebas text-[36px] leading-none ${s < 10 ? 'text-destructive' : 'text-[hsl(var(--lime))]'}`}>
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {/* Adjust buttons */}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => adjustTime(-15)}
            className="h-6 w-9 px-0 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            -15
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => adjustTime(15)}
            className="h-6 w-9 px-0 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            +15
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => adjustTime(30)}
            className="h-6 w-9 px-0 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            +30
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { if (ref.current) clearInterval(ref.current); setRunning(false); onDone?.() }}
          className="font-mono text-[10px] tracking-wide text-[hsl(var(--lime))] border-[hsl(var(--lime))]/30 hover:bg-[hsl(var(--lime))]/10 hover:text-[hsl(var(--lime))]"
        >
          SALTAR
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRunning(r => !r)}
          className="font-mono text-[10px] text-muted-foreground"
        >
          {running ? 'PAUSA' : 'RESUME'}
        </Button>
      </div>
    </div>
  )
}
