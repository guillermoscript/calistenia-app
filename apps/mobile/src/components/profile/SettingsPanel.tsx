/**
 * Piezas de la lista de ajustes del perfil — port nativo de
 * `apps/web/src/components/profile/SettingsPanel.tsx`.
 *
 * El rediseño (canvas 1d) baja los formularios de siempre a una lista de filas,
 * una por tema. Para que eso no sea «el formulario viejo metido en un cajón»,
 * lo que se despliega tiene lenguaje propio: fondo hundido que lo separa de la
 * lista, etiquetas mono en mayúsculas como el resto de la spec sheet, y los
 * mismo control en todas partes para elegir una opción (segmentado).
 *
 * Se mantiene a la par del fichero web a propósito: los dos perfiles tienen que
 * envejecer igual, así que si aquí cambia un control, allí también. Falta el
 * `ChipToggle` de «elegir varios»: el móvil todavía no edita áreas de foco,
 * condiciones ni lesiones, y no se adelanta código sin call site.
 */
import * as React from 'react'
import { View, Pressable } from 'react-native'
import { ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── Fila y cajón ────────────────────────────────────────────────────────────

interface SettingsRowProps {
  label: string
  /** Resumen a la derecha: lo que hay guardado, sin tener que abrir. */
  value?: string
  /** Solo para las filas que despliegan; las que navegan no la pasan. */
  open?: boolean
  onPress: () => void
  /** Filete superior: lo lleva cada fila menos la primera de su tarjeta. */
  bordered: boolean
  /** Color del chevron cerrado (gris del tema). */
  muted: string
  /** Color del chevron abierto (lima del tema). */
  lime: string
  children?: React.ReactNode
}

export function SettingsRow({ label, value, open = false, onPress, bordered, muted, lime, children }: SettingsRowProps) {
  const expandable = Boolean(children)
  return (
    <View className={cn(bordered && 'border-t border-border/70')}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={expandable ? { expanded: open } : undefined}
        className="flex-row items-center gap-3 px-5 py-3.5 active:bg-muted/70"
      >
        <Text className={cn('flex-1 text-[15px]', open ? 'text-lime' : 'text-foreground')}>{label}</Text>
        {value ? (
          <Text className="shrink font-mono text-[11px] text-muted-foreground" numberOfLines={1}>{value}</Text>
        ) : null}
        {/* El giro va en la `View`, nunca en el icono: `lucide-react-native`
            reparte `style` también a los `<Path>` y el trazo se sale del
            viewBox — el icono desaparece en vez de girar. */}
        <View className="shrink-0" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ChevronRight size={16} color={open ? lime : muted} />
        </View>
      </Pressable>
      {open && expandable ? (
        <View className="gap-5 border-t border-border/70 bg-muted/40 px-5 py-5">{children}</View>
      ) : null}
    </View>
  )
}

// ─── Campos ──────────────────────────────────────────────────────────────────

/** Etiqueta de campo: mono en mayúsculas, como los rótulos de bloque. */
export function Field({ label, hint, children }: {
  label: string
  /** Nota corta bajo el control (unidades, consecuencias). */
  hint?: string
  children: React.ReactNode
}) {
  return (
    <View className="gap-2">
      <Kicker size="xs">{label}</Kicker>
      {children}
      {hint ? <Text className="font-mono text-[9px] tracking-wide text-muted-foreground/70">{hint}</Text> : null}
    </View>
  )
}

/** Input con la unidad fijada dentro, para que la etiqueta no tenga que decirla. */
export function UnitInput({ unit, className, ...props }: React.ComponentProps<typeof Input> & { unit?: string }) {
  return (
    <View className="relative justify-center">
      <Input className={cn('h-11', unit && 'pr-12', className)} {...props} />
      {unit ? (
        <View className="absolute right-3" pointerEvents="none">
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{unit}</Text>
        </View>
      ) : null}
    </View>
  )
}

// ─── Controles ───────────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * Elegir uno: pista hundida y la opción activa levantada en lima.
 *
 * Volver a pulsar la opción activa la limpia — varios de estos campos son
 * opcionales y sin eso no habría forma de dejarlos en blanco.
 */
export function Segmented<T extends string>({ options, value, onChange, columns, allowClear = true }: {
  options: readonly SegmentedOption<T>[]
  value: T | ''
  onChange: (next: T | '') => void
  /** Por defecto una fila; con muchas opciones largas conviene dos por fila. */
  columns?: 2
  /** `false` en los campos que siempre tienen que valer algo (nivel, idioma). */
  allowClear?: boolean
}) {
  // En nativo no hay `grid`: con dos columnas se parten las opciones en filas
  // de dos y cada una se estira, que es lo que hace el `grid-cols-2` de la web.
  const rows: (readonly SegmentedOption<T>[])[] = columns === 2
    ? options.reduce<SegmentedOption<T>[][]>((acc, opt, i) => {
        if (i % 2 === 0) acc.push([opt])
        else acc[acc.length - 1].push(opt)
        return acc
      }, [])
    : [options]

  return (
    <View className="gap-1 rounded-lg bg-muted p-1">
      {rows.map((row, i) => (
        <View key={i} className="flex-row gap-1">
          {row.map(opt => {
            const active = value === opt.value
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onChange(active && allowClear ? '' : opt.value)}
                className={cn(
                  // El borde transparente lo llevan todas para que marcar la
                  // activa no desplace un píxel al resto.
                  'flex-1 items-center justify-center rounded-md border border-transparent px-2 py-2.5 active:opacity-70',
                  active && 'border-lime/50 bg-background',
                )}
              >
                <Text
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-widest',
                    active ? 'text-lime' : 'text-muted-foreground',
                  )}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
          {/* Fila impar: hueco para que la última opción no ocupe el doble. */}
          {columns === 2 && row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  )
}
