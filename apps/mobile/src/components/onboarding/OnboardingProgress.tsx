import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { cn } from '@/lib/utils'

interface Props {
  step: number
  totalSteps: number
}

function ProgressDot({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 32 : 6)

  useEffect(() => {
    width.value = withTiming(active ? 32 : 6, { duration: 250 })
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({ width: width.value }))

  return (
    <Animated.View
      style={animStyle}
      className={cn('h-1.5 rounded-full', active ? 'bg-lime' : 'bg-muted-foreground/30')}
    />
  )
}

export function OnboardingProgress({ step, totalSteps }: Props) {
  return (
    <View className="flex-row justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <ProgressDot key={i} active={i === step} />
      ))}
    </View>
  )
}
