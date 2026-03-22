import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActivityFeed, type FeedItem } from '../hooks/useActivityFeed'
import { useReactions } from '../hooks/useReactions'
import { useComments } from '../hooks/useComments'
import { EmojiPicker } from '../components/social/EmojiPicker'
import { CommentsSheet } from '../components/social/CommentsSheet'
import { cn } from '../lib/utils'
import { Loader } from '../components/ui/loader'
import { Button } from '../components/ui/button'
import { PHASE_COLORS } from '../lib/style-tokens'

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr.replace(' ', 'T')).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Ayer'
  if (diffD <= 7) return `Hace ${diffD} dias`
  return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

interface ActivityFeedPageProps {
  userId: string
}

export default function ActivityFeedPage({ userId }: ActivityFeedPageProps) {
  const navigate = useNavigate()
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
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Social</div>
      <h1 className="font-bebas text-4xl md:text-5xl mb-6">ACTIVIDAD</h1>

      {loading && (
        <Loader label="Cargando actividad..." className="py-12" />
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 motion-safe:animate-scale-in">
          <div className="text-3xl mb-3">📡</div>
          <div className="text-sm text-muted-foreground mb-1">Sin actividad reciente</div>
          <div className="text-xs text-muted-foreground mb-4">Cuando tus amigos entrenen, lo veras aqui</div>
          <Button onClick={() => navigate('/friends')} className="bg-lime text-lime-foreground hover:bg-lime/90">
            Buscar amigos
          </Button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div id="tour-feed-list" className="flex flex-col gap-2">
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
                  onTap={() => navigate(`/session/${item.date}/${item.workoutKey}`)}
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
  const phaseColor = PHASE_COLORS[item.phase]

  return (
    <div className="px-4 py-3.5 bg-card border border-border rounded-lg hover:border-lime/20 transition-colors">
      {/* User + time */}
      <div className="flex items-center gap-2.5 mb-2">
        <button
          onClick={(e) => { e.stopPropagation(); onTapUser() }}
          className="size-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-foreground shrink-0 hover:ring-2 hover:ring-lime/30 transition-all"
        >
          {item.displayName[0]?.toUpperCase() || '?'}
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); onTapUser() }}
            className="text-sm font-medium truncate hover:text-lime transition-colors"
          >
            {item.displayName}
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(item.completedAt)}</span>
      </div>

      {/* Workout */}
      <button
        onClick={onTap}
        className={cn(
          'w-full text-left px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2',
          phaseColor?.border ? `border-l-[3px] ${phaseColor.border}` : 'border-l-[3px] border-l-lime',
        )}
      >
        <div className="min-w-0">
          <div className={cn('text-sm font-medium truncate', phaseColor?.text)}>{item.workoutTitle}</div>
          {item.note && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5 italic">{item.note}</div>
          )}
        </div>
        <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
      </button>

      {/* Reactions + Comment */}
      <div id="tour-feed-reaction" className="mt-2 flex items-center gap-2">
        <EmojiPicker reactions={reactions} onToggle={onReact} />
        <button
          onClick={(e) => { e.stopPropagation(); onComment() }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all duration-200 active:scale-90 text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 border border-transparent"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-3 3V3Z" />
          </svg>
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>
      </div>
    </div>
  )
}
