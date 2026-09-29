/**
 * Una fila de actividad de un amigo («Ana completó Tirón + core · hace 2 h»).
 *
 * Sale de `HomeActivity` para que la pestaña Comunidad (#860) pinte las mismas
 * filas. La fila abre el detalle; el avatar y el nombre van al perfil del autor
 * (Pressables anidados: el interior gana el toque).
 */
import { View, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { feedItemHref, openFeedItem } from '@/lib/feed-routes'
import { describeFeedItem } from '@calistenia/core/lib/feed-item'
import { timeAgo } from '@calistenia/core/lib/dateUtils'
import type { FeedItem } from '@calistenia/core/hooks/useActivityFeed'

const MUTED = 'hsl(0 0% 55%)'

export default function FriendActivityRow({ item, meId }: { item: FeedItem; meId: string | null }) {
  const router = useRouter()
  const isOwn = item.userId === meId
  const openProfile = () => router.push({ pathname: '/u/[id]', params: { id: item.userId } })

  return (
    <Pressable
      // `openFeedItem` respeta que no todo tiene destino: un circuito ajeno o
      // una batalla que no jugaste no se pueden abrir. Antes esto mandaba
      // CUALQUIER tipo a `/s/[id]`, así que un reto o una carrera aterrizaban
      // en un detalle de sesión inexistente.
      onPress={() => openFeedItem(router, item, isOwn)}
      disabled={feedItemHref(item, isOwn) === null}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={`${item.displayName} · ${describeFeedItem(item).title}`}
    >
      <Pressable
        onPress={openProfile}
        className="size-9 items-center justify-center overflow-hidden rounded-full bg-accent active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel={item.displayName}
        // 36 pt de avatar + 4 por lado = 44 pt de zona táctil.
        hitSlop={4}
      >
        {item.avatarUrl ? (
          <Image
            source={{ uri: item.avatarUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={item.userId}
            accessibilityLabel={item.displayName}
          />
        ) : (
          <Text className="font-mono text-xs text-foreground">{(item.displayName[0] ?? '?').toUpperCase()}</Text>
        )}
      </Pressable>
      <View className="flex-1">
        <Pressable
          onPress={openProfile}
          className="self-start active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel={item.displayName}
          hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
        >
          <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
            {item.displayName}
          </Text>
        </Pressable>
        <Text className="font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
          {describeFeedItem(item).title} · {timeAgo(item.completedAt)}
        </Text>
      </View>
      <ChevronRight size={16} color={MUTED} />
    </Pressable>
  )
}
