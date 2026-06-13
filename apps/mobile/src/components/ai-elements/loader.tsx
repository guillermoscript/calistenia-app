import { cn } from '@/lib/utils'
import { useColorScheme } from 'nativewind'
import * as React from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

/** Three-dot typing pulse animation — GPU-friendly opacity-only. */
const DOT_COUNT = 3
const DURATION = 500

function Dot({ index, color }: { index: number; color: string }) {
  const opacity = useSharedValue(0.3)

  React.useEffect(() => {
    opacity.value = withDelay(
      index * (DURATION / 2),
      withRepeat(
        withSequence(
          withTiming(1, { duration: DURATION }),
          withTiming(0.3, { duration: DURATION }),
        ),
        -1,
        false,
      ),
    )
    return () => cancelAnimation(opacity)
  }, [index, opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      style={[{ height: 6, width: 6, borderRadius: 3, backgroundColor: color }, style]}
    />
  )
}

export type LoaderProps = {
  className?: string
  color?: string
}

export function Loader({ className, color }: LoaderProps) {
  const { colorScheme } = useColorScheme()
  const dotColor = color ?? (colorScheme === 'dark' ? '#a3a3a3' : '#666666')
  return (
    <View className={cn('flex-row items-center gap-1 py-2', className)}>
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <Dot key={i} index={i} color={dotColor} />
      ))}
    </View>
  )
}
