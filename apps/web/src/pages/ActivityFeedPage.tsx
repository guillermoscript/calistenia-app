import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useActivityFeed } from '@calistenia/core/hooks/useActivityFeed'
import { useReactions } from '@calistenia/core/hooks/useReactions'
import { useComments } from '@calistenia/core/hooks/useComments'
import { useCommentReactions } from '@calistenia/core/hooks/useCommentReactions'
import { CommentsSheet } from '../components/social/CommentsSheet'
import FeedCard from '../components/social/FeedCard'
import { Loader } from '../components/ui/loader'
import { EmptyState } from '../components/ui/empty-state'
import { Button } from '../components/ui/button'
import { feedItemHref, shareFeedItem } from '../lib/feed-routes'

interface ActivityFeedPageProps {
  userId: string
}

export default function ActivityFeedPage({ userId }: ActivityFeedPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { items, loading, loadingMore, hasMore, load, loadMore } = useActivityFeed(userId)
  const { loadForSessions, toggleReaction, getReactions } = useReactions(userId)
  const { getComments, loadCommentCounts, addComment, deleteComment, getCommentCount, commentsBySession } = useComments(userId)
  const commentReactions = useCommentReactions(userId)
  const [commentsSessionId, setCommentsSessionId] = useState<string | null>(null)
  // Deep-link desde una notificación (?session=<id>): hace scroll al post, lo
  // resalta (flash) y abre sus comentarios. Espeja la app nativa.
  const [searchParams] = useSearchParams()
  const sessionParam = searchParams.get('session')
  const commentParam = searchParams.get('comment')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // Comentario concreto a resaltar dentro del sheet (deep-link ?comment=).
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null)
  const deepLinkDoneRef = useRef<string | null>(null)

  const commentsSessionOwner = commentsSessionId
    ? items.find(i => i.id === commentsSessionId)?.userId
    : undefined

  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [load])

  // Deep-link → llevar al post y resaltarlo. Si está en el feed: scroll + flash y
  // (tras ~1s) abrir comentarios. Si no (p.ej. muy antiguo): abrir comentarios
  // directo. Espera a que el feed cargue antes de decidir.
  useEffect(() => {
    const target = sessionParam
    if (!target || deepLinkDoneRef.current === target) return

    const inFeed = items.some(i => i.id === target)
    if (!inFeed && loading) return // aún cargando, reevaluar al llegar items

    deepLinkDoneRef.current = target
    setHighlightCommentId(commentParam)
    // Nota: NO llamamos loadForSessions aquí — reemplaza el set de sesiones
    // rastreadas y borraría las reacciones del resto del feed. Los posts del feed
    // ya cargan reacciones/conteos vía el efecto de feedIdsKey.

    if (inFeed) {
      requestAnimationFrame(() => {
        document.getElementById(`feed-card-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      setHighlightId(target)
      setTimeout(() => setHighlightId(cur => (cur === target ? null : cur)), 1600)
      setTimeout(() => setCommentsSessionId(target), 1050)
    } else {
      setCommentsSessionId(target)
    }
  }, [sessionParam, commentParam, items, loading])

  // Infinite scroll: observe sentinel element
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  // Load reactions and comment counts once feed items are available.
  // Depend on a STABLE id-key (not the `items` array, which is a fresh
  // flatMap reference every render) so this effect only re-runs when the set
  // of feed ids actually changes — otherwise loadForSessions/loadCommentCounts
  // setState on every render → infinite re-render loop.
  const feedIdsKey = items.map(i => i.id).join(',')
  useEffect(() => {
    if (!feedIdsKey) return
    const ids = feedIdsKey.split(',')
    loadForSessions(ids)
    loadCommentCounts(ids)
  }, [feedIdsKey, loadForSessions, loadCommentCounts])

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('feed.section')}</div>
      <h1 className="font-bebas text-4xl md:text-5xl mb-6">{t('feed.title')}</h1>

      {loading && (
        <Loader label={t('feed.loading')} className="py-12" />
      )}

      {!loading && items.length === 0 && (
        <EmptyState
          icon="📡"
          title={t('feed.empty')}
          hint={t('feed.emptyHint')}
          action={(
            <Button onClick={() => navigate('/friends')} variant="limeSolid">
              {t('feed.findFriends')}
            </Button>
          )}
        />
      )}

      {!loading && items.length > 0 && (
        <div id="tour-feed-list" className="flex flex-col gap-3">
          {items.map((item, i) => {
            const isOwnPost = item.userId === userId
            // `null` = esta actividad no tiene destino abrible para quien mira
            // (circuito ajeno, batalla que no jugó). La tarjeta lo respeta.
            const href = feedItemHref(item, isOwnPost)
            return (
              <div
                key={item.id}
                id={`feed-card-${item.id}`}
                className="motion-safe:animate-fade-in scroll-mt-24"
                style={{ animationDelay: `${Math.min(i, 10) * 50}ms`, animationFillMode: 'both' }}
              >
                <FeedCard
                  item={item}
                  isOwnPost={isOwnPost}
                  highlight={item.id === highlightId}
                  onOpen={href ? () => navigate(href) : null}
                  onTapUser={() => navigate(`/u/${item.userId}`)}
                  reactions={getReactions(item.id)}
                  onReact={(emoji) => toggleReaction(item.id, emoji, item.userId)}
                  commentCount={getCommentCount(item.id)}
                  onComment={() => { setHighlightCommentId(null); setCommentsSessionId(item.id) }}
                  onShare={() => { void shareFeedItem(item) }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {!loading && items.length > 0 && hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && <Loader label={t('feed.loading')} />}
        </div>
      )}

      {/* Comments Sheet */}
      {commentsSessionId && (
        <CommentsSheet
          sessionId={commentsSessionId}
          isOpen={!!commentsSessionId}
          onClose={() => { setCommentsSessionId(null); setHighlightCommentId(null) }}
          highlightCommentId={highlightCommentId}
          comments={commentsBySession[commentsSessionId] || []}
          onLoadComments={getComments}
          onAddComment={(sid, text, parentId) => addComment(sid, text, parentId, commentsSessionOwner)}
          onDeleteComment={deleteComment}
          currentUserId={userId}
          reactions={getReactions(commentsSessionId)}
          onReact={(emoji) => toggleReaction(commentsSessionId, emoji, commentsSessionOwner)}
          commentReactions={commentReactions}
        />
      )}
    </div>
  )
}
