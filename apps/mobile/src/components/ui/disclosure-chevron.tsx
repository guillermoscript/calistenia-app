import { View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'

interface DisclosureChevronProps {
  /** Estado de la sección: cerrada apunta abajo, abierta apunta arriba. */
  open: boolean
  size?: number
  color?: string
}

/**
 * Chevron de una sección plegable.
 *
 * **El giro va en la `View`, nunca en el icono.** `lucide-react-native` reparte
 * las props que le pases —`style` incluido— tanto al `<Svg>` raíz como a cada
 * `<Path>` hijo (ver `customAttrs` en su `Icon.js`), y sobre un hijo el
 * `transform` deja de ser una transformación de layout y pasa a ser una
 * transformación SVG, cuyo origen es el (0,0) del lienzo: el trazo rota fuera
 * del `viewBox` y el icono **desaparece** en vez de darse la vuelta.
 *
 * No lo ve nadie desde el editor: ni typecheck, ni lint, ni los tests (que en
 * esta app no pueden renderizar componentes). Solo se ve en el dispositivo.
 */
export function DisclosureChevron({ open, size = 16, color = 'hsl(0 0% 55%)' }: DisclosureChevronProps) {
  return (
    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <ChevronDown size={size} color={color} />
    </View>
  )
}
