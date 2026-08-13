/**
 * Pantalla de descanso, sin dominio.
 *
 * Recibe segundos y callbacks, nunca un `Step` ni un `BattleSnapshot`: eso es
 * precisamente lo que ataba el descanso a la sesión de fuerza. Lo que cada llamador
 * quiera enseñar debajo del anillo (la tarjeta del siguiente ejercicio, una línea con
 * el nombre del rival…) entra por `children`.
 */
import { memo, type ReactNode } from 'react'
import { View, Pressable } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { CountdownRing } from '@/components/training/CountdownRing'
import { LIME, URGENT, URGENT_BELOW_SECONDS } from '@/components/training/constants'
import { formatCountdown } from '@calistenia/core/lib/countdown'

export interface RestPanelProps {
  secondsLeft: number
  /** Fracción pendiente en [0, 1]. */
  progress: number
  /** Instante de fin, para que el anillo se anime en el hilo de UI. */
  endAt?: number | null
  now?: () => number
  /** Kicker de arriba, ya traducido ("DESCANSANDO", "DESCANSO"…). */
  label: string
  skipLabel: string
  onSkip: () => void
  /** Deltas de los botones ±. Sin ellos (o sin `onAdjust`) la fila no se pinta. */
  adjustDeltas?: readonly number[]
  onAdjust?: (deltaSeconds: number) => void
  ringSize?: number
  children?: ReactNode
}

function RestPanelComponent({
  secondsLeft,
  progress,
  endAt = null,
  now,
  label,
  skipLabel,
  onSkip,
  adjustDeltas,
  onAdjust,
  ringSize = 148,
  children,
}: RestPanelProps) {
  const isUrgent = secondsLeft > 0 && secondsLeft < URGENT_BELOW_SECONDS
  const showAdjust = !!onAdjust && !!adjustDeltas && adjustDeltas.length > 0

  return (
    <View className="items-center gap-7 px-6">
      <Text className="font-mono text-[11px] uppercase tracking-[4px] text-muted-foreground">
        {label}
      </Text>

      <CountdownRing
        progress={progress}
        endAt={endAt}
        running={endAt !== null}
        now={now}
        size={ringSize}
        color={isUrgent ? URGENT : LIME}
      >
        <View className="absolute inset-0 items-center justify-center">
          <Text
            className={cn(
              'font-bebas text-[46px] tracking-[2px] tabular-nums leading-none',
              isUrgent ? 'text-destructive' : 'text-foreground',
            )}
          >
            {formatCountdown(secondsLeft)}
          </Text>
        </View>
      </CountdownRing>

      {children}

      {showAdjust ? (
        <View className="flex-row gap-2">
          {adjustDeltas.map((delta) => (
            <Pressable
              key={delta}
              onPress={() => onAdjust(delta)}
              className="h-9 min-w-[52px] items-center justify-center rounded-md border border-border px-3 active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={delta > 0 ? `+${delta}s` : `${delta}s`}
            >
              <Text className="font-mono text-[11px] text-muted-foreground">
                {delta > 0 ? `+${delta}s` : `${delta}s`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={onSkip}
        className="h-12 items-center justify-center rounded-xl border border-lime/25 bg-lime/10 px-8 active:bg-lime/20"
        accessibilityRole="button"
        accessibilityLabel={skipLabel}
      >
        <Text className="font-mono text-[11px] uppercase tracking-[2px] text-lime">{skipLabel}</Text>
      </Pressable>
    </View>
  )
}

export const RestPanel = memo(RestPanelComponent)
