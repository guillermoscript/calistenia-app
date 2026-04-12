import { useEffect, useRef } from 'react'
import { useRaceCountdown, useRaceContext } from '../../contexts/RaceContext'
import { playCountdownTick, playSessionComplete, vibrate } from '../../lib/sounds'

export default function RaceCountdown() {
  const { race } = useRaceContext()
  const { secondsLeft } = useRaceCountdown()
  const lastTickedRef = useRef<number | null>(null)

  useEffect(() => {
    if (secondsLeft <= 0) return
    if (lastTickedRef.current === secondsLeft) return
    lastTickedRef.current = secondsLeft
    if (secondsLeft <= 3) {
      playCountdownTick()
      vibrate(150)
    } else if (secondsLeft <= 5) {
      playCountdownTick()
      vibrate(80)
    }
  }, [secondsLeft])

  useEffect(() => {
    if (secondsLeft === 0) {
      playSessionComplete()
      vibrate([200, 100, 200, 100, 400])
    }
  }, [secondsLeft])

  return (
    <div className="fixed inset-0 z-[10000] bg-background/98 flex items-center justify-center">
      <div className="text-center">
        <div
          key={secondsLeft}
          className="font-bebas text-[140px] text-lime leading-none"
          style={{ animation: 'countdown-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          {secondsLeft === 0 ? '¡GO!' : secondsLeft}
        </div>
        <div className="text-muted-foreground font-mono text-sm tracking-widest mt-6">
          {race?.name}
        </div>
      </div>
      <style>{`
        @keyframes countdown-pop {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
