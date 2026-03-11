import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'

export default function RestTimer({ seconds: initSecs = 90, onDone }) {
  const [s, setS] = useState(initSecs)
  const [running, setRunning] = useState(true)
  const ref = useRef()

  useEffect(() => {
    if (!running) return
    ref.current = setInterval(() => {
      setS(prev => {
        if (prev <= 1) {
          clearInterval(ref.current)
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const o = ctx.createOscillator(); const g = ctx.createGain()
            o.connect(g); g.connect(ctx.destination)
            o.frequency.value = 660; g.gain.setValueAtTime(0.4, ctx.currentTime)
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
            o.start(); o.stop(ctx.currentTime + 0.5)
          } catch (e) {}
          onDone?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(ref.current)
  }, [running])

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
        <Button
          size="sm"
          variant="outline"
          onClick={() => { clearInterval(ref.current); setRunning(false); onDone?.() }}
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
