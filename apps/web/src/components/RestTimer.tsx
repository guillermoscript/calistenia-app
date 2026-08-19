import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { usePausableCountdown } from '@calistenia/core/hooks/usePausableCountdown'
import { formatCountdown } from '@calistenia/core/lib/countdown'
import { restCues } from '../lib/training-cues'
import { useResyncOnVisible } from '../hooks/useResyncOnVisible'

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
  const [running, setRunning] = useState<boolean>(true)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const handleComplete = useCallback(() => { onDoneRef.current?.() }, [])

  const { secondsLeft: s, resync, adjust } = usePausableCountdown({
    seconds: startSecs,
    paused: !running,
    onCue: restCues,
    onComplete: handleComplete,
  })

  useResyncOnVisible(resync)

  useEffect(() => { restCues('start') }, [])

  const adjustTime = (delta: number) => {
    const newTotal = adjust(delta)
    if (exerciseId && onAdjust) onAdjust(exerciseId, newTotal)
  }

  return (
    <div className="fixed bottom-6 right-6 z-[999] bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 shadow-lg animate-[slideUp_0.3s_ease]">
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      <div>
        <div className="font-mono text-[10px] text-muted-foreground tracking-[2px] mb-0.5">{t('common.rest').toUpperCase()}</div>
        <div className={`font-bebas text-[36px] leading-none ${s < 10 ? 'text-destructive' : 'text-[hsl(var(--lime))]'}`}>
          {formatCountdown(s)}
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
        <Button size="sm" variant="lime"
          onClick={() => { setRunning(false); onDone?.() }}
          className="font-mono text-[10px] tracking-wide">
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
