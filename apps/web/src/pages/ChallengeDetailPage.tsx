import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useChallengeDetail } from '@calistenia/core/hooks/useChallengeDetail'
import { useExpressProgress, type ExpressProgress } from '@calistenia/core/hooks/useChallengeExpress'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { getMetricUnit, daysRemaining, getMetricLabel } from '@calistenia/core/lib/challenges'
import { getChallengeLayout, getGoalProgress } from '@calistenia/core/lib/challenge-layout'
import { isCumulativeMetric } from '@calistenia/core/lib/cumulative-scoring'
import { formatDateRange } from '@calistenia/core/lib/dateUtils'
import {
  resolvePresetChallengeDescription,
  resolvePresetChallengeTitle,
} from '@calistenia/core/lib/challenge-presets'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'
import { ShareButton } from '../components/ShareButton'
import { shareChallenge } from '../lib/share'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'

const MEDALS = ['🥇', '🥈', '🥉']

// Métricas con semántica de ventana (cuentan lo registrado entre inicio y fin
// del reto). PR-style ('most_pullups', 'most_lsit'...) y 'custom' no la tienen.
const WINDOW_METRICS = new Set(['most_sessions', 'longest_streak', 'exercise'])
const hasWindowSemantics = (metric: string) => WINDOW_METRICS.has(metric) || isCumulativeMetric(metric)

interface ChallengeDetailPageProps {
  userId: string
}

export default function ChallengeDetailPage({ userId }: ChallengeDetailPageProps) {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { challenge, leaderboard, loading, participantIds, load, inviteUser } = useChallengeDetail(id || null, userId)
  const { progress: expressProgress, loading: expressLoading } = useExpressProgress(challenge)
  const { following } = useFollows(userId)
  const [showInvite, setShowInvite] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)
  // La clasificación de la rama con meta nace plegada: el héroe es el progreso.
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  useEffect(() => { load() }, [load])

  // Solo cuenta como vista cuando el reto se ha cargado y se pinta: un enlace a
  // un reto borrado o sin permiso llega hasta aquí y no debe inflar el embudo.
  // El ref evita repetirla en cada refetch del leaderboard.
  const viewedIdRef = useRef<string | null>(null)
  const progressTrackedRef = useRef<string | null>(null)
  const completionTrackedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!id || loading || !challenge) return
    if (viewedIdRef.current === id) return
    viewedIdRef.current = id
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
      surface: 'challenge_detail',
      source: 'challenge_route',
      challenge_id: id,
      result: 'viewed',
    })
  }, [id, loading, challenge])

  useEffect(() => {
    if (!id || loading) return
    const currentEntry = leaderboard.find(entry => entry.isCurrentUser)
    if (!currentEntry) return
    const key = `${id}:${currentEntry.value}`
    if (progressTrackedRef.current === key) return
    progressTrackedRef.current = key
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeProgressUpdated, {
      surface: 'challenge_detail',
      source: 'challenge_route',
      challenge_id: id,
      progress_value: currentEntry.value,
      result: 'updated',
    })
  }, [id, loading, leaderboard])

  useEffect(() => {
    if (!id || loading || !challenge?.goal || challenge.goal <= 0) return
    const currentEntry = leaderboard.find(entry => entry.isCurrentUser)
    if (!currentEntry || currentEntry.value < challenge.goal || completionTrackedRef.current === id) return
    completionTrackedRef.current = id
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeCompleted, {
      surface: 'challenge_detail',
      source: 'challenge_goal_reached',
      challenge_id: id,
      result: 'completed',
    })
  }, [id, loading, challenge, leaderboard])

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
        <div className="text-center py-16 text-muted-foreground text-sm">{t('challenge.notFound')}</div>
      </div>
    )
  }

  const isCreator = challenge.creator === userId
  const isActive = challenge.status === 'active'
  const isExpress = challenge.type === 'express'
  const currentEntry = leaderboard.find(entry => entry.isCurrentUser)
  const goalReached = !!challenge.goal && !!currentEntry && currentEntry.value >= challenge.goal
  const unit = getMetricUnit(challenge.metric, challenge.exercise_slug)
  // Dos formas de reto, dos layouts (#383). El criterio vive en core para que web
  // y nativo ramifiquen igual.
  const layout = getChallengeLayout(challenge)
  const isGoalLayout = layout === 'goal'
  const isRankingLayout = layout === 'ranking'
  const progress = getGoalProgress(currentEntry?.value ?? 0, challenge.goal)
  const metricLabel = getMetricLabel(challenge.metric, challenge.custom_metric, challenge.exercise_slug)
  // Va en la fila meta, junto al estado: es la misma pregunta ("¿cuándo va esto?").
  // Vacío si los campos no son válidos.
  const dateRange = formatDateRange(challenge.starts_at, challenge.ends_at)
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
      <div className={cn('motion-safe:animate-fade-in', isRankingLayout ? 'mb-4' : 'mb-6')}>
        <h1 className="font-bebas text-3xl md:text-4xl leading-none mb-2">{resolvePresetChallengeTitle(challenge)}</h1>

        {/* Rama con meta: el progreso va antes que nada, para que se vea cuánto
            falta sin hacer scroll. Se pinta aunque aún no participes (valor 0):
            así el reto dice qué es y qué significa apuntarse. */}
        {isGoalLayout && (
          <GoalHero
            value={currentEntry?.value ?? 0}
            goal={challenge.goal ?? 0}
            unit={unit}
            pct={progress.pct}
            remaining={progress.remaining}
            reached={progress.reached}
          />
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-medium text-lime border border-lime/30 bg-lime/10">
            {metricLabel}
          </span>
          {isExpress && (challenge.daily_target ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-medium text-amber-400 border border-amber-400/30 bg-amber-400/10">
              {t('challenge.expressTarget', { target: challenge.daily_target, days: challenge.duration_days })}
            </span>
          )}
          {/* La píldora de meta desaparece en la rama con meta: el héroe ya la dice. */}
          {!isExpress && !isGoalLayout && (challenge.goal ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-medium text-amber-400 border border-amber-400/30 bg-amber-400/10">
              {t('challenges.goal', { value: challenge.goal })}
            </span>
          )}
          {dateRange && <span className="text-[11px] text-foreground">{dateRange}</span>}
          <span className={cn('text-[11px]', goalReached ? 'text-lime' : isActive ? 'text-amber-400' : 'text-muted-foreground')}>
            {goalReached ? t('challenge.preset.completed') : isActive ? daysRemaining(challenge.ends_at, challenge.starts_at) : t('challenge.preset.expired')}
          </span>
        </div>
        {/* En la rama de ranking la cabecera se encoge para que la lista empiece
            antes: la descripción se recorta en vez de ocupar lo que quiera. */}
        {challenge.description && (
          <div className={cn('text-xs text-muted-foreground mt-2 leading-relaxed', isRankingLayout && 'line-clamp-2')}>
            {resolvePresetChallengeDescription(challenge)}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          {t(`challenge.metricDesc.${challenge.metric}`)}
          {hasWindowSemantics(challenge.metric) && <> · {t('challenge.scoreWindowNote')}</>}
        </div>
      </div>

      {/* Share */}
      {isActive && (
        <div className={isRankingLayout ? 'mb-4' : 'mb-6'}>
          <ShareButton
            onShare={(method) => shareChallenge(resolvePresetChallengeTitle(challenge), challengeId, method)}
            className="hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
          />
        </div>
      )}

      {/* Invite button (creator only) */}
      {isCreator && isActive && invitableUsers.length > 0 && (
        <div className={isRankingLayout ? 'mb-4' : 'mb-6'}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInvite(!showInvite)}
            className="text-[10px] tracking-widest h-9"
          >
            {showInvite ? t('challenge.hide') : t('challenge.inviteFriends')}
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

      {/* Progreso diario (retos express) */}
      {isExpress && expressProgress.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {expressProgress.map((entry, i) => (
            <div
              key={entry.participantId}
              className="motion-safe:animate-fade-in"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <ExpressRow
                entry={entry}
                position={i + 1}
                isCurrentUser={entry.participantId === userId}
                onTap={() => navigate(`/u/${entry.participantId}`)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Clasificación de la rama con meta: baja a una sección plegada, porque lo
          que importa en un reto contra una cifra es el progreso, no el puesto. */}
      {isGoalLayout && leaderboard.length > 0 && (
        <div>
          <button
            onClick={() => setLeaderboardOpen(!leaderboardOpen)}
            aria-expanded={leaderboardOpen}
            className="w-full flex items-center justify-between border-t border-border py-3 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <span>{t('challenge.leaderboard')} · {t('challenges.participants', { count: leaderboard.length })}</span>
            <svg
              className={cn('size-4 transition-transform', leaderboardOpen && 'rotate-180')}
              viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"
            >
              <polyline points="4,6 8,10 12,6" />
            </svg>
          </button>
          {leaderboardOpen && (
            <div className="flex flex-col gap-1.5 mt-1.5">
              {leaderboard.map((entry, i) => (
                <div
                  key={entry.userId}
                  className="motion-safe:animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
                >
                  <RankRow entry={entry} position={i + 1} unit={unit} variant="card" onTap={() => navigate(`/u/${entry.userId}`)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clasificación de la rama sin meta: la lista ES la pantalla. A sangre
          (se come el padding del contenedor) y con tu fila pegada abajo mientras
          la de verdad queda fuera de la vista — `sticky` puro, sin JS de scroll.
          Fondo sólido a propósito: el difuminado va contra las reglas de diseño. */}
      {isRankingLayout && leaderboard.length > 0 && (
        <div className="-mx-4 md:-mx-6 border-t border-border">
          {leaderboard.map((entry, i) => (
            <div
              key={entry.userId}
              className={cn(
                'motion-safe:animate-fade-in',
                entry.isCurrentUser && 'sticky bottom-0 z-10 bg-background',
              )}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <RankRow entry={entry} position={i + 1} unit={unit} variant="flat" onTap={() => navigate(`/u/${entry.userId}`)} />
            </div>
          ))}
        </div>
      )}

      {(isExpress ? expressProgress.length === 0 && !expressLoading : leaderboard.length === 0 && !loading) && (
        <div className="text-center py-12 text-sm text-muted-foreground">{t('challenge.noParticipants')}</div>
      )}
    </div>
  )
}

// ── Goal Hero ────────────────────────────────────────────────────────────────

/** El héroe de la rama con meta: tú contra la cifra. */
function GoalHero({ value, goal, unit, pct, remaining, reached }: {
  value: number; goal: number; unit: string; pct: number; remaining: number; reached: boolean
}) {
  const { t } = useTranslation()
  const withUnit = (n: number) => (unit ? `${n} ${unit}` : `${n}`)

  return (
    <div className="my-4 flex flex-col gap-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {t('challenge.preset.progress')}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-bebas text-5xl md:text-6xl leading-none text-lime">{value}</span>
        <span className="text-sm text-muted-foreground">/ {withUnit(goal)}</span>
      </div>

      <div
        className="h-3 rounded-full border border-border bg-card overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className={cn('text-[11px] tracking-wide', reached ? 'text-lime' : 'text-muted-foreground')}>
        {reached ? t('challenge.preset.completed') : t('challenge.goalRemaining', { value: withUnit(remaining) })}
      </div>
    </div>
  )
}

// ── Rank Row ─────────────────────────────────────────────────────────────────

function RankRow({ entry, position, unit, variant, onTap }: { entry: LeaderboardEntry; position: number; unit: string; variant: 'card' | 'flat'; onTap: () => void }) {
  const medal = MEDALS[position - 1]

  return (
    <button
      onClick={onTap}
      className={cn(
        'w-full text-left py-3 flex items-center gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        variant === 'card'
          ? cn(
              'px-4 rounded-lg',
              entry.isCurrentUser
                ? 'bg-lime/10 border border-lime/30 border-l-[3px] border-l-lime'
                : 'bg-card border border-border hover:border-lime/20',
            )
          : cn(
              'px-4 md:px-6 border-b border-border',
              entry.isCurrentUser
                ? 'bg-lime/10 border-l-[3px] border-l-lime'
                : 'hover:bg-card',
            ),
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

// ── Express Row (progreso diario) ────────────────────────────────────────────

function ExpressRow({ entry, position, isCurrentUser, onTap }: { entry: ExpressProgress; position: number; isCurrentUser: boolean; onTap: () => void }) {
  const { t } = useTranslation()
  const medal = MEDALS[position - 1]

  return (
    <button
      onClick={onTap}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg flex flex-col gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isCurrentUser
          ? 'bg-lime/10 border border-lime/30 border-l-[3px] border-l-lime'
          : 'bg-card border border-border hover:border-lime/20',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 text-center shrink-0">
          {medal ? <span className="text-lg">{medal}</span> : <span className="text-sm text-muted-foreground font-mono">{position}</span>}
        </div>
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt={entry.participantName} className="size-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0">
            {entry.participantName[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className={cn('text-sm font-medium truncate', isCurrentUser && 'text-lime')}>
            {entry.participantName}
            {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(tu)</span>}
          </div>
          {entry.currentStreak > 0 && (
            <div className="text-[10px] text-amber-400">🔥 {t('challenge.expressStreak', { n: entry.currentStreak })}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className={cn('font-bebas text-2xl', isCurrentUser ? 'text-lime' : 'text-foreground')}>{entry.daysCompleted}</span>
          <span className="text-[10px] text-muted-foreground ml-1">/ {entry.totalDays} {t('challenge.unitDays')}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 pl-11">
        {entry.dailyProgress.map(day => (
          <span
            key={day.date}
            title={`${day.date}: ${day.value}`}
            className={cn(
              'size-2.5 rounded-[3px]',
              day.completed ? 'bg-lime' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </button>
  )
}
