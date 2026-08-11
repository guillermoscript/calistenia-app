import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useChallenges, type ChallengeWithMeta } from '@calistenia/core/hooks/useChallenges'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { daysRemaining, getMetricLabel } from '@calistenia/core/lib/challenges'
import {
  BEGINNER_CHALLENGE_PRESETS,
  getPresetDateRange,
  getPresetTargetLabel,
  resolvePresetChallengeTitle,
  type BeginnerChallengePreset,
} from '@calistenia/core/lib/challenge-presets'
import { toast } from 'sonner'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

type Filter = 'active' | 'past'

interface ChallengesPageProps {
  userId: string
}

export default function ChallengesPage({ userId }: ChallengesPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { active, past, loading, load, joinPreset } = useChallenges(userId)
  const [filter, setFilter] = useState<Filter>('active')
  const [joiningPreset, setJoiningPreset] = useState<string | null>(null)

  useEffect(() => { load() }, [load])

  useEffect(() => {
    for (const preset of BEGINNER_CHALLENGE_PRESETS) {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
        surface: 'challenge_preset_catalog',
        source: preset.id,
        result: 'viewed',
      })
    }
  }, [])

  const items = filter === 'active' ? active : past
  // Solo los retos activos "ocupan" un preset: una ronda terminada debe dejar
  // volver a empezar, no bloquear la tarjeta en VER PROGRESO para siempre.
  const joinedPresets = new Map(
    active
      .filter(challenge => challenge.preset_key)
      .map(challenge => [challenge.preset_key!, challenge]),
  )

  const handleJoinPreset = async (preset: BeginnerChallengePreset) => {
    if (!preset.enabled || joiningPreset) return

    const dates = getPresetDateRange(preset)
    const confirmed = window.confirm(t('challenge.preset.confirmBody', {
      title: t(preset.titleKey),
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
    }))
    if (!confirmed) return

    setJoiningPreset(preset.id)
    try {
      const result = await joinPreset(preset.id)
      navigate(`/challenges/${result.challengeId}`)
    } catch {
      toast.error(t('challenge.preset.joinError'))
    } finally {
      setJoiningPreset(null)
    }
  }

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: 'active', label: t('challenges.filterActive'), count: active.length },
    { id: 'past', label: t('challenges.filterPast'), count: past.length },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('challenges.section')}</div>
      <div className="flex items-end justify-between mb-6">
        <h1 className="font-bebas text-4xl md:text-5xl">{t('challenges.title')}</h1>
        <Button
          id="tour-challenges-create"
          onClick={() => navigate('/challenges/new')}
          size="sm"
          className="bg-lime text-lime-foreground hover:bg-lime/90 text-[10px] tracking-widest h-9"
        >
          {t('challenges.create')}
        </Button>
      </div>

      {filter === 'active' && (
        <section data-testid="beginner-challenge-presets" className="mb-8">
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">
            {t('challenge.preset.kicker')}
          </div>
          <h2 className="font-bebas text-2xl mb-1">{t('challenge.preset.catalogTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-4">{t('challenge.preset.catalogDescription')}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {BEGINNER_CHALLENGE_PRESETS.map(preset => (
              <BeginnerPresetCard
                key={preset.id}
                preset={preset}
                joinedChallenge={joinedPresets.get(preset.id)}
                joining={joiningPreset === preset.id}
                onJoin={() => void handleJoinPreset(preset)}
                onOpen={(challengeId) => navigate(`/challenges/${challengeId}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Filter tabs */}
      <div id="tour-challenges-filters" role="tablist" aria-label={t('challenges.filterAriaLabel')} className="flex gap-1.5 mb-6">
        {FILTERS.map(f => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            aria-controls={`tabpanel-challenges-${f.id}`}
            id={`tab-challenges-${f.id}`}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-2.5 min-h-[44px] rounded-md text-[11px] tracking-wide font-medium transition-colors duration-200 border',
              filter === f.id
                ? 'text-lime border-current bg-accent/50'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {f.label}
            {f.count > 0 && <span className="ml-1 text-[10px] opacity-70">{f.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`tabpanel-challenges-${filter}`} aria-labelledby={`tab-challenges-${filter}`}>
        {/* Loading */}
        {loading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-full px-4 py-3.5 rounded-lg border border-border bg-card flex items-center justify-between gap-3 animate-pulse">
                <div className="flex-1 min-w-0">
                  <div className="h-4 w-40 bg-muted rounded mb-2" />
                  <div className="h-3 w-28 bg-muted rounded" />
                </div>
                <div className="h-3 w-20 bg-muted rounded shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="text-center py-16 motion-safe:animate-scale-in">
            <div className="text-3xl mb-3 motion-safe:animate-gentle-float">🎯</div>
            <div className="text-sm text-muted-foreground mb-1">
              {filter === 'active' ? t('challenges.emptyActive') : t('challenges.emptyPast')}
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              {t('challenges.emptyHint')}
            </div>
            {filter === 'active' && (
              <Button onClick={() => navigate('/challenges/new')} className="bg-lime text-lime-foreground hover:bg-lime/90">
                {t('challenges.createChallenge')}
              </Button>
            )}
          </div>
        )}

        {/* Challenge cards */}
        {!loading && items.length > 0 && (
          <div id="tour-challenges-list" className="flex flex-col gap-2">
            {items.map((ch, i) => (
              <div
                key={ch.id}
                className="motion-safe:animate-fade-in"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
              >
                <ChallengeCard challenge={ch} onTap={() => navigate(`/challenges/${ch.id}`)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BeginnerPresetCard({
  preset,
  joinedChallenge,
  joining,
  onJoin,
  onOpen,
}: {
  preset: BeginnerChallengePreset
  joinedChallenge?: ChallengeWithMeta
  joining: boolean
  onJoin: () => void
  onOpen: (challengeId: string) => void
}) {
  const { t } = useTranslation()
  const title = t(preset.titleKey)
  const isJoined = !!joinedChallenge

  return (
    <article
      data-testid={`challenge-preset-${preset.id}`}
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-4',
        preset.enabled ? 'border-border' : 'border-border/60 opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(preset.descriptionKey)}</p>
        </div>
        <span className="shrink-0 rounded border border-lime/30 bg-lime/10 px-2 py-1 text-[9px] uppercase tracking-widest text-lime">
          {t('challenge.preset.difficulty')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        <span className="text-lime">{getMetricLabel(preset.metric)}</span>
        <span>·</span>
        <span>{getPresetTargetLabel(preset)}</span>
        <span>·</span>
        <span>{t('challenge.preset.duration', { count: preset.durationDays })}</span>
      </div>
      {preset.disabledReasonKey && !preset.enabled && (
        <p className="text-[10px] text-amber-400">{t(preset.disabledReasonKey)}</p>
      )}
      <Button
        type="button"
        size="sm"
        disabled={!preset.enabled || joining}
        onClick={() => isJoined ? onOpen(joinedChallenge!.id) : onJoin()}
        className={cn(
          'h-9 text-[10px] tracking-widest',
          preset.enabled ? 'bg-lime text-lime-foreground hover:bg-lime/90' : 'bg-muted text-muted-foreground',
        )}
      >
        {joining ? t('challenge.preset.joining') : isJoined ? t('challenge.preset.open') : preset.enabled ? t('challenge.preset.join') : t('challenge.preset.unavailable')}
      </Button>
    </article>
  )
}

// ── Challenge Card ───────────────────────────────────────────────────────────

function ChallengeCard({ challenge: ch, onTap }: { challenge: ChallengeWithMeta; onTap: () => void }) {
  const { t } = useTranslation()
  const isActive = ch.status === 'active'
  const metricLabel = getMetricLabel(ch.metric, ch.custom_metric, ch.exercise_slug)

  return (
    <button
      onClick={onTap}
      className="w-full text-left px-4 py-3.5 rounded-lg border transition-colors flex items-center justify-between gap-3 bg-card border-border hover:border-lime/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{resolvePresetChallengeTitle(ch)}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] text-lime tracking-wide">{metricLabel}</span>
          {ch.goal && ch.goal > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-amber-400">{t('challenges.goal', { value: ch.goal })}</span>
            </>
          )}
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className={cn('text-[10px]', isActive ? 'text-amber-400' : 'text-muted-foreground')}>
            {daysRemaining(ch.ends_at)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-muted-foreground">{t('challenges.participants', { count: ch.participantCount })}</span>
        <svg className="size-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
      </div>
    </button>
  )
}
