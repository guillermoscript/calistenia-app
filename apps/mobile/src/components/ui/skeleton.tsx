import { useEffect } from 'react'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  const opacity = useSharedValue(0.8)

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.25, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
  }, [opacity])

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      className={cn('rounded-md bg-muted', className)}
      style={animStyle}
    />
  )
}
