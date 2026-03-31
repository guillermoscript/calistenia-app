import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import i18n from '../lib/i18n'
import { useActivityFeed, type FeedItem } from '../hooks/useActivityFeed'
import { useReactions } from '../hooks/useReactions'
import { useComments } from '../hooks/useComments'
import { EmojiPicker } from '../components/social/EmojiPicker'
import { CommentsSheet } from '../components/social/CommentsSheet'
import { cn } from '../lib/utils'
import { Loader } from '../components/ui/loader'
import { Button } from '../components/ui/button'
import { PHASE_COLORS } from '../lib/style-tokens'
import { shareWorkoutSession } from '../lib/share'

function relativeTime(dateStr: string, t: TFunction): string {
  const now = Date.now()
  const then = new Date(dateStr.replace(' ', 'T')).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return t('feed.now')
  if (diffMin < 60) return t('feed.minutesAgo', { count: diffMin })
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return t('feed.hoursAgo', { count: diffH })
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return t('feed.yesterday')
  if (diffD <= 7) return t('feed.daysAgo', { count: diffD })
  return new Date(dateStr.replace(' ', 'T')).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
}

interface ActivityFeedPageProps {
  userId: string
}

export default function ActivityFeedPage({ userId }: ActivityFeedPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { items, loading, load } = useActivityFeed(userId)
  const { loadForSessions, toggleReaction, getReactions } = useReactions(userId)
  const { getComments, loadCommentCounts, addComment, deleteComment, getCommentCount, commentsBySession } = useComments(userId)
  const [commentsSessionId, setCommentsSessionId] = useState<string | null>(null)

  useEffect(() => { load() }, [load])

  // Load reactions and comment counts once feed items are available
  useEffect(() => {
    if (items.length > 0) {
      const ids = items.map(i => i.id)
      loadForSessions(ids)
      loadCommentCounts(ids)
    }
  }, [items, loadForSessions, loadCommentCounts])

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('feed.section')}</div>
      <h1 className="font-bebas text-4xl md:text-5xl mb-6">{t('feed.title')}</h1>

      {loading && (
        <Loader label={t('feed.loading')} className="py-12" />
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 motion-safe:animate-scale-in">
          <div className="text-3xl mb-3">📡</div>
          <div className="text-sm text-muted-foreground mb-1">{t('feed.empty')}</div>
          <div className="text-xs text-muted-foreground mb-4">{t('feed.emptyHint')}</div>
          <Button onClick={() => navigate('/friends')} className="bg-lime text-lime-foreground hover:bg-lime/90">
            {t('feed.findFriends')}
          </Button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div id="tour-feed-list" className="flex flex-col gap-3">
          {items.map((item, i) => {
            const reactions = getReactions(item.id)
            const commentCount = getCommentCount(item.id)
            return (
              <div
                key={item.id}
                className="motion-safe:animate-fade-in"
                style={{ animationDelay: `${Math.min(i, 10) * 50}ms`, animationFillMode: 'both' }}
              >
                <FeedCard
                  item={item}
                  onTap={() => navigate(`/u/${item.userId}`)}
                  onTapUser={() => navigate(`/u/${item.userId}`)}
                  reactions={reactions}
                  onReact={(emoji) => toggleReaction(item.id, emoji)}
                  commentCount={commentCount}
                  onComment={() => setCommentsSessionId(item.id)}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Comments Sheet */}
      {commentsSessionId && (
        <CommentsSheet
          sessionId={commentsSessionId}
          isOpen={!!commentsSessionId}
          onClose={() => setCommentsSessionId(null)}
          comments={commentsBySession[commentsSessionId] || []}
          onLoadComments={getComments}
          onAddComment={addComment}
          onDeleteComment={deleteComment}
          currentUserId={userId}
          reactions={getReactions(commentsSessionId)}
          onReact={(emoji) => toggleReaction(commentsSessionId, emoji)}
        />
      )}
    </div>
  )
}

// ── Feed Card ────────────────────────────────────────────────────────────────

interface FeedCardProps {
  item: FeedItem
  onTap: () => void
  onTapUser: () => void
  reactions: Record<string, { count: number; hasReacted: boolean }>
  onReact: (emoji: string) => void
  commentCount: number
  onComment: () => void
}

function FeedCard({ item, onTap, onTapUser, reactions, onReact, commentCount, onComment }: FeedCardProps) {
  const { t, i18n } = useTranslation()
  const phaseColor = PHASE_COLORS[item.phase]

  const formattedDate = new Date(item.completedAt.replace(' ', 'T')).toLocaleDateString(i18n.language, {
    weekday: 'short', day: 'numeric', month: 'short',
  })

  return (
    <div className="px-4 py-3.5 bg-card border border-border rounded-xl hover:border-lime/20 transition-colors shadow-sm">
      {/* User + time */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <button
          onClick={(e) => { e.stopPropagation(); onTapUser() }}
          className="size-9 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-foreground shrink-0 hover:ring-2 hover:ring-lime/30 transition-all overflow-hidden"
        >
          {item.avatarUrl ? (
            <img src={item.avatarUrl} alt={item.displayName} className="size-full object-cover" />
          ) : (
            item.displayName[0]?.toUpperCase() || '?'
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); onTapUser() }}
            className="text-sm font-medium truncate hover:text-lime transition-colors block"
          >
            {item.displayName}
          </button>
          <span className="text-[10px] text-muted-foreground">{formattedDate} · {relativeTime(item.completedAt, t)}</span>
        </div>
      </div>

      {/* Action line */}
      <p className="text-xs text-muted-foreground mb-2">
        {t('feed.completedWorkout')}
      </p>

      {/* Workout */}
      <button
        onClick={onTap}
        className={cn(
          'w-full text-left px-3 py-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors',
          phaseColor?.border ? `border-l-[3px] ${phaseColor.border}` : 'border-l-[3px] border-l-lime',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={cn('text-sm font-medium truncate', phaseColor?.text)}>{item.workoutTitle}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">{t('feed.phase')} {item.phase}</span>
            </div>
          </div>
          <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
        </div>
        {item.note && (
          <div className="text-[11px] text-muted-foreground truncate mt-1.5 italic border-t border-border/50 pt-1.5">"{item.note}"</div>
        )}
      </button>

      {/* Reactions + Comment */}
      <div id="tour-feed-reaction" className="mt-2.5 flex flex-wrap items-center gap-2">
        <EmojiPicker reactions={reactions} onToggle={onReact} />
        <button
          onClick={(e) => { e.stopPropagation(); onComment() }}
          className="inline-flex min-h-8 items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all duration-200 active:scale-95 text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 border border-border/60"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-3 3V3Z" />
          </svg>
          <span>{t('social.comments')}</span>
          <span className="font-medium tabular-nums">{commentCount}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            shareWorkoutSession(item.displayName, item.workoutTitle, item.date, item.workoutKey)
          }}
          className="inline-flex min-h-8 items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all duration-200 active:scale-95 text-muted-foreground hover:text-pink-400 hover:bg-pink-500/10 border border-transparent"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="3" r="2" />
            <circle cx="12" cy="13" r="2" />
            <circle cx="4" cy="8" r="2" />
            <line x1="5.8" y1="7" x2="10.2" y2="4" />
            <line x1="5.8" y1="9" x2="10.2" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
