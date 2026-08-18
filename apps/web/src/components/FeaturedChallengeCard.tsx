import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Trophy } from 'lucide-react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { useFeaturedChallenge } from '@calistenia/core/hooks/useFeaturedChallenge'
import { trackFeaturedChallengeViewed, trackFeaturedChallengeOpened } from '@calistenia/core/lib/featured-challenge'
import { resolvePresetChallengeTitle } from '@calistenia/core/lib/challenge-presets'

interface FeaturedChallengeCardProps {
  onNavigate: (path: string) => void
  userId: string | null
}

/**
 * Card de reto destacado en Home (#351). Nunca rompe la página: mientras
 * carga o si no hay reto que enseñar, no renderiza nada (mismo criterio que
 * LeaderboardWidget/ActivityFeedWidget).
 */
export default function FeaturedChallengeCard({ onNavigate, userId }: FeaturedChallengeCardProps) {
  const { t } = useTranslation()
  const { card, participantCount, loading, joining, join } = useFeaturedChallenge(userId)

  // Una impresión por reto+estado montado, no en cada re-render.
  const viewedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!card) return
    const key = `${card.challenge.id}:${card.state}`
    if (viewedKeyRef.current === key) return
    viewedKeyRef.current = key
    trackFeaturedChallengeViewed(card)
  }, [card])

  if (loading || !card) return null

  const detailPath = `/challenges/${card.challenge.id}`

  const handleOpen = () => {
    trackFeaturedChallengeOpened(card)
    onNavigate(detailPath)
  }

  const handleJoin = async () => {
    await join(card.challenge.id)
    trackFeaturedChallengeOpened(card)
    onNavigate(detailPath)
  }

  // Un reto de preset (#350) guarda el título de catálogo; el visible vive en
  // i18n. Sin preset_key devuelve el título tal cual.
  const title = resolvePresetChallengeTitle(card.challenge)

  const daysLabel = card.state === 'results'
    ? t('featuredChallenge.ended')
    : card.daysRemaining === 0
      ? t('featuredChallenge.lastDay')
      : t('featuredChallenge.daysLeft', { count: card.daysRemaining })

  return (
    <div className="relative p-4 bg-card border border-border rounded-xl border-l-[3px] border-l-lime hover:border-l-lime/50 transition-colors">
      {/* Toda la card abre el detalle; los controles van encima (no se anidan botones). */}
      <button
        onClick={handleOpen}
        aria-label={title}
        className="absolute inset-0 rounded-xl"
      />

      <div className="relative flex items-center gap-1.5 text-[10px] text-muted-foreground tracking-widest uppercase mb-2">
        <Trophy className="size-3" />
        {t('featuredChallenge.kicker')}
      </div>

      <div className="relative font-bebas text-xl md:text-2xl leading-tight mb-2 truncate">
        {title}
      </div>

      <div className="relative flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
        <span>{t('challenges.participants', { count: participantCount })}</span>
        <span aria-hidden="true">·</span>
        <span>{daysLabel}</span>
      </div>

      {card.isParticipant && card.state === 'continue' ? (
        <div className="relative">
          <div className="text-[11px] text-lime mb-1.5">{t('featuredChallenge.participating')}</div>
          <Progress value={card.progressPct} className="h-1.5 mb-3" />
          <Button
            onClick={(e) => { e.stopPropagation(); handleOpen() }}
            size="sm"
            variant="limeSolid"
            className="relative h-9 px-4 text-[11px] font-bold tracking-widest"
          >
            {t('featuredChallenge.continue')}
          </Button>
        </div>
      ) : card.state === 'results' ? (
        <Button
          onClick={(e) => { e.stopPropagation(); handleOpen() }}
          size="sm"
          variant="limeSolid"
          className="relative h-9 px-4 text-[11px] font-bold tracking-widest"
        >
          {t('featuredChallenge.results')}
        </Button>
      ) : (
        <Button
          onClick={(e) => { e.stopPropagation(); handleJoin() }}
          disabled={joining}
          size="sm"
          variant="limeSolid"
          className="relative h-9 px-4 text-[11px] font-bold tracking-widest"
        >
          {t('featuredChallenge.join')}
        </Button>
      )}
    </div>
  )
}
