/**
 * Anillo de cuenta atrás del circuito — port nativo del CountdownRing web
 * (apps/web/src/components/circuit/CircuitView.tsx). Modelado sobre MacroRing
 * (Svg + Circle + AnimatedCircle): el track es estático y el trazo de relleno
 * se anima con Animated (useNativeDriver:false) cada tick para mantenerlo suave.
 */
import { useEffect, useRef, useState } from 'react'
import { Animated, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Text } from '@/components/ui/text'
import * as sounds from '@/lib/sounds'
import { haptics } from '@/lib/haptics'

const RING_SIZE = 200
const RING_STROKE = 8
const RING_R = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_R
const RING_HALF = RING_SIZE / 2

// Espejo de los tokens HSL del ring web, en hex para react-native-svg.
const COLOR_TRACK = '#27272a'        // border @0.3 → gris track
const COLOR_DONE = '#34d399'         // emerald-ish (hsl 160 84% 60%) al llegar a 0
const COLOR_URGENT = '#ef4444'       // destructive cuando quedan <=10s

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedCircle = Animated.createAnimatedComponent(Circle as any)

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
  const [remaining, setRemaining] = useState(initialSeconds)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const completedRef = useRef(false)

  // Trazo animado — arranca "lleno" y se va vaciando al ritmo del tick.
  const animOffset = useRef(new Animated.Value(0)).current

  // Reset cuando cambia initialSeconds (nuevo ejercicio/fase)
  useEffect(() => {
    setRemaining(initialSeconds)
    completedRef.current = false
  }, [initialSeconds])

  useEffect(() => {
    if (isPaused || remaining <= 0) return

    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev === 11) { sounds.playWarning(); haptics.warning() }
        if (prev <= 4 && prev > 1) { sounds.playCountdownTick(); haptics.light() }
        if (prev <= 1) {
          clearInterval(id)
          sounds.playTimerComplete()
          haptics.success()
          if (!completedRef.current) {
            completedRef.current = true
            // Diferir para no hacer setState durante el render
            setTimeout(() => onCompleteRef.current(), 0)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(id)
  }, [isPaused, remaining])

  // Animar el dashoffset hacia el valor objetivo cada vez que cambia remaining,
  // igual de suave que MacroRing pero con la cadencia del tick (~0.9s lineal).
  const pct = totalSeconds > 0 ? remaining / totalSeconds : 0
  const strokeOffset = RING_CIRC * (1 - pct)

  useEffect(() => {
    Animated.timing(animOffset, {
      toValue: strokeOffset,
      duration: 900,
      useNativeDriver: false,
    }).start()
  }, [animOffset, strokeOffset])

  const isUrgent = remaining > 0 && remaining <= 10
  const ringColor = remaining <= 0
    ? COLOR_DONE
    : isUrgent
      ? COLOR_URGENT
      : labelColor

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`

  return (
    <View className="items-center justify-center">
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        {/* Track */}
        <Circle
          cx={RING_HALF}
          cy={RING_HALF}
          r={RING_R}
          fill="none"
          stroke={COLOR_TRACK}
          strokeWidth={RING_STROKE}
        />
        {/* Trazo de relleno animado */}
        <AnimatedCircle
          cx={RING_HALF}
          cy={RING_HALF}
          r={RING_R}
          fill="none"
          stroke={ringColor}
          strokeWidth={RING_STROKE}
          strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
          strokeDashoffset={animOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_HALF}, ${RING_HALF}`}
        />
      </Svg>

      {/* Texto central superpuesto */}
      <View
        className="absolute items-center justify-center"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <Text
          className={`font-bebas leading-none ${isUrgent ? 'text-destructive' : 'text-foreground'}`}
          style={{ fontSize: remaining >= 600 ? 40 : 52 }}
        >
          {mmss}
        </Text>
        <Text
          className="mt-1 font-mono text-[10px] tracking-[2px]"
          style={{ color: labelColor }}
        >
          {label}
        </Text>
      </View>
    </View>
  )
}
