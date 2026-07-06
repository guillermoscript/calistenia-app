import Reanimated, { useAnimatedStyle } from 'react-native-reanimated'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'

// Espaciador que crece con el teclado. Usa el camino Reanimated de RNKC — el único
// que se mueve fiable en MIUI (KeyboardStickyView lo usa; los KeyboardAvoidingView de
// RN core y de RNKC van por Animated y quedan muertos según la pantalla). Colocado al
// fondo de una columna flex, empuja el contenido hacia arriba = KAV manual.
// offset: alto ya cubierto por SafeArea (insets.bottom) para no compensar doble.
export function KeyboardSpacer({ offset = 0 }: { offset?: number }) {
  const { height } = useReanimatedKeyboardAnimation() // 0 → -keyboardHeight al abrir
  const style = useAnimatedStyle(() => ({
    height: Math.max(0, -height.value - offset),
  }))
  return <Reanimated.View style={style} />
}
