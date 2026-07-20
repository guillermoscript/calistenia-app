/**
 * OneShotHint — callout contextual descartable que se muestra UNA sola vez
 * (issue #235). Inline, no overlay: fila compacta con borde lima, icono, una
 * línea de valor y ✕ para descartar. Al tocar o descartar persiste el visto en
 * syncStorage (por hint y usuario) y no vuelve a aparecer.
 *
 * El tap principal y el ✕ son Pressables HERMANOS, nunca anidados — en Android
 * un Pressable dentro de otro deja que el externo capture el tap (mismo
 * problema documentado en InsightsCard).
 */
import { useEffect, useRef, useState } from 'react'
import { Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated'
import { X, type LucideIcon } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { syncStorage } from '@/lib/storage'
import { COLORS } from '@/lib/theme'
import { op } from '@calistenia/core/lib/analytics'

const hintKey = (id: string, userId: string) => `calistenia_mobile_hint_${id}_${userId}`

interface OneShotHintProps {
  /** Clave única del hint, ej. 'meal_photo'. */
  id: string
  userId: string | null
  icon: LucideIcon
  /** Una línea de valor, no de instrucción de UI. */
  text: string
  /** Opcional; si no se pasa, todo el callout es el CTA. */
  ctaLabel?: string
  onPress?: () => void
  /** Condición contextual del padre (además de "no visto"). */
  visible?: boolean
  className?: string
}

export function OneShotHint({
  id,
  userId,
  icon: Icon,
  text,
  ctaLabel,
  onPress,
  visible = true,
  className,
}: OneShotHintProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  // Bump para re-leer el flag de storage tras marcar como visto.
  const [, setSeenTick] = useState(0)
  const trackedRef = useRef(false)

  const seen = !userId || syncStorage.getItem(hintKey(id, userId)) === 'true'
  const show = visible && !seen

  // hint_shown una sola vez por mount, y solo cuando realmente se renderiza.
  useEffect(() => {
    if (show && !trackedRef.current) {
      trackedRef.current = true
      op.track('hint_shown', { id })
    }
  }, [show, id])

  if (!show) return null

  const markSeen = () => {
    syncStorage.setItem(hintKey(id, userId!), 'true')
    setSeenTick(n => n + 1)
  }

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(200)}
      className={cn('flex-row items-center rounded-xl border border-lime/40 bg-card', className)}
    >
      <Pressable
        onPress={() => {
          op.track('hint_tapped', { id })
          markSeen()
          onPress?.()
        }}
        className="flex-1 flex-row items-center gap-3 py-3 pl-3.5 active:opacity-70"
        accessibilityRole="button"
      >
        <Icon size={16} color={COLORS.lime} />
        <Text className="flex-1 text-sm leading-snug text-foreground">{text}</Text>
        {ctaLabel ? (
          <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">{ctaLabel}</Text>
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => {
          op.track('hint_dismissed', { id })
          markSeen()
        }}
        hitSlop={10}
        className="px-3 py-3 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <X size={14} color={COLORS.mutedIcon} />
      </Pressable>
    </Animated.View>
  )
}
