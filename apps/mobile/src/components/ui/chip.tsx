/** Chip seleccionable (formularios de config). */
import { useRef } from 'react'
import { Animated, Platform, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'

interface ChipProps {
  label: string
  active: boolean
  onPress: () => void
  className?: string
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function Chip({ label, active, onPress, className }: ChipProps) {
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    if (Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 3 }).start()
      haptics.selection()
    }
  }

  const handlePressOut = () => {
    if (Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 3 }).start()
    }
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={{ transform: [{ scale }] } as any}
      className={cn(
        'rounded-lg border px-3 py-2 active:opacity-70',
        active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
        className,
      )}
    >
      <Text
        className={cn(
          'font-mono text-xs uppercase tracking-wide',
          active ? 'text-lime' : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </AnimatedPressable>
  )
}
