/** Tarjeta de actividad del feed social — muestra avatar, nombre, workout y reacciones. */
import { useEffect } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { timeAgo } from '@calistenia/core/lib/dateUtils'
import { PHASE_COLORS } from '@calistenia/core/lib/style-tokens'
import { formatPace, formatDuration } from '@calistenia/core/lib/geo'
import { shareText, sessionUrl } from '@/lib/share'
import { EmojiPicker } from './EmojiPicker'
import type { FeedItem } from '@calistenia/core/hooks/useActivityFeed'
import type { EmojiReactions } from '@calistenia/core/hooks/useReactions'

interface FeedCardProps {
  item: FeedItem
  isOwnPost?: boolean
  reactions: EmojiReactions
  onReact: (emoji: string) => void
  commentCount: number
  onComment: () => void
  /**
   * Cuando pasa a true (deep-link de una notificación), la tarjeta hace un flash
   * de fondo lime que se desvanece en ~1s para que el usuario la localice rápido.
   */
  highlight?: boolean
}

export function FeedCard({
  item,
  isOwnPost,
  reactions,
  onReact,
  commentCount,
  onComment,
  highlight,
}: FeedCardProps) {
  const router = useRouter()
  const phaseColor = PHASE_COLORS[item.phase]
  const isCardio = item.type === 'cardio'

  // Flash de resaltado: aparece al instante y se desvanece. Una capa lime detrás
  // del contenido; no intercepta toques. Honra "reducir movimiento" (sin fade).
  const reduceMotion = useReducedMotion()
  const flash = useSharedValue(0)
  useEffect(() => {
    if (!highlight) return
    flash.set(1)
    flash.set(withTiming(0, { duration: reduceMotion ? 1 : 1100, easing: Easing.out(Easing.quad) }))
  }, [highlight, reduceMotion, flash])
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }))

  const handleShare = () => {
    if (isCardio) {
      // Navigate to the detail screen — it has the full session data + share card.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/cardio/${item.id}` as any)
    } else {
      const url = sessionUrl(item.date, item.workoutKey)
      const msg = `${item.displayName} completó "${item.workoutTitle}" 💪`
      shareText({ message: msg, url }).catch(() => {})
    }
  }

  const handleCardioPress = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(`/cardio/${item.id}` as any)
  }

  return (
    <View className="px-4 py-3.5 bg-card border border-border rounded-xl overflow-hidden">
      {/* Capa de flash de resaltado — detrás del contenido, no captura toques.
          Tinte lime (alpha 0.3) cuyo opacity va de 1→0: glow sutil, on-brand. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(163, 230, 53, 0.3)' }, flashStyle]}
      />

      {/* Avatar + nombre + tiempo — tocar lleva al perfil del usuario */}
      <Pressable
        onPress={() => router.push({ pathname: '/u/[id]', params: { id: item.userId } })}
        className="flex-row items-center gap-2.5 mb-2.5 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={item.displayName}
        hitSlop={4}
      >
        <View className="size-9 rounded-full bg-accent items-center justify-center overflow-hidden shrink-0">
          {item.avatarUrl ? (
            <Image
              source={{ uri: item.avatarUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              recyclingKey={item.id}
              accessibilityLabel={item.displayName}
            />
          ) : (
            <Text className="font-mono text-xs text-foreground">
              {(item.displayName[0] ?? '?').toUpperCase()}
            </Text>
          )}
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
              {item.displayName}
            </Text>
            {isOwnPost && (
              <Text className="font-mono text-[10px] text-lime">(tú)</Text>
            )}
          </View>
          <Text className="font-mono text-[10px] text-muted-foreground">
            {timeAgo(item.completedAt)}
          </Text>
        </View>
      </Pressable>

      {/* Línea de acción */}
      <Text className="font-sans-medium text-xs text-muted-foreground mb-2">
        {isCardio ? 'Hizo cardio' : 'Completó un entrenamiento'}
      </Text>

      {isCardio ? (
        /* Bloque de cardio — toca para abrir el detalle de la sesión */
        <Pressable
          onPress={handleCardioPress}
          className="rounded-md active:opacity-75"
          accessibilityRole="button"
          accessibilityLabel="Ver detalle de sesión de cardio"
        >
          <View className="px-3 py-2.5 rounded-md bg-muted/30 border-l-[3px] border-l-sky-500">
            <Text className="font-sans-medium text-sm text-sky-500" numberOfLines={1}>
              {item.workoutTitle}
            </Text>
            <CardioMetrics cardio={item.cardio} />
            {Boolean(item.note) && (
              <Text
                className="font-sans-italic text-[11px] text-muted-foreground truncate mt-1.5 border-t border-border/50 pt-1.5"
                numberOfLines={2}
              >
                &quot;{item.note}&quot;
              </Text>
            )}
          </View>
        </Pressable>
      ) : (
        /* Bloque del workout */
        <View
          className={cn(
            'px-3 py-2.5 rounded-md bg-muted/30 border-l-[3px]',
            phaseColor?.border ?? 'border-l-lime',
          )}
        >
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1 min-w-0">
              <Text
                className={cn('font-sans-medium text-sm', phaseColor?.text ?? 'text-foreground')}
                numberOfLines={1}
              >
                {item.workoutTitle}
              </Text>
              <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                Fase {item.phase}
              </Text>
            </View>
          </View>
          {Boolean(item.note) && (
            <Text
              className="font-sans-italic text-[11px] text-muted-foreground truncate mt-1.5 border-t border-border/50 pt-1.5"
              numberOfLines={2}
            >
              &quot;{item.note}&quot;
            </Text>
          )}
        </View>
      )}

      {/* Reacciones + comentarios + compartir */}
      <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
        <EmojiPicker reactions={reactions} onToggle={onReact} />

        {/* Botón de comentarios */}
        <Pressable
          onPress={onComment}
          className="flex-row items-center gap-1.5 px-3 py-1 min-h-8 rounded-full border border-border/60 active:opacity-70"
        >
          {/* Ícono de burbuja */}
          <Text className="font-mono text-xs text-muted-foreground">💬</Text>
          <Text className="font-mono text-xs text-muted-foreground">
            {commentCount > 0 ? String(commentCount) : 'Comentar'}
          </Text>
        </Pressable>

        {/* Botón compartir */}
        <Pressable
          onPress={handleShare}
          className="px-2.5 py-1 min-h-8 items-center justify-center rounded-full active:opacity-70"
        >
          <Text className="font-mono text-xs text-muted-foreground">↗</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Subcomponente interno: métricas de cardio (distancia · duración · ritmo)
// Extraído para evitar allocations de JSX inline en el render hot-path de FeedCard.
// ---------------------------------------------------------------------------
interface CardioMetricsProps {
  cardio: FeedItem['cardio']
}

function CardioMetrics({ cardio }: CardioMetricsProps) {
  if (!cardio) return null

  const parts: string[] = []
  if (cardio.distanceKm != null) parts.push(`${cardio.distanceKm.toFixed(2)} km`)
  if (cardio.durationSeconds != null) parts.push(formatDuration(cardio.durationSeconds))
  if (cardio.avgPace != null && cardio.avgPace > 0) parts.push(`${formatPace(cardio.avgPace)} /km`)

  if (parts.length === 0) return null

  return (
    <Text className="font-mono text-[10px] text-muted-foreground mt-0.5">
      {parts.join(' · ')}
    </Text>
  )
}
