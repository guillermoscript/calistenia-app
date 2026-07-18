/**
 * EmptyState — estado vacío educativo compartido (issue #234).
 *
 * Generalización del componente privado que vivía en HomeActivity: card con
 * borde dashed + icono + título Bebas + explicación + CTA pill opcional.
 * El copy debe enseñar la feature (qué hace + por qué me importa), no solo
 * decir "no hay nada". Diseño spec-sheet: lima solo en el CTA.
 */
import { View, Pressable } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { COLORS } from '@/lib/theme'

interface EmptyStateProps {
  icon: LucideIcon
  /** Título corto en Bebas (se renderiza uppercase). */
  title: string
  /** Explica qué hace la feature y por qué importa. */
  body: string
  ctaLabel?: string
  onCtaPress?: () => void
}

export function EmptyState({ icon: Icon, title, body, ctaLabel, onCtaPress }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-5 py-8">
      <Icon size={22} color={COLORS.mutedIcon} />
      <View className="items-center gap-1">
        <Text className="text-center font-bebas text-2xl uppercase leading-none text-foreground">
          {title}
        </Text>
        <Text className="text-center text-sm leading-relaxed text-muted-foreground">{body}</Text>
      </View>
      {ctaLabel && onCtaPress ? (
        <Pressable
          onPress={onCtaPress}
          className="rounded-full border border-lime/30 px-4 py-2 active:border-lime/60 active:bg-lime/10"
          accessibilityRole="button"
        >
          <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
