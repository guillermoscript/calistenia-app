import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { Loader } from '../ui/loader'
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet'
import { REACTION_EMOJIS, type EmojiReactions } from '../../hooks/useReactions'
import type { Comment } from '../../hooks/useComments'

// ── Reaction color map ──────────────────────────────────────────────────────

const EMOJI_STYLES: Record<string, { active: string; ring: string }> = {
  '🔥': { active: 'bg-orange-500/20 text-orange-300 ring-orange-500/40', ring: 'ring-orange-500/30' },
  '💪': { active: 'bg-blue-500/20 text-blue-300 ring-blue-500/40', ring: 'ring-blue-500/30' },
  '👏': { active: 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/40', ring: 'ring-yellow-500/30' },
  '🎯': { active: 'bg-red-500/20 text-red-300 ring-red-500/40', ring: 'ring-red-500/30' },
  '🏆': { active: 'bg-amber-500/20 text-amber-300 ring-amber-500/40', ring: 'ring-amber-500/30' },
}

// ── Props ───────────────────────────────────────────────────────────────────

interface CommentsSheetProps {
  sessionId: string
  isOpen: boolean
  onClose: () => void
  comments: Comment[]
  onLoadComments: (sessionId: string) => Promise<Comment[]>
  onAddComment: (sessionId: string, text: string, parentId?: string) => Promise<boolean>
  onDeleteComment: (commentId: string, sessionId: string) => Promise<boolean>
  currentUserId: string
  reactions: EmojiReactions
  onReact: (emoji: string) => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr.replace(' ', 'T')).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return i18n.t('feed.now')
  if (diffMin < 60) return i18n.t('feed.minutesAgo', { count: diffMin })
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return i18n.t('feed.hoursAgo', { count: diffH })
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return i18n.t('common.yesterday')
  if (diffD <= 7) return i18n.t('common.daysAgo', { count: diffD })
  return new Date(dateStr.replace(' ', 'T')).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
}

// ── Main component ──────────────────────────────────────────────────────────

export function CommentsSheet({
  sessionId,
  isOpen,
  onClose,
  comments,
  onLoadComments,
  onAddComment,
  onDeleteComment,
  currentUserId,
  reactions,
  onReact,
}: CommentsSheetProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load comments when sheet opens
  useEffect(() => {
    if (isOpen && sessionId) {
      setLoading(true)
      onLoadComments(sessionId).finally(() => setLoading(false))
    }
    if (!isOpen) {
      setText('')
      setReplyTo(null)
    }
  }, [isOpen, sessionId, onLoadComments])

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    if (scrollRef.current && comments.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [comments])

  // Focus input when replying
  useEffect(() => {
    if (replyTo && inputRef.current) inputRef.current.focus()
  }, [replyTo])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const success = await onAddComment(sessionId, trimmed, replyTo?.id)
    setSending(false)
    if (success) {
      setText('')
      setReplyTo(null)
    }
  }, [text, sending, onAddComment, sessionId, replyTo])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const totalReactions = Object.values(reactions).reduce((sum, r) => sum + r.count, 0)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="bottom"
        className={cn(
          'flex flex-col p-0 rounded-t-2xl border-t-0 max-h-[85dvh] sm:max-h-[75vh]',
          'bg-background/98 backdrop-blur-xl',
          '[&>button]:hidden', // hide default close button
        )}
      >
        {/* Drag handle */}
        <div className="mx-auto mt-2.5 mb-1 h-1 w-8 rounded-full bg-foreground/15" />

        {/* Header — title + close */}
        <div className="flex items-center justify-between px-5 pb-3">
          <SheetTitle className="text-sm font-semibold tracking-tight">
            {t('social.comments')}
            {comments.length > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal tabular-nums">
                {comments.length}
              </span>
            )}
          </SheetTitle>
          <button
            onClick={onClose}
            className="size-7 flex items-center justify-center rounded-full bg-muted/60 hover:bg-muted transition-colors text-muted-foreground"
          >
            <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Reactions bar */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-1.5">
            {REACTION_EMOJIS.map((emoji) => {
              const data = reactions[emoji]
              const active = data?.hasReacted || false
              const count = data?.count || 0
              const styles = EMOJI_STYLES[emoji]

              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm ring-1 ring-inset transition-all duration-150 active:scale-[0.92]',
                    active && styles
                      ? styles.active
                      : 'ring-border/60 text-muted-foreground hover:bg-muted/50 hover:ring-border',
                  )}
                >
                  <span className="text-base leading-none">{emoji}</span>
                  {count > 0 && (
                    <span className="text-[11px] font-medium tabular-nums leading-none">{count}</span>
                  )}
                </button>
              )
            })}
            {totalReactions > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">
                {totalReactions}
              </span>
            )}
          </div>
        </div>

        <div className="h-px bg-border/50" />

        {/* Comments list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 py-3 min-h-0">
          {loading && (
            <Loader label={t('social.loadingComments')} className="py-10" />
          )}

          {!loading && comments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center">
                <svg className="size-5 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-xs text-muted-foreground/70">{t('social.beFirstToComment')}</p>
            </div>
          )}

          {!loading && comments.length > 0 && (
            <div className="flex flex-col gap-4">
              {comments.map((comment, idx) => (
                <div
                  key={comment.id}
                  className="motion-safe:animate-fade-in"
                  style={{ animationDelay: `${Math.min(idx, 8) * 30}ms`, animationFillMode: 'both' }}
                >
                  <CommentBubble
                    comment={comment}
                    currentUserId={currentUserId}
                    onReply={() => setReplyTo({ id: comment.id, name: comment.authorName })}
                    onDelete={() => onDeleteComment(comment.id, sessionId)}
                  />

                  {/* Threaded replies */}
                  {comment.replies.length > 0 && (
                    <div className="ml-9 mt-2 pl-3 border-l border-lime/15 flex flex-col gap-2.5">
                      {comment.replies.map((reply) => (
                        <CommentBubble
                          key={reply.id}
                          comment={reply}
                          currentUserId={currentUserId}
                          onReply={() => setReplyTo({ id: comment.id, name: reply.authorName })}
                          onDelete={() => onDeleteComment(reply.id, sessionId)}
                          isReply
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border/50 px-4 pt-2.5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {/* Reply indicator */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 ml-0.5">
              <div className="w-0.5 h-3.5 bg-lime/50 rounded-full" />
              <span className="text-[11px] text-muted-foreground">
                {t('social.replyingTo')} <span className="font-medium text-foreground/80">{replyTo.name}</span>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="ml-auto text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="4" y1="4" x2="12" y2="12" />
                  <line x1="12" y1="4" x2="4" y2="12" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                onKeyDown={handleKeyDown}
                placeholder={t('social.commentPlaceholder')}
                className={cn(
                  'w-full bg-muted/50 rounded-xl px-3.5 h-10 text-sm text-foreground',
                  'placeholder:text-muted-foreground/50',
                  'ring-1 ring-inset ring-border/40',
                  'focus:outline-none focus:ring-lime/40 focus:bg-muted/70',
                  'transition-all duration-150',
                )}
                maxLength={500}
                disabled={sending}
              />
              {text.length > 400 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] tabular-nums text-muted-foreground/50">
                  {500 - text.length}
                </span>
              )}
            </div>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className={cn(
                'shrink-0 size-10 flex items-center justify-center rounded-xl transition-all duration-150',
                text.trim() && !sending
                  ? 'bg-lime text-lime-foreground active:scale-[0.92]'
                  : 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed',
              )}
            >
              {sending ? (
                <svg className="size-4 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="8" cy="8" r="6" strokeOpacity="0.3" />
                  <path d="M8 2a6 6 0 0 1 6 6" />
                </svg>
              ) : (
                <svg className="size-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.5 1.3a.75.75 0 0 1 .78-.06l12 6.5a.75.75 0 0 1 0 1.32l-12 6.5A.75.75 0 0 1 1.2 14.6L3.9 8.5 1.2 2.4a.75.75 0 0 1 .3-1.1ZM4.6 9l-1.8 4.1L12.4 8 2.8 2.9 4.6 7h4.9a.5.5 0 0 1 0 1H4.6Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Comment bubble ──────────────────────────────────────────────────────────

interface CommentBubbleProps {
  comment: Comment
  currentUserId: string
  onReply: () => void
  onDelete: () => void
  isReply?: boolean
}

function CommentBubble({ comment, currentUserId, onReply, onDelete, isReply }: CommentBubbleProps) {
  const { t } = useTranslation()
  const isOwn = comment.authorId === currentUserId

  // Generate a deterministic hue from the author name for avatar color
  const hue = Array.from(comment.authorName).reduce((h, c) => h + c.charCodeAt(0), 0) % 360

  return (
    <div className="group flex gap-2.5">
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 rounded-full flex items-center justify-center font-semibold uppercase',
          isReply ? 'size-6 text-[10px]' : 'size-8 text-[11px]',
        )}
        style={{
          backgroundColor: `oklch(0.35 0.08 ${hue})`,
          color: `oklch(0.85 0.1 ${hue})`,
        }}
      >
        {comment.authorName[0] || '?'}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={cn(
            'font-medium truncate',
            isReply ? 'text-[11px]' : 'text-[13px]',
            isOwn && 'text-lime/90',
          )}>
            {comment.authorName}
          </span>
          <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
            {relativeTime(comment.created)}
          </span>
        </div>

        <p className={cn(
          'mt-0.5 break-words leading-relaxed',
          isReply ? 'text-[12px] text-muted-foreground/80' : 'text-[13px] text-foreground/85',
        )}>
          {comment.text}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={onReply}
            className="text-[11px] text-muted-foreground/50 hover:text-lime transition-colors"
          >
            {t('social.reply')}
          </button>
          {isOwn && (
            <button
              onClick={onDelete}
              className="text-[11px] text-muted-foreground/40 hover:text-red-400 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
