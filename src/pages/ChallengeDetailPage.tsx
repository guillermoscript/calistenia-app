import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useChallengeDetail } from '../hooks/useChallengeDetail'
import { useFollows } from '../hooks/useFollows'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import type { ChallengeMetric } from '../types'
import type { LeaderboardEntry } from '../hooks/useLeaderboard'

const METRIC_LABELS: Record<ChallengeMetric, string> = {
  most_sessions: 'Mas sesiones',
  most_pullups: 'Mas pull-ups',
  most_pushups: 'Mas push-ups',
  longest_streak: 'Mayor racha',
  most_lsit: 'Mayor L-sit',
  most_handstand: 'Mayor handstand',
}

const METRIC_UNITS: Record<ChallengeMetric, string> = {
  most_sessions: '',
  most_pullups: 'reps',
  most_pushups: 'reps',
  longest_streak: 'dias',
  most_lsit: 's',
  most_handstand: 's',
}

const MEDALS = ['🥇', '🥈', '🥉']

function daysRemaining(endsAt: string): string {
  const diff = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return 'Finalizado'
  if (diff === 1) return '1 dia restante'
  return `${diff} dias restantes`
}

interface ChallengeDetailPageProps {
  userId: string
}

export default function ChallengeDetailPage({ userId }: ChallengeDetailPageProps) {
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
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="text-sm text-muted-foreground py-12 text-center">Cargando desafio...</div>
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <button onClick={() => navigate('/challenges')} className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1">
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
          Volver
        </button>
        <div className="text-center py-16 text-muted-foreground text-sm">Desafio no encontrado</div>
      </div>
    )
  }

  const isCreator = challenge.creator === userId
  const isActive = challenge.status === 'active'
  const unit = METRIC_UNITS[challenge.metric]
  const invitableUsers = following.filter(u => !participantIds.has(u.id))

  const handleInvite = async (targetId: string) => {
    setInviting(targetId)
    await inviteUser(targetId)
    setInviting(null)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Back */}
      <button onClick={() => navigate('/challenges')} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1">
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        Volver
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bebas text-3xl md:text-4xl leading-none mb-2">{challenge.title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-medium text-lime border border-lime/30 bg-lime/10">
            {METRIC_LABELS[challenge.metric]}
          </span>
          <span className={cn('text-[11px]', isActive ? 'text-amber-400' : 'text-muted-foreground')}>
            {daysRemaining(challenge.ends_at)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {challenge.starts_at} → {challenge.ends_at}
        </div>
      </div>

      {/* Invite button (creator only) */}
      {isCreator && isActive && invitableUsers.length > 0 && (
        <div className="mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInvite(!showInvite)}
            className="text-[10px] tracking-widest h-9"
          >
            {showInvite ? 'OCULTAR' : 'INVITAR AMIGO'}
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
        <div className="text-center py-12 text-sm text-muted-foreground">Sin participantes</div>
      )}
    </div>
  )
}

// ── Rank Row (same pattern as LeaderboardPage) ──────────────────────────────

function RankRow({ entry, position, unit, onTap }: { entry: LeaderboardEntry; position: number; unit: string; onTap: () => void }) {
  const medal = MEDALS[position - 1]

  return (
    <button
      onClick={onTap}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors',
        entry.isCurrentUser
          ? 'bg-lime/10 border border-lime/30 border-l-[3px] border-l-lime'
          : 'bg-card border border-border hover:border-lime/20',
      )}
    >
      <div className="w-8 text-center shrink-0">
        {medal ? <span className="text-lg">{medal}</span> : <span className="text-sm text-muted-foreground font-mono">{position}</span>}
      </div>
      <div className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0">
        {entry.displayName[0]?.toUpperCase() || '?'}
      </div>
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
