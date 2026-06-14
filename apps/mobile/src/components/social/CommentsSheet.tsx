/**
 * Hoja de comentarios — gorhom BottomSheetModal con lista de comentarios,
 * reacciones del post, respuestas 1-nivel y compositor de texto.
 *
 * Cambios vs. versión anterior:
 *  - keyboardBehavior="interactive" + keyboardBlurBehavior="restore" +
 *    android_keyboardInputMode="adjustResize" → compositor siempre visible
 *  - BottomSheetTextInput con fontFamily DM Sans (DMSans_400Regular)
 *  - Visual polish: burbujas, avatares, cabecera, reacciones del post,
 *    pills de reacción, threading y compositor redesñados
 */
import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { View, Pressable, ActivityIndicator, Platform } from 'react-native'
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

/** Genera un hue determinista a partir del nombre del autor */
function authorHue(name: string): number {
  return Array.from(name).reduce((h, ch) => h + ch.charCodeAt(0), 0) % 360
}

const SNAP_POINTS = ['75%']

// DM Sans font family names como están declaradas en tailwind.config.js
const FONT_REGULAR = 'DMSans_400Regular'
const FONT_MEDIUM = 'DMSans_500Medium'

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

    // Colores semánticos (coindicen con las variables CSS del tema)
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

    // Colores condicionales para el TextInput (no soporta clases Tailwind directas)
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
    const inputBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'
    const inputColor = isDark ? '#f4f4f5' : '#18181b'
    const inputPlaceholder = isDark ? '#71717a' : '#a1a1aa'

    return (
      <BottomSheetModal
        ref={modalRef}
        snapPoints={SNAP_POINTS}
        onDismiss={handleDismiss}
        enablePanDownToClose
        // ── Keyboard handling ─────────────────────────────────────────────
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        // ─────────────────────────────────────────────────────────────────
        handleIndicatorStyle={{
          backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)',
          width: 36,
          height: 4,
          borderRadius: 2,
        }}
        backgroundStyle={{ backgroundColor: sheetBg }}
      >
        <BottomSheetView className="flex-1">

          {/* ── Cabecera ─────────────────────────────────────────────────── */}
          <View className="flex-row items-center justify-between px-5 pt-1 pb-3">
            <View className="flex-row items-center gap-2">
              <Text className="font-bebas text-lg tracking-wide text-foreground">
                Comentarios
              </Text>
              {comments.length > 0 && (
                <View className="rounded-full bg-muted/60 px-1.5 py-0.5">
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    {String(comments.length)}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => modalRef.current?.dismiss()}
              className="size-7 items-center justify-center rounded-full bg-muted/50 active:opacity-60"
              hitSlop={8}
            >
              <Text className="font-mono text-xs text-muted-foreground">✕</Text>
            </Pressable>
          </View>

          {/* ── Barra de reacciones del post ──────────────────────────────── */}
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
                      'flex-row items-center gap-1 rounded-full px-2.5 py-1.5 border active:opacity-65',
                      active && styles
                        ? cn(styles, 'border-transparent')
                        : 'border-border/50 bg-muted/20',
                    )}
                    hitSlop={4}
                  >
                    <Text className="text-[15px] leading-none">{emoji}</Text>
                    {count > 0 && (
                      <Text className="font-mono text-[11px] text-muted-foreground">
                        {String(count)}
                      </Text>
                    )}
                  </Pressable>
                )
              })}
              {totalReactions > 0 && (
                <View className="ml-auto flex-row items-center gap-1">
                  <Text className="font-mono text-[10px] text-muted-foreground/50">
                    {String(totalReactions)}
                  </Text>
                  <Text className="font-mono text-[10px] text-muted-foreground/30">total</Text>
                </View>
              )}
            </View>
          </View>

          <View className="mx-5 h-px bg-border/40 rounded-full mb-1" />

          {/* ── Lista de comentarios ─────────────────────────────────────── */}
          {loading ? (
            <View className="flex-1 items-center justify-center py-12 gap-2">
              <ActivityIndicator color="#a3e635" size="small" />
              <Text className="font-mono text-xs text-muted-foreground/60">
                Cargando…
              </Text>
            </View>
          ) : (
            <BottomSheetFlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 8,
                gap: 18,
              }}
              ListEmptyComponent={
                <View className="items-center justify-center py-14 gap-3">
                  <Text className="font-mono text-4xl opacity-40">💬</Text>
                  <Text className="font-sans text-sm text-muted-foreground/60">
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
                    <View className="ml-10 mt-2.5 pl-3 border-l-2 border-lime/10 gap-3">
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

          {/* ── Compositor ───────────────────────────────────────────────── */}
          <View
            className="border-t border-border/40 px-4 pt-3"
            style={{ paddingBottom: Platform.OS === 'ios' ? 28 : 16 }}
          >
            {/* Indicador de respuesta */}
            {replyTo && (
              <View className="flex-row items-center gap-2 mb-2.5 bg-muted/30 rounded-lg px-3 py-2">
                <View className="w-0.5 h-4 bg-lime rounded-full" />
                <Text className="font-sans text-xs text-muted-foreground flex-1" numberOfLines={1}>
                  Respondiendo a{' '}
                  <Text className="font-sans-medium text-foreground/80">{replyTo.name}</Text>
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Text className="font-mono text-xs text-muted-foreground/50">✕</Text>
                </Pressable>
              </View>
            )}

            <View className="flex-row items-end gap-2">
              {/* Input */}
              <View className="flex-1 relative">
                <BottomSheetTextInput
                  value={text}
                  onChangeText={(val) => setText(val.slice(0, 500))}
                  placeholder="Escribe un comentario…"
                  placeholderTextColor={inputPlaceholder}
                  maxLength={500}
                  editable={!sending}
                  multiline={false}
                  style={{
                    backgroundColor: inputBg,
                    borderRadius: 20,
                    paddingHorizontal: 16,
                    paddingVertical: 0,
                    height: 42,
                    fontSize: 14,
                    lineHeight: 20,
                    color: inputColor,
                    borderWidth: 1,
                    borderColor: inputBorder,
                    fontFamily: FONT_REGULAR,
                  }}
                />
                {/* Contador de caracteres restantes (visible al acercarse al límite) */}
                {text.length > 400 && (
                  <View
                    className="absolute right-3 top-2.5 rounded-full bg-muted/60 px-1"
                    pointerEvents="none"
                  >
                    <Text className="font-mono text-[9px] text-muted-foreground/70">
                      {String(500 - text.length)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Botón de enviar */}
              <Pressable
                onPress={handleSend}
                disabled={!text.trim() || sending}
                className={cn(
                  'size-[42px] items-center justify-center rounded-full',
                  text.trim() && !sending
                    ? 'bg-lime active:opacity-65'
                    : 'bg-muted/40',
                )}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={isDark ? '#18181b' : '#3f3f46'} />
                ) : (
                  <Text
                    className={cn(
                      'text-base leading-none',
                      text.trim() ? 'text-black' : 'text-muted-foreground/30',
                    )}
                    style={{ fontFamily: FONT_MEDIUM }}
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

  const hue = authorHue(comment.authorName)

  return (
    <View className="flex-row gap-3">
      {/* ── Avatar ────────────────────────────────────────────────────── */}
      <View
        className={cn(
          'shrink-0 rounded-full items-center justify-center overflow-hidden',
          isReply ? 'size-6' : 'size-9',
        )}
        style={{ backgroundColor: `oklch(0.32 0.07 ${hue})` }}
      >
        <Text
          className={cn(
            'uppercase',
            isReply ? 'text-[9px]' : 'text-[11px]',
          )}
          style={{
            color: `oklch(0.88 0.10 ${hue})`,
            fontFamily: FONT_MEDIUM,
          }}
        >
          {(comment.authorName[0] ?? '?').toUpperCase()}
        </Text>
      </View>

      {/* ── Cuerpo ────────────────────────────────────────────────────── */}
      <View className="flex-1 min-w-0">
        {/* Nombre + timestamp */}
        <View className="flex-row items-baseline gap-1.5 flex-wrap mb-0.5">
          <Text
            className={cn(
              'font-sans-medium truncate',
              isReply ? 'text-[11px]' : 'text-[13px]',
              isOwn ? 'text-lime' : 'text-foreground',
            )}
          >
            {comment.authorName}
          </Text>
          {isOwn && (
            <View className="rounded-full bg-lime/10 px-1 py-px">
              <Text className="font-mono text-[9px] text-lime/70">tú</Text>
            </View>
          )}
          <Text className="font-mono text-[10px] text-muted-foreground/40 shrink-0">
            {timeAgo(comment.created)}
          </Text>
        </View>

        {/* Texto del comentario */}
        <Text
          className={cn(
            'leading-relaxed',
            isReply
              ? 'font-sans text-[12px] text-muted-foreground/80'
              : 'font-sans text-[13px] text-foreground/90',
          )}
        >
          {comment.text}
        </Text>

        {/* ── Pills de reacciones ──────────────────────────────────────── */}
        {hasAnyReaction && (
          <View className="flex-row items-center flex-wrap gap-1 mt-1.5">
            {COMMENT_REACTION_EMOJIS.map((emoji) => {
              const data = cReactions[emoji]
              if (!data || data.count === 0) return null
              const styles = EMOJI_STYLES[emoji]
              return (
                <Pressable
                  key={emoji}
                  onPress={() => commentReactions?.toggleReaction(comment.id, emoji)}
                  className={cn(
                    'flex-row items-center gap-0.5 rounded-full px-2 py-0.5 border active:opacity-65',
                    data.hasReacted && styles
                      ? cn(styles, 'border-transparent')
                      : 'border-border/40 bg-muted/20',
                  )}
                  hitSlop={4}
                >
                  <Text className="text-[12px] leading-none">{emoji}</Text>
                  <Text className="font-mono text-[10px] leading-none text-muted-foreground">
                    {String(data.count)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}

        {/* ── Acciones (responder / reaccionar / eliminar) ──────────────── */}
        <View className="flex-row items-center gap-3 mt-1.5">
          {!isReply && (
            <Pressable onPress={onReply} hitSlop={6}>
              <Text className="font-sans text-[11px] text-muted-foreground/50">
                Responder
              </Text>
            </Pressable>
          )}

          {/* Botón reacción + picker inline */}
          <Pressable
            onPress={() => setShowPicker((p) => !p)}
            hitSlop={6}
          >
            <Text className="font-sans text-[11px] text-muted-foreground/50">
              {hasAnyReaction ? '😊 Reaccionar' : '+ Reaccionar'}
            </Text>
          </Pressable>

          {isOwn && (
            <Pressable onPress={onDelete} hitSlop={6}>
              <Text className="font-sans text-[11px] text-muted-foreground/35">
                Eliminar
              </Text>
            </Pressable>
          )}
        </View>

        {/* Picker de emojis inline (desplegable) */}
        {showPicker && (
          <View className="flex-row gap-1 mt-2 bg-card border border-border/60 rounded-2xl px-2.5 py-2 self-start shadow-sm">
            {COMMENT_REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  commentReactions?.toggleReaction(comment.id, emoji)
                  setShowPicker(false)
                }}
                className={cn(
                  'size-8 items-center justify-center rounded-full active:opacity-65',
                  cReactions[emoji]?.hasReacted ? 'bg-muted/70' : '',
                )}
                hitSlop={4}
              >
                <Text className="text-base leading-none">{emoji}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
