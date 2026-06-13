/** Tarjeta de actividad del feed social — muestra avatar, nombre, workout y reacciones. */
import { View, Image, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { timeAgo } from '@calistenia/core/lib/dateUtils'
import { PHASE_COLORS } from '@calistenia/core/lib/style-tokens'
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
}

export function FeedCard({
  item,
  isOwnPost,
  reactions,
  onReact,
  commentCount,
  onComment,
}: FeedCardProps) {
  const phaseColor = PHASE_COLORS[item.phase]

  const handleShare = () => {
    const url = sessionUrl(item.date, item.workoutKey)
    const msg = `${item.displayName} completó "${item.workoutTitle}" 💪`
    shareText({ message: msg, url }).catch(() => {})
  }

  return (
    <View className="px-4 py-3.5 bg-card border border-border rounded-xl">
      {/* Avatar + nombre + tiempo */}
      <View className="flex-row items-center gap-2.5 mb-2.5">
        <View className="size-9 rounded-full bg-accent items-center justify-center overflow-hidden shrink-0">
          {item.avatarUrl ? (
            <Image
              source={{ uri: item.avatarUrl }}
              className="size-full"
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
      </View>

      {/* Línea de acción */}
      <Text className="font-sans-medium text-xs text-muted-foreground mb-2">
        Completó un entrenamiento
      </Text>

      {/* Bloque del workout */}
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
            "{item.note}"
          </Text>
        )}
      </View>

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
