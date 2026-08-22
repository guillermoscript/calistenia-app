/**
 * Tarjeta del muro (nativa).
 *
 * El QUÉ dice cada tipo de actividad lo decide `describeFeedItem` en core, el
 * mismo que usa la web: antes esta tarjeta tenía `'Completó un entrenamiento'`
 * y `'Hizo cardio'` escritos a mano en español, y la web tenía sus propias
 * cadenas distintas. Aquí solo queda el layout nativo.
 */
import { memo, useEffect } from 'react'
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
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { timeAgo } from '@calistenia/core/lib/dateUtils'
import { capitalizeFirst, describeFeedItem } from '@calistenia/core/lib/feed-item'
import { openFeedItem, shareFeedItem, feedItemHref } from '@/lib/feed-routes'
import { EmojiPicker } from './EmojiPicker'
import type { FeedItem } from '@calistenia/core/types'
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

export const FeedCard = memo(function FeedCard({
  item,
  isOwnPost,
  reactions,
  onReact,
  commentCount,
  onComment,
  highlight,
}: FeedCardProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const view = describeFeedItem(item)
  // `null` = esta actividad no tiene destino abrible para quien mira (circuito
  // ajeno, batalla que no jugó). Sin esto la tarjeta llevaría a un 404.
  const canOpen = feedItemHref(item, !!isOwnPost) !== null

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
              <Text className="font-mono text-[10px] text-lime">({t('feed.you')})</Text>
            )}
          </View>
          <Text className="font-mono text-[10px] text-muted-foreground">
            {timeAgo(item.completedAt)}
          </Text>
        </View>
      </Pressable>

      {/* Línea de acción — una frase por tipo, ya traducida en core */}
      <Text className="font-sans-medium text-xs text-muted-foreground mb-2">
        {capitalizeFirst(view.action)}
      </Text>

      <FeedCardBody
        item={item}
        view={view}
        onOpen={canOpen ? () => openFeedItem(router, item, !!isOwnPost) : null}
        openLabel={t('feed.openDetail')}
      />

      {/* Reacciones + comentarios + compartir */}
      <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
        <EmojiPicker reactions={reactions} onToggle={onReact} />

        {/* Botón de comentarios */}
        <Pressable
          onPress={onComment}
          className="flex-row items-center gap-1.5 px-3 py-1 min-h-8 rounded-full border border-border/60 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t('social.comments')}
        >
          <Text className="font-mono text-xs text-muted-foreground">💬</Text>
          <Text className="font-mono text-xs text-muted-foreground">
            {commentCount > 0 ? String(commentCount) : t('social.comment')}
          </Text>
        </Pressable>

        {/* Botón compartir */}
        <Pressable
          onPress={() => { void shareFeedItem(item) }}
          className="px-2.5 py-1 min-h-8 items-center justify-center rounded-full active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t('common.share')}
        >
          <Text className="font-mono text-xs text-muted-foreground">↗</Text>
        </Pressable>
      </View>
    </View>
  )
})

// ---------------------------------------------------------------------------
// Cuerpo de la tarjeta — un solo layout para los seis tipos de actividad.
// Extraído del render de FeedCard para no alojar JSX inline en el hot-path de
// la FlatList.
// ---------------------------------------------------------------------------
interface FeedCardBodyProps {
  item: FeedItem
  view: ReturnType<typeof describeFeedItem>
  /** `null` cuando la actividad no tiene destino: el bloque no es pulsable. */
  onOpen: (() => void) | null
  openLabel: string
}

function FeedCardBody({ item, view, onOpen, openLabel }: FeedCardBodyProps) {
  const content = (
    <View className={cn('px-3 py-2.5 rounded-md bg-muted/30 border-l-[3px]', view.accent.border)}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 min-w-0">
          <Text className={cn('font-sans-medium text-sm', view.accent.text)} numberOfLines={1}>
            {view.title}
          </Text>
          {Boolean(view.detail) && (
            <Text className="font-sans text-[11px] text-muted-foreground mt-0.5" numberOfLines={1}>
              {view.detail}
            </Text>
          )}
          {Boolean(view.metrics) && (
            <Text className="font-mono text-[10px] text-muted-foreground mt-0.5" numberOfLines={1}>
              {view.metrics}
            </Text>
          )}
        </View>
        {Boolean(view.badge) && (
          // shrink-0: en RN el hijo largo NO encoge por defecto y la etiqueta se
          // comía el título en pantallas estrechas.
          <Text className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
            {view.badge}
          </Text>
        )}
        {onOpen && <ChevronRight size={16} color="hsl(0 0% 40%)" />}
      </View>
      {Boolean(item.note) && (
        <Text
          className="font-sans-italic text-[11px] text-muted-foreground mt-1.5 border-t border-border/50 pt-1.5"
          numberOfLines={2}
        >
          &quot;{item.note}&quot;
        </Text>
      )}
    </View>
  )

  if (!onOpen) return content

  return (
    <Pressable
      onPress={onOpen}
      className="rounded-md active:opacity-75"
      accessibilityRole="button"
      accessibilityLabel={`${openLabel}: ${view.title}`}
    >
      {content}
    </Pressable>
  )
}
