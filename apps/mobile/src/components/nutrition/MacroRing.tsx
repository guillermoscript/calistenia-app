/** SVG calorie ring gauge — port of web CalorieGauge. */
import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Text } from '@/components/ui/text'
import { useCountUp } from '@/lib/use-count-up'
import type { QualityScore } from '@calistenia/core/types'

const RADIUS = 52
const STROKE_WIDTH = 10
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const QUALITY_COLORS: Record<QualityScore, string> = {
  A: 'text-emerald-400',
  B: 'text-lime-400',
  C: 'text-yellow-400',
  D: 'text-orange-400',
  E: 'text-red-400',
}

function ringColor(pct: number): string {
  if (pct > 1) return '#f87171'   // red-400 — over target
  if (pct > 0.8) return '#fbbf24' // amber-400 — warning
  return '#a3e635'                 // lime-400 — healthy
}

interface MacroRingProps {
  consumed: number
  target: number
  dailyScore?: QualityScore
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedCircle = Animated.createAnimatedComponent(Circle as any)

export default function MacroRing({ consumed, target, dailyScore }: MacroRingProps) {
  const pct = target > 0 ? Math.min(consumed / target, 1.1) : 0
  const fillPct = Math.min(pct, 1)
  const dashOffset = CIRCUMFERENCE * (1 - fillPct)
  const stroke = ringColor(pct)
  const SIZE = (RADIUS + STROKE_WIDTH) * 2

  const animOffset = useRef(new Animated.Value(CIRCUMFERENCE)).current
  const displayConsumed = useCountUp(Math.round(consumed))

  useEffect(() => {
    Animated.timing(animOffset, {
      toValue: dashOffset,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [animOffset, dashOffset])

  return (
    <View className="items-center justify-center">
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Track */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#27272a"
          strokeWidth={STROKE_WIDTH}
        />
        {/* Animated fill */}
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={animOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>

      {/* Center content overlaid absolutely */}
      <View
        className="absolute items-center justify-center"
        style={{ width: SIZE, height: SIZE }}
      >
        <Text className="font-bebas text-3xl leading-none text-foreground">
          {displayConsumed}
        </Text>
        <Text className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground">
          / {Math.round(target)} kcal
        </Text>

        {dailyScore && (
          <View className="mt-1.5 rounded-full bg-muted/60 px-2 py-0.5">
            <Text className={`font-bebas text-base leading-none ${QUALITY_COLORS[dailyScore]}`}>
              {dailyScore}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}
