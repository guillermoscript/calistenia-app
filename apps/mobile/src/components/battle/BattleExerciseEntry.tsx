/**
 * Entrada del ejercicio actual de una batalla.
 *
 * Un objetivo en repeticiones se registra con el contador ±; uno en segundos, con el
 * temporizador de verdad — el mismo que la sesión de fuerza, con su "prepárate" 3-2-1,
 * su aviso y su campana. Hasta ahora una plancha de 45 s se registraba tecleando un
 * número, que es justo la queja del #402.
 *
 * Es dueño de su propio valor a propósito: así el marcador de arriba, que tictaquea
 * cada segundo, no vuelve a pintar el contador ni al revés.
 */
import { useCallback, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { RepStepper } from '@/components/training/RepStepper'
import { TimerPanel } from '@/components/training/TimerPanel'
import { timerCues } from '@/lib/training-cues'
import { useExerciseTimer } from '@calistenia/core/hooks/useExerciseTimer'
import { serverNow } from '@calistenia/core/lib/serverClock'

export interface BattleExerciseEntryProps {
  /** Nombre ya traducido del ejercicio. */
  name: string
  targetKind: 'reps' | 'seconds'
  targetValue: number
  locked: boolean
  confirmLabel: string
  /** Repeticiones hechas, o segundos cumplidos. */
  onConfirm: (value: number) => void
}

export default function BattleExerciseEntry({
  name,
  targetKind,
  targetValue,
  locked,
  confirmLabel,
  onConfirm,
}: BattleExerciseEntryProps) {
  const { t } = useTranslation()
  const isTimed = targetKind === 'seconds'

  // El contador arranca en el objetivo: lo normal es completarlo, y ajustar a la baja
  // es un caso menos frecuente que confirmar.
  const [reps, setReps] = useState(targetValue)
  // Una batalla se mide contra el reloj del servidor, no contra el del teléfono.
  const timer = useExerciseTimer({
    initialSeconds: targetValue,
    now: serverNow,
    onCue: timerCues,
  })

  const value = isTimed ? timer.elapsedSeconds : reps
  const handleConfirm = useCallback(() => { onConfirm(value) }, [onConfirm, value])

  return (
    <View>
      <View className="items-center gap-4 py-6">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.currentExercise')}
        </Text>
        <Text className="text-center font-bebas text-5xl leading-none text-foreground">{name}</Text>
        <Text className="font-mono text-xs text-muted-foreground">
          {t('battle.target')} {targetValue}
          {isTimed ? 's' : ` ${t('battle.reps')}`}
        </Text>

        {isTimed ? (
          <TimerPanel
            phase={timer.phase}
            remainingSeconds={timer.remainingSeconds}
            precount={timer.precount}
            progress={timer.progress}
            endAt={timer.endAt}
            now={serverNow}
            canAdjust={timer.canAdjust}
            onStart={timer.start}
            onPause={timer.pause}
            onResume={timer.resume}
            onRepeat={timer.repeat}
            onReset={timer.reset}
            onAdjust={timer.adjust}
          />
        ) : (
          <View className="mt-2">
            <RepStepper value={reps} onChange={setReps} disabled={locked} />
          </View>
        )}
      </View>

      <Pressable
        onPress={handleConfirm}
        disabled={locked}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        className={cn(
          'h-16 items-center justify-center rounded-xl bg-lime active:bg-lime/90',
          locked && 'opacity-40',
        )}
      >
        <Text className="font-bebas text-2xl uppercase tracking-widest text-zinc-900">
          {confirmLabel}
          {isTimed ? `  ${value}s` : ''}
        </Text>
      </Pressable>
    </View>
  )
}
