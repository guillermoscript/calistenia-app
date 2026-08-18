import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { formatTimingClock } from '@calistenia/core/lib/exerciseTiming'

interface TimingBarProps {
  name: string
  pct: number
  seconds: number
  isMax: boolean
  delay: number
  animate: boolean
}

/**
 * Una fila del desglose de tiempos de fin de sesión. El relleno crece de 0 a su
 * porción del ejercicio más largo al montar, para dar algo de energía; con
 * reduce-motion salta directamente a su anchura final.
 */
export default function TimingBar({ name, pct, seconds, isMax, delay, animate }: TimingBarProps) {
  const width = useSharedValue(animate ? 0 : pct)
  useEffect(() => {
    if (animate) width.value = withDelay(delay, withTiming(pct, { duration: 650, easing: Easing.out(Easing.cubic) }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }))
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="relative flex-1 overflow-hidden rounded-md">
        <Animated.View
          className={cn('absolute inset-y-0 left-0 rounded-md', isMax ? 'bg-lime/20' : 'bg-muted')}
          style={fillStyle}
        />
        <Text className="px-2.5 py-1 font-sans text-[12px] text-foreground/80" numberOfLines={1}>{name}</Text>
      </View>
      <Text className={cn('shrink-0 font-mono text-[11px] tabular-nums', isMax ? 'text-lime' : 'text-muted-foreground')}>
        {formatTimingClock(seconds)}
      </Text>
    </View>
  )
}
