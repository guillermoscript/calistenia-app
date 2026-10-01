import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
import { useSuggestedUsers } from '@calistenia/core/hooks/useSuggestedUsers'
import {
  trackSuggestedUserFollowed,
  trackSuggestedUsersViewed,
  type SuggestedUsersSurface,
} from '@calistenia/core/lib/suggested-users'
import { Button } from '../ui/button'

interface SuggestedUsersProps {
  userId: string
  surface: SuggestedUsersSurface
  limit?: number
  /** Solo se pinta si sigues a este número de personas o menos. */
  maxFollowing?: number
  className?: string
}

/**
 * «Gente activa para seguir» (#806). Se oculta sola cuando no hay sugerencias o
 * cuando el usuario ya sigue a bastante gente.
 */
export function SuggestedUsers({ userId, surface, limit, maxFollowing = Infinity, className }: SuggestedUsersProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { following, followingIds, pendingOutgoingIds, loading: followsLoading, follow } = useFollows(userId)
  const { blockedIds } = useBlocks(userId)
  const enabled = !followsLoading && following.length <= maxFollowing
  const { suggestions } = useSuggestedUsers(userId, followingIds, pendingOutgoingIds, blockedIds, { enabled, limit })
  const viewedRef = useRef(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Posición que tenía la fila al pulsar: tras seguir desaparece de la lista.
  const positions = useRef(new Map<string, number>())
  suggestions.forEach((s, i) => positions.current.set(s.id, i + 1))

  useEffect(() => {
    if (viewedRef.current || suggestions.length === 0) return
    viewedRef.current = true
    trackSuggestedUsersViewed(surface, suggestions.length)
  }, [suggestions.length, surface])

  if (!enabled || suggestions.length === 0) return null

  async function onFollow(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      const result = await follow(id)
      if (result) trackSuggestedUserFollowed(surface, id, result, positions.current.get(id) ?? 0)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className={className} aria-label={t('friends.suggestedTitle')}>
      <h2 className="text-[11px] text-muted-foreground tracking-[0.2em] uppercase mb-1">{t('friends.suggestedTitle')}</h2>
      <p className="text-xs text-muted-foreground mb-3">{t('friends.suggestedHint')}</p>
      <div className="flex flex-col gap-1.5">
        {suggestions.map(u => (
          <div
            key={u.id}
            role="link"
            tabIndex={0}
            aria-label={t('friends.viewProfile', { name: u.displayName })}
            onClick={() => navigate(`/u/${u.id}`)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/u/${u.id}`) } }}
            className="w-full px-4 py-3 bg-card border border-border rounded-lg hover:border-lime/30 transition-colors flex items-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {u.avatarUrl ? (
              <img src={u.avatarUrl} alt="" loading="lazy" className="size-10 rounded-full object-cover shrink-0" />
            ) : (
              <div className="size-10 rounded-full bg-accent flex items-center justify-center text-sm font-medium shrink-0" aria-hidden="true">
                {u.displayName[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.displayName}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {t('friends.suggestedSessions', { n: u.totalSessions })}
                {u.currentStreak > 1 ? ` · ${t('friends.suggestedStreak', { n: u.currentStreak })}` : ''}
              </div>
            </div>
            <Button
              variant="limeSolid"
              size="sm"
              disabled={busyId === u.id}
              onClick={e => { e.stopPropagation(); void onFollow(u.id) }}
              className="text-[11px] tracking-widest h-8 shrink-0"
            >
              {busyId === u.id ? '...' : t('friends.followBtn')}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
