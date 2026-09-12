import { memo, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { TrendingUp } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState } from '@/contexts/WorkoutContext'
import type { Exercise, ExerciseLog } from '@calistenia/core/types'
import {
  useProgressionSuggestion,
  useAcceptProgression,
} from '@calistenia/core/hooks/useAutoProgression'

interface ProgressionChipProps {
  exercise: Exercise
  /** Sesiones pasadas de ESTE ejercicio, más reciente primero. */
  logs: ExerciseLog[]
}

/**
 * «Sugerido: 3×11» / «Prueba: Flexión estándar», con un toque para aceptar (#617).
 *
 * Gemelo del de `apps/web`: la regla vive entera en `suggestProgression` y aquí
 * solo cambia cómo se pinta. No se pinta nada salvo que la inscripción tenga el
 * opt-in encendido Y haya algo seguro que proponer, que es la excepción.
 */
const ProgressionChip = memo(function ProgressionChip({ exercise, logs }: ProgressionChipProps) {
  const { t } = useTranslation()
  const { activeProgram, activeEnrollment } = useWorkoutState()
  const user = useAuthUser()
  const accept = useAcceptProgression()
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle')

  const suggestion = useProgressionSuggestion(exercise, logs, {
    enabled: !!activeEnrollment?.auto_progress,
  })

  if (!suggestion || !activeProgram || !user?.id) return null

  const label = suggestion.kind === 'variant'
    ? t('progression.tryVariant', { name: suggestion.exerciseName })
    : suggestion.unit === 'seconds'
      ? t('progression.suggestedSeconds', { sets: suggestion.sets, seconds: suggestion.to })
      : t('progression.suggestedReps', { sets: suggestion.sets, reps: suggestion.to })

  const onAccept = async (): Promise<void> => {
    if (state !== 'idle') return
    haptics.selection()
    setState('saving')
    const ok = await accept({
      suggestion,
      exercise,
      programId: activeProgram.id,
      programOwnerId: activeProgram.created_by ?? null,
      userId: user.id,
    })
    setState(ok ? 'done' : 'failed')
  }

  return (
    // El margen va aquí y no en quien lo monta: el componente devuelve `null` la
    // mayoría de las veces y un contenedor con margen fuera dejaría un hueco en
    // todas las sesiones sin sugerencia.
    <View className="mb-4 flex-row items-center gap-2 rounded-xl border border-lime/30 bg-lime/10 px-3 py-2">
      <TrendingUp size={16} className="shrink-0 text-lime" />
      {/* `flex-1` + `shrink` explícito: en RN `flexShrink` es 0 por defecto y sin
          esto el texto largo empuja al botón fuera de la pantalla. */}
      <Text className="min-w-0 flex-1 shrink text-sm font-medium text-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={onAccept}
        disabled={state !== 'idle'}
        accessibilityRole="button"
        accessibilityLabel={t('progression.accept')}
        className={cn(
          'shrink-0 rounded-lg px-3 py-1',
          state === 'idle' ? 'bg-lime' : 'bg-lime opacity-70',
        )}
      >
        {/* `text-lime-foreground` y no blanco: sobre `--lime` en claro el blanco
            da 2,33:1 y suspende contraste (#548). */}
        <Text className="text-sm font-semibold text-lime-foreground">
          {state === 'done'
            ? t('progression.accepted')
            : state === 'failed'
              ? t('progression.failed')
              : t('progression.accept')}
        </Text>
      </Pressable>
    </View>
  )
})

export default ProgressionChip
