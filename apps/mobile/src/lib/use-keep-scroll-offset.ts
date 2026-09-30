/**
 * Evita que un ScrollView vuelva solo al principio (#881).
 *
 * En Perfil la lista saltaba arriba 1-2 s después de bajar, sin tocar nada, al
 * llegar datos (auth-refresh, settings). Un salto legítimo del usuario nunca es
 * un solo evento de «offset > 0 → 0»: el gesto y el toque en la barra de estado
 * pasan por valores intermedios. Un reinicio de la vista sí llega de golpe y sin
 * dedo encima, y es lo único que se deshace aquí.
 */
import { useCallback, useRef } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native'

/** Por debajo de esto no merece la pena restaurar: el usuario apenas había bajado. */
const MIN_OFFSET = 120

export function useKeepScrollOffset() {
  const ref = useRef<ScrollView>(null)
  const lastY = useRef(0)
  const touching = useRef(false)

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y
    if (!touching.current && y <= 0 && lastY.current > MIN_OFFSET) {
      const back = lastY.current
      ref.current?.scrollTo({ y: back, animated: false })
      return
    }
    lastY.current = y
  }, [])

  const onTouchStart = useCallback(() => { touching.current = true }, [])
  const onSettle = useCallback(() => { touching.current = false }, [])

  return {
    ref,
    scrollEventThrottle: 16,
    onScroll,
    onScrollBeginDrag: onTouchStart,
    onScrollEndDrag: onSettle,
    onMomentumScrollEnd: onSettle,
  }
}
