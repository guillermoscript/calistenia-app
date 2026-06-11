/**
 * Hoja de comentarios — gorhom BottomSheetModal con lista de comentarios,
 * reacciones del post, respuestas 1-nivel y compositor de texto.
 */
import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { View, Pressable, ActivityIndicator } from 'react-native'
import { useColorScheme } from 'nativewind'
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { timeAgo } from '@calistenia/core/lib/dateUtils'
import { REACTION_EMOJIS } from '@calistenia/core/hooks/useReactions'
import { COMMENT_REACTION_EMOJIS } from '@calistenia/core/hooks/useCommentReactions'
import type { EmojiReactions } from '@calistenia/core/hooks/useReactions'
import type { CommentEmojiReactions } from '@calistenia/core/hooks/useCommentReactions'
import type { Comment } from '@calistenia/core/hooks/useComments'

// ── Types ────────────────────────────────────────────────────────────────────

interface CommentReactionsHook {
  loadForComments: (commentIds: string[]) => Promise<void>
  toggleReaction: (commentId: string, emoji: string) => Promise<void>
  getReactions: (commentId: string) => CommentEmojiReactions
}

export interface CommentsSheetMethods {
  open: (sessionId: string) => void
  dismiss: () => void
}

interface CommentsSheetProps {
  currentUserId: string | null
  commentsBySession: Record<string, Comment[]>
  onLoadComments: (sessionId: string) => Promise<Comment[]>
  onAddComment: (sessionId: string, text: string, parentId?: string) => Promise<boolean>
  onDeleteComment: (commentId: string, sessionId: string) => Promise<boolean>
  reactions: EmojiReactions
  onReact: (emoji: string) => void
  commentReactions?: CommentReactionsHook
}

// ── Emoji color map ───────────────────────────────────────────────────────────

const EMOJI_STYLES: Record<string, string> = {
  '🔥': 'bg-orange-500/20 text-orange-300',
  '💪': 'bg-blue-500/20 text-blue-300',
  '👏': 'bg-yellow-500/20 text-yellow-300',
  '🎯': 'bg-red-500/20 text-red-300',
  '🏆': 'bg-amber-500/20 text-amber-300',
  '❤️': 'bg-pink-500/20 text-pink-300',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectCommentIds(comments: Comment[]): string[] {
  const ids: string[] = []
  for (const c of comments) {
    ids.push(c.id)
    for (const r of c.replies) ids.push(r.id)
  }
  return ids
}

const SNAP_POINTS = ['75%']

// ── Main component ─────────────────────────────────────────────────────────────

export const CommentsSheet = forwardRef<CommentsSheetMethods, CommentsSheetProps>(
  function CommentsSheet(
    {
      currentUserId,
      commentsBySession,
      onLoadComments,
      onAddComment,
      onDeleteComment,
      reactions,
      onReact,
      commentReactions,
    },
    ref,
  ) {
    const modalRef = useRef<BottomSheetModal>(null)
    const { colorScheme } = useColorScheme()
    const isDark = colorScheme === 'dark'
    const sheetBg = isDark ? 'hsl(0 0% 3.9%)' : 'hsl(60 6% 97%)'
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [text, setText] = useState('')
    const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
    const [sending, setSending] = useState(false)

    useImperativeHandle(ref, () => ({
      open(sid: string) {
        setSessionId(sid)
        setText('')
        setReplyTo(null)
        modalRef.current?.present()
      },
      dismiss() {
        modalRef.current?.dismiss()
      },
    }))

    const comments: Comment[] = sessionId ? (commentsBySession[sessionId] ?? []) : []

    // Cargar comentarios cuando cambia sessionId
    useEffect(() => {
      if (!sessionId) return
      setLoading(true)
      onLoadComments(sessionId).finally(() => setLoading(false))
    }, [sessionId, onLoadComments])

    // Cargar reacciones de comentarios cuando llegan nuevos comentarios
    useEffect(() => {
      if (comments.length > 0 && commentReactions) {
        const ids = collectCommentIds(comments)
        commentReactions.loadForComments(ids)
      }
    }, [comments, commentReactions])

    const handleSend = useCallback(async () => {
      if (!sessionId) return
      const trimmed = text.trim()
      if (!trimmed || sending) return
      setSending(true)
      const success = await onAddComment(sessionId, trimmed, replyTo?.id)
      setSending(false)
      if (success) {
        setText('')
        setReplyTo(null)
      }
    }, [sessionId, text, sending, onAddComment, replyTo])

    const handleDismiss = useCallback(() => {
      setSessionId(null)
      setText('')
      setReplyTo(null)
    }, [])

    const totalReactions = Object.values(reactions).reduce((sum, r) => sum + r.count, 0)

    return (
      <BottomSheetModal
        ref={modalRef}
        snapPoints={SNAP_POINTS}
        onDismiss={handleDismiss}
        enablePanDownToClose
        handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', width: 32 }}
        backgroundStyle={{ backgroundColor: sheetBg }}
      >
        <BottomSheetView className="flex-1">
          {/* Cabecera */}
          <View className="flex-row items-center justify-between px-5 pb-3">
            <Text className="font-sans-medium text-sm text-foreground">
              Comentarios
              {comments.length > 0 && (
                <Text className="font-mono text-muted-foreground"> {String(comments.length)}</Text>
              )}
            </Text>
            <Pressable
              onPress={() => modalRef.current?.dismiss()}
              className="size-7 items-center justify-center rounded-full bg-muted/60 active:opacity-70"
            >
              <Text className="font-mono text-xs text-muted-foreground">✕</Text>
            </Pressable>
          </View>

          {/* Barra de reacciones del post */}
          <View className="px-5 pb-3">
            <View className="flex-row items-center gap-1.5 flex-wrap">
              {REACTION_EMOJIS.map((emoji) => {
                const data = reactions[emoji]
                const active = data?.hasReacted || false
                const count = data?.count || 0
                const styles = EMOJI_STYLES[emoji]
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => onReact(emoji)}
                    className={cn(
                      'flex-row items-center gap-1 rounded-full px-2.5 py-1.5 border active:opacity-70',
                      active && styles ? cn(styles, 'border-transparent') : 'border-border/60',
                    )}
                  >
                    <Text className="text-base leading-none">{emoji}</Text>
                    {count > 0 && (
                      <Text className="font-mono text-[11px] text-muted-foreground">
                        {String(count)}
                      </Text>
                    )}
                  </Pressable>
                )
              })}
              {totalReactions > 0 && (
                <Text className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                  {String(totalReactions)}
                </Text>
              )}
            </View>
          </View>

          <View className="h-px bg-border/50" />

          {/* Lista de comentarios */}
          {loading ? (
            <View className="flex-1 items-center justify-center py-10">
              <ActivityIndicator color="#a3e635" />
              <Text className="font-mono text-xs text-muted-foreground mt-2">
                Cargando comentarios…
              </Text>
            </View>
          ) : (
            <BottomSheetFlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 16 }}
              ListEmptyComponent={
                <View className="items-center justify-center py-10 gap-2">
                  <Text className="font-mono text-3xl">💬</Text>
                  <Text className="font-sans-medium text-xs text-muted-foreground/70">
                    Sé el primero en comentar
                  </Text>
                </View>
              }
              renderItem={({ item: comment }) => (
                <View>
                  <CommentBubble
                    comment={comment}
                    currentUserId={currentUserId}
                    onReply={() =>
                      setReplyTo({ id: comment.id, name: comment.authorName })
                    }
                    onDelete={() =>
                      sessionId
                        ? onDeleteComment(comment.id, sessionId)
                        : Promise.resolve(false)
                    }
                    commentReactions={commentReactions}
                  />
                  {/* Respuestas anidadas (1 nivel) */}
                  {comment.replies.length > 0 && (
                    <View className="ml-9 mt-2 pl-3 border-l border-lime/15 gap-2.5">
                      {comment.replies.map((reply) => (
                        <CommentBubble
                          key={reply.id}
                          comment={reply}
                          currentUserId={currentUserId}
                          onReply={() =>
                            setReplyTo({ id: comment.id, name: reply.authorName })
                          }
                          onDelete={() =>
                            sessionId
                              ? onDeleteComment(reply.id, sessionId)
                              : Promise.resolve(false)
                          }
                          commentReactions={commentReactions}
                          isReply
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            />
          )}

          {/* Compositor */}
          <View className="border-t border-border/50 px-4 pt-2.5 pb-6">
            {/* Indicador de respuesta */}
            {replyTo && (
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-0.5 h-3.5 bg-lime/50 rounded-full" />
                <Text className="font-mono text-[11px] text-muted-foreground flex-1">
                  Respondiendo a{' '}
                  <Text className="font-sans-medium text-foreground/80">{replyTo.name}</Text>
                </Text>
                <Pressable onPress={() => setReplyTo(null)}>
                  <Text className="font-mono text-[11px] text-muted-foreground/60">✕</Text>
                </Pressable>
              </View>
            )}

            <View className="flex-row items-end gap-2">
              <View className="flex-1 relative">
                <BottomSheetTextInput
                  value={text}
                  onChangeText={(val) => setText(val.slice(0, 500))}
                  placeholder="Escribe un comentario…"
                  placeholderTextColor="#71717a"
                  maxLength={500}
                  editable={!sending}
                  multiline={false}
                  style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    height: 40,
                    fontSize: 14,
                    color: isDark ? 'white' : 'black',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  }}
                />
                {text.length > 400 && (
                  <Text className="absolute right-3 font-mono text-[9px] text-muted-foreground/50" style={{ top: 12 }}>
                    {String(500 - text.length)}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={handleSend}
                disabled={!text.trim() || sending}
                className={cn(
                  'size-10 items-center justify-center rounded-xl',
                  text.trim() && !sending
                    ? 'bg-lime active:opacity-70'
                    : 'bg-muted/30',
                )}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#a3e635" />
                ) : (
                  <Text
                    className={cn(
                      'font-mono text-sm',
                      text.trim() ? 'text-black' : 'text-muted-foreground/30',
                    )}
                  >
                    ↑
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    )
  },
)

// ── CommentBubble ─────────────────────────────────────────────────────────────

interface CommentBubbleProps {
  comment: Comment
  currentUserId: string | null
  onReply: () => void
  onDelete: () => Promise<boolean>
  commentReactions?: CommentReactionsHook
  isReply?: boolean
}

function CommentBubble({
  comment,
  currentUserId,
  onReply,
  onDelete,
  commentReactions,
  isReply,
}: CommentBubbleProps) {
  const [showPicker, setShowPicker] = useState(false)
  const isOwn = comment.authorId === currentUserId

  const cReactions = commentReactions?.getReactions(comment.id) ?? {}
  const hasAnyReaction = Object.values(cReactions).some((r) => r.count > 0)

  const hue =
    Array.from(comment.authorName).reduce((h, c) => h + c.charCodeAt(0), 0) % 360

  return (
    <View className="flex-row gap-2.5">
      {/* Avatar */}
      <View
        className={cn(
          'shrink-0 rounded-full items-center justify-center overflow-hidden',
          isReply ? 'size-6' : 'size-8',
        )}
        style={{
          backgroundColor: `oklch(0.35 0.08 ${hue})`,
        }}
      >
        {comment.authorAvatarUrl ? (
          <View className="size-full">
            {/* eslint-disable-next-line react-native/no-inline-styles */}
            <View style={{ width: '100%', height: '100%' }}>
              <Text className="font-mono text-[10px]" style={{ color: `oklch(0.85 0.1 ${hue})` }}>
                {(comment.authorName[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          </View>
        ) : (
          <Text
            className={cn(
              'font-mono uppercase',
              isReply ? 'text-[9px]' : 'text-[11px]',
            )}
            style={{ color: `oklch(0.85 0.1 ${hue})` }}
          >
            {(comment.authorName[0] ?? '?').toUpperCase()}
          </Text>
        )}
      </View>

      {/* Cuerpo */}
      <View className="flex-1 min-w-0">
        <View className="flex-row items-baseline gap-1.5 flex-wrap">
          <Text
            className={cn(
              'font-sans-medium truncate',
              isReply ? 'text-[11px]' : 'text-[13px]',
              isOwn ? 'text-lime/90' : 'text-foreground',
            )}
          >
            {comment.authorName}
          </Text>
          <Text className="font-mono text-[10px] text-muted-foreground/50 shrink-0">
            {timeAgo(comment.created)}
          </Text>
        </View>

        <Text
          className={cn(
            'mt-0.5 leading-relaxed',
            isReply
              ? 'font-sans-medium text-[12px] text-muted-foreground/80'
              : 'font-sans-medium text-[13px] text-foreground/85',
          )}
        >
          {comment.text}
        </Text>

        {/* Reacciones inline */}
        {hasAnyReaction && (
          <View className="flex-row items-center flex-wrap gap-1 mt-1">
            {COMMENT_REACTION_EMOJIS.map((emoji) => {
              const data = cReactions[emoji]
              if (!data || data.count === 0) return null
              const styles = EMOJI_STYLES[emoji]
              return (
                <Pressable
                  key={emoji}
                  onPress={() => commentReactions?.toggleReaction(comment.id, emoji)}
                  className={cn(
                    'flex-row items-center gap-0.5 rounded-full px-1.5 py-0.5 border active:opacity-70',
                    data.hasReacted && styles
                      ? cn(styles, 'border-transparent')
                      : 'border-border/40',
                  )}
                >
                  <Text className="font-mono text-[11px] leading-none">{emoji}</Text>
                  <Text className="font-mono text-[11px] leading-none text-muted-foreground">
                    {String(data.count)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}

        {/* Acciones */}
        <View className="flex-row items-center gap-3 mt-1">
          {!isReply && (
            <Pressable onPress={onReply}>
              <Text className="font-mono text-[11px] text-muted-foreground/50">Responder</Text>
            </Pressable>
          )}
          {/* Botón de reacción */}
          <Pressable onPress={() => setShowPicker((p) => !p)}>
            <Text className="font-mono text-[11px] text-muted-foreground/50">
              {hasAnyReaction ? '😊' : '+ Reaccionar'}
            </Text>
          </Pressable>
          {/* Picker de reacciones inline */}
          {showPicker && (
            <View className="flex-row gap-1 bg-card border border-border rounded-full px-2 py-1.5">
              {COMMENT_REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    commentReactions?.toggleReaction(comment.id, emoji)
                    setShowPicker(false)
                  }}
                  className={cn(
                    'size-7 items-center justify-center rounded-full active:opacity-70',
                    cReactions[emoji]?.hasReacted ? 'bg-muted/80' : '',
                  )}
                >
                  <Text className="font-mono text-base leading-none">{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {isOwn && (
            <Pressable onPress={onDelete}>
              <Text className="font-mono text-[11px] text-muted-foreground/40">Eliminar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}
