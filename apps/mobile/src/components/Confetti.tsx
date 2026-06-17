// Confetti ligero hecho con reanimated — sin dependencia nativa nueva, así que
// entra por hot-reload. Una sola ráfaga al montar; cae, gira y se desvanece.
// Respeta "reduce motion": si está activo, no renderiza nada.
import { useEffect, useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  interpolate,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated'

// Lima de la marca primero, luego acentos para dar vida.
const COLORS = ['#c8f542', '#42c8f5', '#f54242', '#f5c842', '#f542c8', '#42f5a8']
const COUNT = 24

interface Piece {
  left: number
  size: number
  color: string
  delay: number
  dur: number
  rot: number
  round: boolean
  drift: number
}

function ConfettiPiece({ piece, fall }: { piece: Piece; fall: number }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: piece.dur, easing: Easing.in(Easing.quad) }),
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.85, 1], [1, 1, 0]),
    transform: [
      { translateY: progress.value * fall },
      { translateX: progress.value * piece.drift },
      { rotate: `${piece.rot + progress.value * 720}deg` },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -30,
          left: piece.left,
          width: piece.size,
          height: piece.size,
          backgroundColor: piece.color,
          borderRadius: piece.round ? piece.size / 2 : 2,
        },
        style,
      ]}
    />
  )
}

export default function Confetti() {
  const reduced = useReducedMotion()
  // Reactive (not a one-time snapshot) so a split-screen / foldable resize
  // re-lays the burst across the real window width.
  const { width, height } = useWindowDimensions()

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        left: 0.05 * width + Math.random() * 0.9 * width,
        size: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 1200,
        dur: 2200 + Math.random() * 1800,
        rot: Math.floor(Math.random() * 360),
        round: Math.random() > 0.5,
        drift: (Math.random() - 0.5) * 90,
      })),
    [width],
  )

  if (reduced) return null

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} fall={height + 60} />
      ))}
    </View>
  )
}
