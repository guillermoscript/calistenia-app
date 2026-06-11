/**
 * Feed social — actividad de usuarios seguidos.
 * Ruta apilada: /social
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X } from 'lucide-react-native'
import { Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
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
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { items, loading, loadingMore, hasMore, load, loadMore } = useActivityFeed(userId)
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

  // Cargar al montar
  useEffect(() => {
    load()
  }, [load])

  // Cargar reacciones y conteos tras obtener items
  useEffect(() => {
    if (items.length > 0) {
      const ids = items.map((i) => i.id)
      loadForSessions(ids)
      loadCommentCounts(ids)
    }
  }, [items, loadForSessions, loadCommentCounts])

  // Pull-to-refresh
  const handleRefresh = useCallback(() => {
    refreshingRef.current = true
    setRefreshing(true)
    load()
  }, [load])

  useEffect(() => {
    if (refreshingRef.current && !loading) {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [loading])

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
            <View className="items-center py-16">
              <ActivityIndicator color="#a3e635" />
              <Text className="font-mono text-xs text-muted-foreground mt-3">Cargando…</Text>
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
            <View className="items-center py-6">
              <ActivityIndicator size="small" color="#a3e635" />
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
