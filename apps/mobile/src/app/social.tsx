/**
 * Feed social — actividad de usuarios seguidos.
 * Ruta apilada: /social
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { X } from 'lucide-react-native'
import { Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthUser } from '@/lib/use-auth-user'
import { useActivityFeed } from '@calistenia/core/hooks/useActivityFeed'
import { useReactions } from '@calistenia/core/hooks/useReactions'
import { useComments } from '@calistenia/core/hooks/useComments'
import { useCommentReactions } from '@calistenia/core/hooks/useCommentReactions'
import { FeedCard } from '@/components/social/FeedCard'
import { CommentsSheet, type CommentsSheetMethods } from '@/components/social/CommentsSheet'
import type { FeedItem } from '@calistenia/core/hooks/useActivityFeed'

export default function SocialScreen() {
  const router = useRouter()
  // Deep-link desde una notificación de comentario/reacción: ?session=<id> hace
  // scroll al post, lo resalta (flash) y abre sus comentarios (ver
  // lib/notification-route).
  const { session: sessionParam } = useLocalSearchParams<{ session?: string }>()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { items, loading, refreshing: feedRefreshing, loadingMore, hasMore, load, loadMore } = useActivityFeed(userId)
  const { loadForSessions, toggleReaction, getReactions } = useReactions(userId)
  const {
    getComments,
    loadCommentCounts,
    addComment,
    deleteComment,
    getCommentCount,
    commentsBySession,
  } = useComments(userId)
  const commentReactions = useCommentReactions(userId)

  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  // Sesión activa en el sheet (para derivar reactions + sessionOwner)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const commentsSheetRef = useRef<CommentsSheetMethods>(null)
  const listRef = useRef<FlatList<FeedItem>>(null)
  // Post a resaltar tras un deep-link de notificación (flash lime de ~1s).
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // Cargar al montar
  useEffect(() => {
    load()
  }, [load])

  // Deep-link de notificación → llevar al post y resaltarlo.
  // Si el post está en el feed: scroll + flash y, tras el flash (~1s), abrir sus
  // comentarios. Si no está (p.ej. muy antiguo): abrir los comentarios directo,
  // que el sheet los carga por id. Espera a que el feed cargue antes de decidir.
  const deepLinkDoneRef = useRef<string | null>(null)
  useEffect(() => {
    const target = sessionParam
    if (!target || deepLinkDoneRef.current === target) return

    const idx = items.findIndex((i) => i.id === target)
    if (idx < 0 && loading) return // aún cargando, reevaluar al llegar items

    deepLinkDoneRef.current = target
    setActiveSessionId(target)
    // Nota: NO llamamos loadForSessions aquí — reemplaza el set de sesiones
    // rastreadas y borraría las reacciones del resto del feed. Los posts del feed
    // ya cargan sus reacciones/conteos vía el efecto de feedIdsKey.

    if (idx >= 0) {
      requestAnimationFrame(() => {
        try {
          listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.25 })
        } catch {
          /* sin getItemLayout puede fallar → lo maneja onScrollToIndexFailed */
        }
      })
      setHighlightId(target)
      // Limpiar el resaltado tras la animación (permite re-disparar a futuro).
      setTimeout(() => setHighlightId((cur) => (cur === target ? null : cur)), 1600)
      // Abrir comentarios cuando el flash ya se percibió.
      setTimeout(() => commentsSheetRef.current?.open(target), 1050)
    } else {
      commentsSheetRef.current?.open(target)
    }
  }, [sessionParam, items, loading])

  // Cargar reacciones y conteos tras obtener items.
  // Depender de una clave ESTABLE de ids (no del array `items`, que es una
  // referencia flatMap nueva en cada render) para que el efecto solo se
  // re-ejecute cuando cambia el conjunto de ids — si no,
  // loadForSessions/loadCommentCounts hacen setState en cada render → loop.
  const feedIdsKey = items.map((i) => i.id).join(',')
  useEffect(() => {
    if (!feedIdsKey) return
    const ids = feedIdsKey.split(',')
    loadForSessions(ids)
    loadCommentCounts(ids)
  }, [feedIdsKey, loadForSessions, loadCommentCounts])

  // Pull-to-refresh
  const handleRefresh = useCallback(() => {
    refreshingRef.current = true
    setRefreshing(true)
    load()
  }, [load])

  // El hook expone `refreshing` (refetch de fondo); `loading` ahora es solo primera
  // carga, por lo que el pull-to-refresh debe seguir el ciclo de `feedRefreshing`.
  useEffect(() => {
    if (refreshingRef.current && !feedRefreshing) {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [feedRefreshing])

  // Infinite scroll
  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore) loadMore()
  }, [hasMore, loadingMore, loadMore])

  // Abrir comentarios
  const handleOpenComments = useCallback(
    (item: FeedItem) => {
      setActiveSessionId(item.id)
      commentsSheetRef.current?.open(item.id)
    },
    [],
  )

  const activeItem = activeSessionId ? items.find((i) => i.id === activeSessionId) : undefined
  const activeSessionOwner = activeItem?.userId

  const handleAddComment = useCallback(
    (sessionId: string, text: string, parentId?: string) =>
      addComment(sessionId, text, parentId, activeSessionOwner),
    [addComment, activeSessionOwner],
  )

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#a3e635"
            colors={['#a3e635']}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        // El feed no usa getItemLayout (alturas variables), así que scrollToIndex
        // a un post fuera de pantalla puede fallar: estimamos y reintentamos.
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          })
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.25 })
            } catch {
              /* noop */
            }
          }, 250)
        }}
        ListHeaderComponent={
          <View className="flex-row items-start justify-between pt-2 pb-3">
            <View>
              <Text className="font-bebas text-4xl leading-none text-foreground">Comunidad</Text>
              <Text className="mt-1 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                Actividad reciente
              </Text>
            </View>
            <Pressable
              onPress={() => router.back()}
              className="rounded-full bg-muted/60 p-2 active:opacity-70"
            >
              <X size={18} color="#888899" />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => <FeedCardSkeleton key={i} />)}
            </View>
          ) : (
            <View className="items-center rounded-xl border border-dashed border-border py-16 gap-3">
              <Text className="text-4xl">📡</Text>
              <Text className="font-bebas text-xl text-muted-foreground">Sin actividad aún</Text>
              <Text className="font-sans-medium text-xs text-center text-muted-foreground px-4">
                Sigue a otros atletas para ver su progreso aquí.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="gap-2.5 pt-2.5">
              <FeedCardSkeleton />
              <FeedCardSkeleton />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            isOwnPost={item.userId === userId}
            reactions={getReactions(item.id)}
            onReact={(emoji) => toggleReaction(item.id, emoji, item.userId)}
            commentCount={getCommentCount(item.id)}
            onComment={() => handleOpenComments(item)}
            highlight={item.id === highlightId}
          />
        )}
      />

      {/* Hoja de comentarios — un único modal controlado por ref */}
      <CommentsSheet
        ref={commentsSheetRef}
        currentUserId={userId}
        commentsBySession={commentsBySession}
        onLoadComments={getComments}
        onAddComment={handleAddComment}
        onDeleteComment={deleteComment}
        reactions={activeSessionId ? getReactions(activeSessionId) : {}}
        onReact={(emoji) => {
          if (activeSessionId) {
            toggleReaction(activeSessionId, emoji, activeSessionOwner)
          }
        }}
        commentReactions={commentReactions}
      />
    </SafeAreaView>
  )
}

function FeedCardSkeleton() {
  return (
    <View className="px-4 py-3.5 bg-card border border-border rounded-xl gap-3">
      {/* Avatar + name */}
      <View className="flex-row items-center gap-2.5">
        <Skeleton className="size-9 rounded-full" />
        <View className="gap-1.5 flex-1">
          <Skeleton className="h-3 w-28 rounded" />
          <Skeleton className="h-2.5 w-16 rounded" />
        </View>
      </View>
      {/* Workout block */}
      <Skeleton className="h-14 rounded-md" />
      {/* Reactions row */}
      <View className="flex-row gap-2">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </View>
    </View>
  )
}
