import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp } from 'lucide-react'
import type { Exercise, ExerciseLog } from '@calistenia/core/types'
import {
  useProgressionSuggestion,
  useAcceptProgression,
} from '@calistenia/core/hooks/useAutoProgression'
import { useWorkoutState } from '../../contexts/WorkoutContext'
import { useAuthState } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

interface ProgressionChipProps {
  exercise: Exercise
  /** Sesiones pasadas de ESTE ejercicio, más reciente primero. */
  logs: ExerciseLog[]
}

/**
 * «Sugerido: 3×11» / «Prueba: Flexión estándar», con un toque para aceptar (#617).
 *
 * No se pinta nada salvo que la inscripción tenga el opt-in encendido Y la lib
 * tenga algo seguro que proponer, que es la excepción y no la regla. El
 * componente decide eso él solo en vez de recibirlo por props porque
 * `ExerciseScreen` está memoizado y una prop más recalculada en cada render le
 * rompería el `memo` (el mismo motivo por el que `SessionView` memoiza `logs`).
 */
const ProgressionChip = memo(function ProgressionChip({ exercise, logs }: ProgressionChipProps) {
  const { t } = useTranslation()
  const { activeProgram, activeEnrollment } = useWorkoutState()
  const { userId } = useAuthState()
  const accept = useAcceptProgression()
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle')

  const suggestion = useProgressionSuggestion(exercise, logs, {
    enabled: !!activeEnrollment?.auto_progress,
  })

  if (!suggestion || !activeProgram || !userId) return null

  const label = suggestion.kind === 'variant'
    ? t('progression.tryVariant', { name: suggestion.exerciseName })
    : suggestion.unit === 'seconds'
      ? t('progression.suggestedSeconds', { sets: suggestion.sets, seconds: suggestion.to })
      : t('progression.suggestedReps', { sets: suggestion.sets, reps: suggestion.to })

  const onAccept = async (): Promise<void> => {
    if (state !== 'idle') return
    setState('saving')
    const ok = await accept({
      suggestion,
      exercise,
      programId: activeProgram.id,
      programOwnerId: activeProgram.created_by ?? null,
      userId,
    })
    setState(ok ? 'done' : 'failed')
  }

  return (
    // El margen inferior va aquí y no en quien lo monta: el componente devuelve
    // `null` la mayoría de las veces, así que un contenedor con margen fuera
    // dejaría un hueco en blanco en todas las sesiones sin sugerencia.
    <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-lime/10 border border-lime/30">
      <TrendingUp className="w-4 h-4 shrink-0 text-lime" aria-hidden />
      <span className="text-sm font-medium flex-1 min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onAccept}
        disabled={state !== 'idle'}
        className={cn(
          'text-sm font-semibold px-3 py-1 rounded-lg shrink-0',
          // `text-lime-foreground` y no blanco: sobre `--lime` en claro el
          // blanco da 2,33:1 y suspende contraste (#548).
          state === 'idle' && 'bg-lime text-lime-foreground active:scale-95',
          state !== 'idle' && 'opacity-70',
        )}
      >
        {state === 'done'
          ? t('progression.accepted')
          : state === 'failed'
            ? t('progression.failed')
            : t('progression.accept')}
      </button>
    </div>
  )
})

export default ProgressionChip
