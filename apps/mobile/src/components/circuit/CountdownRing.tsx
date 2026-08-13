/**
 * Anillo de cuenta atrás del circuito.
 *
 * Era la tercera copia del mismo patrón (su propio `setInterval`, sus propios umbrales
 * de sonido, importando `sounds` y `haptics` a pelo). Ahora la cuenta es
 * `usePausableCountdown` de core —la misma que usan la sesión y las batallas— y el
 * anillo es el `CountdownRing` compartido, que anima en el hilo de UI en vez de saltar
 * de segundo en segundo.
 *
 * Mantiene su firma para que `app/circuit.tsx` no se entere: sigue recibiendo
 * `seconds`, `isPaused`, `label`, `labelColor` y `onComplete`.
 */
import { View } from 'react-native'

import { Text } from '@/components/ui/text'
import { circuitCues } from '@/lib/training-cues'
import { CountdownRing as SharedCountdownRing } from '@/components/training/CountdownRing'
import { TEAL, URGENT, URGENT_BELOW_SECONDS } from '@/components/training/constants'
import { formatCountdown } from '@calistenia/core/lib/countdown'
import { usePausableCountdown } from '@calistenia/core/hooks/usePausableCountdown'

const RING_SIZE = 200
const RING_STROKE = 8
// Espejo del token de borde del ring web, en hex para react-native-svg.
const COLOR_TRACK = '#27272a'

interface CountdownRingProps {
  seconds: number
  totalSeconds: number
  isPaused: boolean
  label: string
  labelColor: string
  onComplete: () => void
}

export default function CountdownRing({
  seconds: initialSeconds,
  totalSeconds,
  isPaused,
  label,
  labelColor,
  onComplete,
}: CountdownRingProps) {
  const { secondsLeft, progress, endAt, isRunning } = usePausableCountdown({
    seconds: initialSeconds,
    paused: isPaused,
    onCue: circuitCues,
    onComplete,
  })

  const isUrgent = secondsLeft > 0 && secondsLeft <= URGENT_BELOW_SECONDS
  const ringColor = secondsLeft <= 0 ? TEAL : isUrgent ? URGENT : labelColor

  return (
    <View className="items-center justify-center">
      <SharedCountdownRing
        // El progreso se dibuja sobre el total de la fase, que puede no ser la duración
        // con la que arrancó esta cuenta (p. ej. al reanudar a media fase).
        progress={totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : progress}
        endAt={endAt}
        running={isRunning}
        size={RING_SIZE}
        strokeWidth={RING_STROKE}
        color={ringColor}
        trackColor={COLOR_TRACK}
        trackOpacity={1}
      >
        <View className="absolute inset-0 items-center justify-center">
          <Text
            className={`font-bebas leading-none ${isUrgent ? 'text-destructive' : 'text-foreground'}`}
            style={{ fontSize: secondsLeft >= 600 ? 40 : 52 }}
          >
            {formatCountdown(secondsLeft)}
          </Text>
          <Text className="mt-1 font-mono text-[10px] tracking-[2px]" style={{ color: labelColor }}>
            {label}
          </Text>
        </View>
      </SharedCountdownRing>
    </View>
  )
}
