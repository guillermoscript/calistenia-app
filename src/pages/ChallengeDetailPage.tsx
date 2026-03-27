import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useChallengeDetail } from '../hooks/useChallengeDetail'
import { useFollows } from '../hooks/useFollows'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { METRIC_UNITS, daysRemaining, getMetricLabel } from '../lib/challenges'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'
import { ShareButton } from '../components/ShareButton'
import { shareChallenge } from '../lib/share'
import type { LeaderboardEntry } from '../hooks/useLeaderboard'

const MEDALS = ['🥇', '🥈', '🥉']

interface ChallengeDetailPageProps {
  userId: string
}

export default function ChallengeDetailPage({ userId }: ChallengeDetailPageProps) {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { challenge, leaderboard, loading, participantIds, load, inviteUser } = useChallengeDetail(id || null, userId)
  const { following } = useFollows(userId)
  const [showInvite, setShowInvite] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)

  useEffect(() => { load() }, [load])

  if (!id) return null

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 animate-pulse">
        <div className="h-4 w-16 bg-muted rounded mb-4" />
        <div className="h-8 w-56 bg-muted rounded mb-2" />
        <div className="h-4 w-32 bg-muted rounded mb-6" />
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-full px-4 py-3 rounded-lg border border-border bg-card flex items-center gap-3">
              <div className="w-8 h-6 bg-muted rounded shrink-0" />
              <div className="size-9 rounded-full bg-muted shrink-0" />
              <div className="flex-1"><div className="h-4 w-24 bg-muted rounded" /></div>
              <div className="h-7 w-12 bg-muted rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <button onClick={() => navigate('/challenges')} className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
          {t('common.back')}
        </button>
        <div className="text-center py-16 text-muted-foreground text-sm">Desafío no encontrado</div>
      </div>
    )
  }

  const isCreator = challenge.creator === userId
  const isActive = challenge.status === 'active'
  const unit = challenge.metric === 'custom' ? '' : METRIC_UNITS[challenge.metric]
  const metricLabel = getMetricLabel(challenge.metric, challenge.custom_metric)
  const invitableUsers = following.filter(u => !participantIds.has(u.id))

  const handleInvite = async (targetId: string) => {
    setInviting(targetId)
    await inviteUser(targetId)
    setInviting(null)
  }

  const challengeId = id!

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Back */}
      <button onClick={() => navigate('/challenges')} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        {t('common.back')}
      </button>

      {/* Header */}
      <div className="mb-6 motion-safe:animate-fade-in">
        <h1 className="font-bebas text-3xl md:text-4xl leading-none mb-2">{challenge.title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-medium text-lime border border-lime/30 bg-lime/10">
            {metricLabel}
          </span>
          {challenge.goal && challenge.goal > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-medium text-amber-400 border border-amber-400/30 bg-amber-400/10">
              Meta: {challenge.goal}
            </span>
          )}
          <span className={cn('text-[11px]', isActive ? 'text-amber-400' : 'text-muted-foreground')}>
            {daysRemaining(challenge.ends_at)}
          </span>
        </div>
        {challenge.description && (
          <div className="text-xs text-muted-foreground mt-2 leading-relaxed">{challenge.description}</div>
        )}
        <div className="text-[10px] text-muted-foreground mt-2 opacity-70">
          {challenge.starts_at} → {challenge.ends_at}
        </div>
      </div>

      {/* Share */}
      {isActive && (
        <div className="mb-6">
          <ShareButton
            onShare={(method) => shareChallenge(challenge.title, challengeId, method)}
            className="hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
          />
        </div>
      )}

      {/* Invite button (creator only) */}
      {isCreator && isActive && invitableUsers.length > 0 && (
        <div className="mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInvite(!showInvite)}
            className="text-[10px] tracking-widest h-9"
          >
            {showInvite ? t('challenge.hide') : t('challenge.inviteFriend')}
          </Button>

          {showInvite && (
            <div className="mt-3 flex flex-col gap-1.5 motion-safe:animate-fade-in">
              {invitableUsers.map(user => (
                <div key={user.id} className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg">
                  <div className="size-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium shrink-0">
                    {user.displayName[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm flex-1 truncate">{user.displayName}</span>
                  <Button
                    size="sm"
                    onClick={() => handleInvite(user.id)}
                    disabled={inviting === user.id}
                    className="text-[10px] tracking-widest h-7 bg-lime text-lime-foreground hover:bg-lime/90"
                  >
                    {inviting === user.id ? '...' : 'INVITAR'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ranking */}
      {leaderboard.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {leaderboard.map((entry, i) => (
            <div
              key={entry.userId}
              className="motion-safe:animate-fade-in"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <RankRow entry={entry} position={i + 1} unit={unit} onTap={() => navigate(`/u/${entry.userId}`)} />
            </div>
          ))}
        </div>
      )}

      {leaderboard.length === 0 && !loading && (
        <div className="text-center py-12 text-sm text-muted-foreground">{t('challenge.noParticipants')}</div>
      )}
    </div>
  )
}

// ── Rank Row ─────────────────────────────────────────────────────────────────

function RankRow({ entry, position, unit, onTap }: { entry: LeaderboardEntry; position: number; unit: string; onTap: () => void }) {
  const medal = MEDALS[position - 1]

  return (
    <button
      onClick={onTap}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        entry.isCurrentUser
          ? 'bg-lime/10 border border-lime/30 border-l-[3px] border-l-lime'
          : 'bg-card border border-border hover:border-lime/20',
      )}
    >
      <div className="w-8 text-center shrink-0">
        {medal ? <span className="text-lg">{medal}</span> : <span className="text-sm text-muted-foreground font-mono">{position}</span>}
      </div>
      {entry.avatarUrl ? (
        <img src={entry.avatarUrl} alt={entry.displayName} className="size-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0">
          {entry.displayName[0]?.toUpperCase() || '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-medium truncate', entry.isCurrentUser && 'text-lime')}>
          {entry.displayName}
          {entry.isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(tu)</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className={cn('font-bebas text-2xl', entry.isCurrentUser ? 'text-lime' : 'text-foreground')}>{entry.value}</span>
        {unit && <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>}
      </div>
    </button>
  )
}
