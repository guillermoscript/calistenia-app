import { useEffect, useMemo, useState } from 'react'
import type { Exercise, ExerciseTiming } from '@calistenia/core/types'
import { getLocalQuote, type Quote } from '@calistenia/core/lib/quotes'
import { formatTimingClock, prepareTimingBreakdown } from '@calistenia/core/lib/exerciseTiming'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import Confetti from '../ui/Confetti'
import { Button } from '../ui/button'
import PostWorkoutActions from '../PostWorkoutActions'
import { cn } from '../../lib/utils'

interface CelebrateScreenProps {
  workoutTitle: string
  workoutKey: string
  totalSetsLogged: number
  durationMin: number
  exercises: Exercise[]
  timings: ExerciseTiming[]
  onDone: () => void
  onRepeat?: () => void
  onNavigateAway: (path: string) => void
}

/** Pantalla final: resultado, cita, desglose de tiempos y panel post-entreno. */
export default function CelebrateScreen({
  workoutTitle,
  workoutKey,
  totalSetsLogged,
  durationMin,
  exercises,
  timings,
  onDone,
  onRepeat,
  onNavigateAway,
}: CelebrateScreenProps) {
  const [quote, setQuote] = useState<Quote>(getLocalQuote)
  const timingBreakdown = useMemo(() => prepareTimingBreakdown(timings), [timings])

  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.postWorkoutActionViewed, {
      surface: 'post_workout',
      source: 'workout_completion',
      workout_id: workoutKey,
      result: 'viewed',
    })
  }, [workoutKey])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('https://zenquotes.io/api/random', { signal: ctrl.signal })
      .then(r => r.json())
      .then(([item]: [{ q?: string; a?: string }]) => { if (item?.q) setQuote(item as Quote) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])

  return (
    // a11y: "toca para continuar" a pantalla completa; el avance también ocurre
    // solo al terminar la animación. (Sin regla jsx-a11y activa: #484)
    <div
      onClick={onDone}
      className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] gap-7 cursor-pointer text-center relative w-full"
    >
      <Confetti />

      <div className="size-[88px] rounded-full bg-muted border border-border flex items-center justify-center text-[40px] leading-none text-lime"
        style={{ animation: 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
        ✓
      </div>

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

      <div style={{ animation: 'fadeUp 0.5s 0.15s ease-out both' }}>
        <div className="font-bebas tracking-[3px] text-foreground leading-none mb-2"
          style={{ fontSize: 'clamp(40px, 10vw, 64px)' }}>
          SESIÓN COMPLETADA
        </div>
        <div className="font-mono text-[11px] text-muted-foreground tracking-[2px]">
          {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
        </div>
      </div>

      <div className="max-w-[380px]" style={{ animation: 'fadeUp 0.5s 0.35s ease-out both' }}>
        <div className="h-px mb-6 bg-gradient-to-r from-transparent via-border to-transparent" />
        {quote && (
          <>
            <div className="text-base italic text-foreground/70 leading-relaxed mb-2.5">"{quote.q}"</div>
            <div className="font-mono text-[11px] text-muted-foreground tracking-wide">— {quote.a}</div>
          </>
        )}
        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {timingBreakdown.rows.length > 0 && (
        <div className="w-full max-w-[380px]" style={{ animation: 'fadeUp 0.5s 0.45s ease-out both' }}>
          <div className="text-[9px] font-mono tracking-[3px] text-muted-foreground uppercase mb-3">TIEMPO POR EJERCICIO</div>
          <div className="flex flex-col gap-1.5">
            {timingBreakdown.rows.map(row => (
              <div key={row.exerciseId} className="flex items-center gap-2">
                <div className="flex-1 min-w-0 relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${row.pct}%`,
                      background: row.isMax ? 'hsl(var(--lime) / 0.18)' : 'hsl(var(--muted))',
                    }}
                  />
                  <div className="relative px-2 py-1 text-[11px] truncate text-muted-foreground">
                    {row.exerciseName}
                  </div>
                </div>
                <div className={cn(
                  'font-mono text-[11px] tabular-nums flex-shrink-0',
                  row.isMax ? 'text-lime' : 'text-muted-foreground'
                )}>
                  {formatTimingClock(row.seconds)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PostWorkoutActions
        workoutKey={workoutKey}
        workoutTitle={workoutTitle}
        totalSets={totalSetsLogged}
        durationMin={durationMin}
        exercises={exercises}
        quote={quote}
        onRepeat={onRepeat}
        onNavigateAway={onNavigateAway}
      />

      <div style={{ animation: 'fadeUp 0.5s 0.7s ease-out both' }} className="flex flex-col items-center gap-3">
        <Button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDone() }}
          variant="limeSolid"
          className="min-w-[160px] sm:min-w-[200px] font-bebas text-xl tracking-[2px] px-9 py-3.5"
        >
          IR AL DASHBOARD
        </Button>
        <div className="text-[11px] text-muted-foreground/50 font-mono tracking-wide">o toca en cualquier lugar</div>
      </div>
    </div>
  )
}
