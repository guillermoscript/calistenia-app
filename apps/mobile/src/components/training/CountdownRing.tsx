/**
 * Anillo de cuenta atrás. Solo números: no sabe si cuenta un descanso o una plancha.
 *
 * El anillo lo mueve un shared value de Reanimated con un único `withTiming` hasta el
 * final, así que la animación corre en el hilo de UI y React no pinta un solo frame.
 * Antes el anillo del descanso avanzaba porque un `useState` cambiaba en un intervalo,
 * lo que re-renderizaba el SVG entero cuatro veces por segundo.
 *
 * El objetivo se vuelve a fijar en cada frontera de segundo (cuando cambia `progress`)
 * para que volver de segundo plano no deje el anillo desfasado respecto al número.
 */
import { memo, type ReactNode } from 'react'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

import { MUTED } from '@/components/training/constants'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Transición del anillo cuando NO está corriendo (arranque, pausa, ajuste ±). */
const SETTLE_MS = 300

export interface CountdownRingProps {
  /** Fracción pendiente en [0, 1]. */
  progress: number
  /** Instante de fin en ms. Con `running`, el anillo se vacía solo hasta ahí. */
  endAt?: number | null
  running?: boolean
  /** Reloj, en la misma escala que `endAt`. Una batalla pasa el del servidor. */
  now?: () => number
  size?: number
  strokeWidth?: number
  color: string
  trackColor?: string
  trackOpacity?: number
  /** Lo que va dentro del anillo (el número, un ✓…). */
  children?: ReactNode
}

function CountdownRingComponent({
  progress,
  endAt = null,
  running = false,
  now,
  size = 148,
  strokeWidth = 7,
  color,
  trackColor = MUTED,
  trackOpacity = 0.25,
  children,
}: CountdownRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = useSharedValue(circumference * (1 - progress))
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  useEffect(() => {
    const target = circumference * (1 - Math.max(0, Math.min(1, progress)))
    if (running && endAt !== null) {
      const msLeft = Math.max(0, endAt - (now ?? Date.now)())
      // Saltar al valor exacto de este segundo y, desde ahí, vaciarse en tiempo real.
      offset.value = target
      offset.value = withTiming(circumference, { duration: msLeft, easing: Easing.linear })
      return
    }
    offset.value = withTiming(target, { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) })
    // `now` es una función que puede recrearse en cada render; se lee, no se observa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, running, endAt, circumference, offset])

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeOpacity={trackOpacity}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference}`}
          strokeLinecap="round"
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  )
}

export const CountdownRing = memo(CountdownRingComponent)
