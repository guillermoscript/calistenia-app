import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { Loader } from '../ui/loader'
import type { Comment } from '../../hooks/useComments'

interface CommentsSheetProps {
  sessionId: string
  isOpen: boolean
  onClose: () => void
  comments: Comment[]
  onLoadComments: (sessionId: string) => Promise<Comment[]>
  onAddComment: (sessionId: string, text: string, parentId?: string) => Promise<boolean>
  onDeleteComment: (commentId: string, sessionId: string) => Promise<boolean>
  currentUserId: string
}

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

export function CommentsSheet({
  sessionId,
  isOpen,
  onClose,
  comments,
  onLoadComments,
  onAddComment,
  onDeleteComment,
  currentUserId,
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

  // Scroll to bottom when new comments load
  useEffect(() => {
    if (scrollRef.current && comments.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [comments])

  // Focus input when replying
  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus()
    }
  }, [replyTo])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setSending(true)
    const success = await onAddComment(sessionId, trimmed, replyTo?.id)
    setSending(false)

    if (success) {
      setText('')
      setReplyTo(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 motion-safe:animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl flex flex-col max-h-[80vh] motion-safe:animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">{t('social.comments')}</h2>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
          >
            <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Comments list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <Loader label={t('social.loadingComments')} className="py-8" />
          )}

          {!loading && comments.length === 0 && (
            <div className="text-center py-12">
              <div className="text-2xl mb-2">💬</div>
              <div className="text-sm text-muted-foreground">{t('social.noComments')}</div>
              <div className="text-xs text-muted-foreground mt-1">{t('social.beFirstToComment')}</div>
            </div>
          )}

          {!loading && comments.length > 0 && (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => (
                <div key={comment.id}>
                  {/* Top-level comment */}
                  <CommentBubble
                    comment={comment}
                    currentUserId={currentUserId}
                    onReply={() => setReplyTo({ id: comment.id, name: comment.authorName })}
                    onDelete={() => onDeleteComment(comment.id, sessionId)}
                  />

                  {/* Replies */}
                  {comment.replies.length > 0 && (
                    <div className="border-l-2 border-lime/20 ml-8 pl-3 mt-2 flex flex-col gap-2">
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

        {/* Footer: input */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          {replyTo && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted-foreground">
                {t('social.replyingTo')} <span className="font-medium text-foreground">{replyTo.name}</span>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="4" x2="12" y2="12" />
                  <line x1="12" y1="4" x2="4" y2="12" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              onKeyDown={handleKeyDown}
              placeholder={t('social.commentPlaceholder')}
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-lime/50"
              maxLength={500}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className={cn(
                'shrink-0 size-9 flex items-center justify-center rounded-lg transition-all',
                text.trim() && !sending
                  ? 'bg-lime text-background hover:bg-lime/90 active:scale-95'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              <svg className="size-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1.3a.75.75 0 0 1 .78-.06l12 6.5a.75.75 0 0 1 0 1.32l-12 6.5A.75.75 0 0 1 1.2 14.6L3.9 8.5 1.2 2.4a.75.75 0 0 1 .3-1.1ZM4.6 9l-1.8 4.1L12.4 8 2.8 2.9 4.6 7h4.9a.5.5 0 0 1 0 1H4.6Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Individual comment bubble ─────────────────────────────────────────────────

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

  return (
    <div className="group flex gap-2.5">
      {/* Avatar */}
      <div className={cn(
        'shrink-0 rounded-full bg-accent flex items-center justify-center font-medium text-foreground',
        isReply ? 'size-6 text-[10px]' : 'size-8 text-xs'
      )}>
        {comment.authorName[0]?.toUpperCase() || '?'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={cn('font-medium truncate', isReply ? 'text-xs' : 'text-sm')}>
            {comment.authorName}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {relativeTime(comment.created)}
          </span>
        </div>

        <p className={cn('text-muted-foreground mt-0.5 break-words', isReply ? 'text-xs' : 'text-sm')}>
          {comment.text}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={onReply}
            className="text-[11px] text-muted-foreground hover:text-lime transition-colors"
          >
            {t('social.reply')}
          </button>
          {isOwn && (
            <button
              onClick={onDelete}
              className="text-[11px] text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4v8.5a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5V4" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
