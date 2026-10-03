/**
 * Entrada del ejercicio actual: contador ± para repeticiones, temporizador real (con su
 * «prepárate») para objetivos en segundos. Dueño de su propio valor para que el marcador,
 * que tictaquea, no lo repinte.
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react'

import { useExerciseTimer } from '@calistenia/core/hooks/useExerciseTimer'
import { serverNow } from '@calistenia/core/lib/serverClock'
import { timerCues } from '../../lib/training-cues'
import { Button } from '../ui/button'
import { Kicker } from '../ui/kicker'

export interface BattleExerciseEntryProps {
  name: string
  targetKind: 'reps' | 'seconds'
  targetValue: number
  locked: boolean
  confirmLabel: string
  /** Repeticiones hechas, o segundos cumplidos. */
  onConfirm: (value: number) => void
}

export default function BattleExerciseEntry({ name, targetKind, targetValue, locked, confirmLabel, onConfirm }: BattleExerciseEntryProps) {
  const { t } = useTranslation()
  const isTimed = targetKind === 'seconds'
  // Lo normal es completar el objetivo: el contador arranca en él.
  const [reps, setReps] = useState(targetValue)
  const timer = useExerciseTimer({ initialSeconds: targetValue, now: serverNow, onCue: timerCues })

  const value = isTimed ? timer.elapsedSeconds : reps
  const handleConfirm = useCallback(() => onConfirm(value), [onConfirm, value])
  const stepBtn = 'size-12 rounded-full'

  return (
    <div>
      <div className="flex flex-col items-center gap-4 py-8">
        <Kicker>{t('battle.currentExercise')}</Kicker>
        <h2 className="text-center font-bebas text-5xl md:text-6xl leading-none">{name}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {t('battle.target')} {targetValue}{isTimed ? 's' : ` ${t('battle.reps')}`}
        </p>

        {isTimed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="font-mono text-6xl tabular-nums" role="timer" aria-live="off">
              {timer.phase === 'countdown' ? timer.precount : timer.remainingSeconds}
            </div>
            <div className="flex gap-2">
              {timer.phase === 'idle' && <Button variant="outline" className="h-11" onClick={timer.start} disabled={locked}>{t('battle.start')}</Button>}
              {timer.phase === 'running' && <Button variant="outline" className="h-11" onClick={timer.pause}>II</Button>}
              {timer.phase === 'paused' && <Button variant="outline" className="h-11" onClick={timer.resume}>▶</Button>}
              {timer.phase !== 'idle' && <Button variant="ghost" className="h-11" onClick={timer.reset}>↺</Button>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <Button variant="outline" size="icon" className={stepBtn} disabled={locked || reps <= 0} onClick={() => setReps(r => Math.max(0, r - 1))} aria-label="-1">
              <Minus className="size-5" aria-hidden />
            </Button>
            <span className="min-w-16 text-center font-bebas text-6xl tabular-nums">{reps}</span>
            <Button variant="outline" size="icon" className={stepBtn} disabled={locked} onClick={() => setReps(r => r + 1)} aria-label="+1">
              <Plus className="size-5" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <Button className="h-14 w-full font-bebas text-2xl tracking-widest uppercase" disabled={locked} onClick={handleConfirm}>
        {confirmLabel}{isTimed ? `  ${value}s` : ''}
      </Button>
    </div>
  )
}
