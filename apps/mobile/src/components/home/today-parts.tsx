/**
 * Piezas del bloque «Hoy» (#858), comunes a todos sus estados. Siguen los
 * tableros del lienzo de #852: una tarjeta con borde lima, kicker en mono,
 * título en Bebas, filas separadas por líneas finas y UN botón principal.
 *
 * El botón principal es `bg-foreground` / `text-background` (blanco en oscuro,
 * negro en claro), nunca lima: lo decidió la épica. Todo lo pulsable mide al
 * menos 44 pt.
 */
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { CalendarDays, ChevronRight, Play } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'

export function TodayCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View
      accessibilityLabel={label}
      className="gap-3.5 rounded-xl border border-lime/40 bg-card p-[18px]"
    >
      {children}
    </View>
  )
}

/** Kicker mono en lima, con una acción de texto opcional a la derecha. */
export function TodayKicker({ children, dot, action }: { children: ReactNode; dot?: boolean; action?: ReactNode }) {
  return (
    <View className="-my-2.5 min-h-11 flex-row items-center justify-between gap-3">
      <View className="flex-1 flex-row items-center gap-2">
        {dot ? <View className="size-2 rounded-full bg-lime" /> : null}
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-lime" numberOfLines={1}>
          {children}
        </Text>
      </View>
      {action}
    </View>
  )
}

export function TodayTitle({ children, size = 'md' }: { children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <Text className={cn('font-bebas leading-[0.95] text-foreground', size === 'lg' ? 'text-[44px]' : 'text-[40px]')}>
      {children}
    </Text>
  )
}

export function TodayMeta({ children, className, numberOfLines }: {
  children: ReactNode
  className?: string
  numberOfLines?: number
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      className={cn('font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground', className)}
    >
      {children}
    </Text>
  )
}

export function TodayBody({ children }: { children: ReactNode }) {
  return <Text className="text-sm leading-5 text-muted-foreground">{children}</Text>
}

export interface TodayRow {
  key: string
  name: string
  detail?: string
}

/** Lista de ejercicios con líneas finas, 34 pt por fila (no es pulsable). */
export function TodayRows({ rows }: { rows: TodayRow[] }) {
  if (rows.length === 0) return null
  return (
    <View className="border-b border-border">
      {rows.map(row => (
        <View key={row.key} className="h-[34px] flex-row items-center justify-between gap-3 border-t border-border">
          <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>{row.name}</Text>
          {row.detail ? (
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">{row.detail}</Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

/** Barra fina de progreso (programa o sesión en curso). */
export function TodayBar({ percent, tone = 'foreground' }: { percent: number; tone?: 'foreground' | 'lime' }) {
  const width = `${Math.max(0, Math.min(100, Math.round(percent)))}%` as const
  return (
    <View className="h-1 overflow-hidden rounded-full bg-border">
      <View className={cn('h-1 rounded-full', tone === 'lime' ? 'bg-lime' : 'bg-foreground')} style={{ width }} />
    </View>
  )
}

/** Cifras grandes en fila (hecho hoy, cardio, programa terminado). */
export function TodayStats({ items }: { items: { key: string; value: string; label: string }[] }) {
  return (
    <View className="flex-row border-y border-border">
      {items.map((it, i) => (
        <View key={it.key} className={cn('flex-1 py-2.5', i > 0 && 'border-l border-border pl-3')}>
          <Text className="font-bebas text-[28px] leading-none text-foreground">{it.value}</Text>
          <Text className="mt-1 font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** El único botón grande de la pantalla: 56 pt. */
export function PrimaryAction({ label, onPress, icon = true }: { label: string; onPress: () => void; icon?: boolean }) {
  const colors = useThemeColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-14 flex-row items-center justify-center gap-2.5 rounded-[10px] bg-foreground active:opacity-85"
    >
      {icon ? <Play size={18} color={colors.background} fill={colors.background} /> : null}
      <Text className="pt-[3px] font-bebas text-2xl tracking-[1px] text-background">{label}</Text>
    </Pressable>
  )
}

/** Acción secundaria como texto subrayado, 44 pt de alto. */
export function TextAction({ label, onPress, mono, className }: {
  label: string
  onPress: () => void
  mono?: boolean
  className?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={4}
      className={cn('min-h-11 justify-center px-3 active:opacity-60', className)}
    >
      <Text
        className={cn(
          'text-muted-foreground underline',
          mono ? 'font-mono text-[10px] uppercase tracking-[2px]' : 'text-[13px]',
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** Fila pulsable de 56 pt con chevron: siguiente día, «Para ti», enlaces. */
export function LinkRow({ kicker, title, hint, icon, onPress, bordered = true }: {
  kicker?: string
  title: string
  hint?: string
  icon?: ReactNode
  onPress: () => void
  bordered?: boolean
}) {
  const colors = useThemeColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={cn(
        'min-h-14 flex-row items-center gap-3 py-2 active:opacity-70',
        bordered && 'border-b border-border',
      )}
    >
      {icon ? (
        <View className="size-8 shrink-0 items-center justify-center rounded-lg border border-border">{icon}</View>
      ) : null}
      <View className="flex-1 gap-0.5">
        {kicker ? (
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>{kicker}</Text>
        ) : null}
        <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>{title}</Text>
        {hint ? <Text className="text-xs text-muted-foreground" numberOfLines={1}>{hint}</Text> : null}
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  )
}

/**
 * «Cambiar día» del kicker: en color de texto y con icono, no en gris. En gris
 * pasaba desapercibido y parecía que ya no se podía entrenar otro día (QA #858).
 */
export function ChangeDayAction({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={4}
      className="min-h-11 flex-row items-center gap-1.5 pl-3 active:opacity-60"
    >
      <CalendarDays size={14} color={colors.lime} />
      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-foreground underline">{label}</Text>
    </Pressable>
  )
}
