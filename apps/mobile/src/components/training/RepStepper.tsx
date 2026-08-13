/**
 * Contador de repeticiones con ±. Un número y dos callbacks, nada más.
 */
import { memo, useCallback } from 'react'
import { View, Pressable } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { MUTED } from '@/components/training/constants'

export interface RepStepperProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  decrementLabel?: string
  incrementLabel?: string
}

function RepStepperComponent({
  value,
  onChange,
  disabled = false,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  decrementLabel,
  incrementLabel,
}: RepStepperProps) {
  const decrement = useCallback(() => { onChange(Math.max(min, value - step)) }, [onChange, min, step, value])
  const increment = useCallback(() => { onChange(Math.min(max, value + step)) }, [onChange, max, step, value])

  return (
    <View className="flex-row items-center gap-6">
      <Pressable
        onPress={decrement}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={decrementLabel ?? `-${step}`}
        className={cn(
          'size-14 items-center justify-center rounded-full border border-border active:bg-muted/50',
          disabled && 'opacity-40',
        )}
      >
        <Minus size={20} color={MUTED} />
      </Pressable>

      <Text className="min-w-24 text-center font-bebas text-6xl leading-none text-lime">{value}</Text>

      <Pressable
        onPress={increment}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={incrementLabel ?? `+${step}`}
        className={cn(
          'size-14 items-center justify-center rounded-full border border-border active:bg-muted/50',
          disabled && 'opacity-40',
        )}
      >
        <Plus size={20} color={MUTED} />
      </Pressable>
    </View>
  )
}

export const RepStepper = memo(RepStepperComponent)
