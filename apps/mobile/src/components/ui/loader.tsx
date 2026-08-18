/**
 * Loader — port nativo del primitivo web (issue #488).
 *
 * Mismas props que `apps/web/src/components/ui/loader.tsx` (`label`, `size`,
 * `fullScreen`, `className`), adaptadas a nativo: el spinner es un
 * `ActivityIndicator` en vez de un `div` animado con CSS, y `label` se
 * renderiza con el `Text` de la app en el mismo estilo mudo/mono que usa la
 * web (`text-sm text-muted-foreground font-mono`).
 *
 * `ActivityIndicator` solo tiene dos tamaños nativos (`'small' | 'large'`),
 * así que `sm` y `md` colapsan en `'small'` — no hay hueco intermedio como en
 * web (`h-4 w-4` vs `h-6 w-6`).
 *
 * `color` es la vía de escape para los call sites que de verdad necesitan otro
 * color (p. ej. un spinner sobre un botón lima, que es oscuro); por defecto
 * usa el lima del sistema (`COLORS.lime`).
 */
import { View, ActivityIndicator, type ColorValue } from 'react-native'

import { Text } from '@/components/ui/text'
import { COLORS } from '@/lib/theme'
import { cn } from '@/lib/utils'

interface LoaderProps {
  /** Texto mostrado debajo del spinner. */
  label?: string
  /** Variante de tamaño. `sm` y `md` colapsan en el `'small'` nativo. */
  size?: 'sm' | 'md' | 'lg'
  /** Centra el loader en un contenedor `flex-1` con `bg-background`. */
  fullScreen?: boolean
  /** Color del spinner. Por defecto el lima del sistema. */
  color?: ColorValue
  className?: string
}

const NATIVE_SIZE: Record<NonNullable<LoaderProps['size']>, 'small' | 'large'> = {
  sm: 'small',
  md: 'small',
  lg: 'large',
}

export function Loader({ label, size = 'md', fullScreen = false, color = COLORS.lime, className }: LoaderProps) {
  const content = (
    <View className={cn('items-center justify-center gap-3', className)}>
      <ActivityIndicator size={NATIVE_SIZE[size]} color={color} />
      {label && (
        <Text className="text-sm text-muted-foreground font-mono">{label}</Text>
      )}
    </View>
  )

  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        {content}
      </View>
    )
  }

  return content
}
