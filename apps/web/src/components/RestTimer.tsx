import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { playRestStart, playGetReady, playCountdownTick, playWarning, vibrate } from '../lib/sounds'

interface RestTimerProps {
  seconds?: number
  exerciseId?: string
  onDone?: () => void
  onAdjust?: (exerciseId: string, seconds: number) => void
  savedRest?: number
}

export default function RestTimer({ seconds: initSecs = 90, exerciseId, onDone, onAdjust, savedRest }: RestTimerProps) {
  const { t } = useTranslation()
  const startSecs = savedRest || initSecs
  const [s, setS] = useState<number>(startSecs)
  const [totalSecs, setTotalSecs] = useState<number>(startSecs)
  const [running, setRunning] = useState<boolean>(true)
  const endAtRef = useRef<number>(Date.now() + startSecs * 1000)
  const pausedRemainingRef = useRef<number>(startSecs)
  const lastSRef = useRef<number>(startSecs)
  const hasWarnedRef = useRef<boolean>(false)
  const hasFinishedRef = useRef<boolean>(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => { playRestStart() }, [])

  useEffect(() => {
    if (!running) {
      pausedRemainingRef.current = Math.max(1, Math.ceil((endAtRef.current - Date.now()) / 1000))
      return
    }
    endAtRef.current = Date.now() + pausedRemainingRef.current * 1000

    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      const prev = lastSRef.current
      if (rem !== prev) {
        if (prev > 10 && rem <= 10 && rem > 0 && !hasWarnedRef.current) {
          hasWarnedRef.current = true
          playWarning()
          vibrate([100])
        }
        if (rem > 0 && rem <= 3 && prev === rem + 1 && !document.hidden) {
          playCountdownTick()
          vibrate([50])
        }
        lastSRef.current = rem
        setS(rem)
      }
      if (rem <= 0 && !hasFinishedRef.current) {
        hasFinishedRef.current = true
        playGetReady()
        vibrate([200, 100, 200])
        onDoneRef.current?.()
      }
    }
    const id = setInterval(tick, 250)
    const onVis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  const adjustTime = (delta: number) => {
    const newTotal = Math.max(10, totalSecs + delta)
    setTotalSecs(newTotal)
    if (running) {
      endAtRef.current += delta * 1000
      const rem = Math.max(1, Math.ceil((endAtRef.current - Date.now()) / 1000))
      lastSRef.current = rem
      setS(rem)
    } else {
      const rem = Math.max(1, pausedRemainingRef.current + delta)
      pausedRemainingRef.current = rem
      lastSRef.current = rem
      setS(rem)
    }
    if (exerciseId && onAdjust) onAdjust(exerciseId, newTotal)
  }

  return (
    <div className="fixed bottom-6 right-6 z-[999] bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 shadow-lg animate-[slideUp_0.3s_ease]">
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      <div>
        <div className="font-mono text-[10px] text-muted-foreground tracking-[2px] mb-0.5">{t('common.rest').toUpperCase()}</div>
        <div className={`font-bebas text-[36px] leading-none ${s < 10 ? 'text-destructive' : 'text-[hsl(var(--lime))]'}`}>
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => adjustTime(-15)}
            className="h-6 w-9 px-0 text-[10px] font-mono text-muted-foreground hover:text-foreground">-15</Button>
          <Button size="sm" variant="outline" onClick={() => adjustTime(15)}
            className="h-6 w-9 px-0 text-[10px] font-mono text-muted-foreground hover:text-foreground">+15</Button>
          <Button size="sm" variant="outline" onClick={() => adjustTime(30)}
            className="h-6 w-9 px-0 text-[10px] font-mono text-muted-foreground hover:text-foreground">+30</Button>
        </div>
        <Button size="sm" variant="outline"
          onClick={() => { setRunning(false); onDone?.() }}
          className="font-mono text-[10px] tracking-wide text-[hsl(var(--lime))] border-[hsl(var(--lime))]/30 hover:bg-[hsl(var(--lime))]/10 hover:text-[hsl(var(--lime))]">
          {t('workout.skip')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRunning(r => !r)}
          className="font-mono text-[10px] text-muted-foreground">
          {running ? t('workout.pause') : t('workout.resume')}
        </Button>
      </div>
    </div>
  )
}
