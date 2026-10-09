import { lazy, Suspense, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { assessTrackQuality } from '@calistenia/core/lib/geo'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { useCardioSessionDetail } from '@calistenia/core/hooks/useCardioSessionDetail'
import { useAuthState } from '../contexts/AuthContext'
import CardioSessionStatsPanel from '../components/cardio/CardioSessionStatsPanel'
import ElevationProfile from '../components/cardio/ElevationProfile'
import CardioShareCard from '../components/cardio/CardioShareCard'

// Leaflet + RouteMap is ~150kb gzipped — split into its own chunk
const RouteMap = lazy(() => import('../components/cardio/RouteMap'))

export default function CardioSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, userId } = useAuthState()
  const referralCode = user?.referral_code || null

  const {
    session, authorName: loadedAuthorName, authorAvatarUrl, loading, error: loadFailed, isOwn,
  } = useCardioSessionDetail(id, userId)
  const authorName = loadedAuthorName ?? ''
  const error = loadFailed ? t('common.error', 'Error loading session') : null

  const trackQuality = useMemo(() => {
    if (!session || session.gps_points.length < 2) return null
    return assessTrackQuality(session.gps_points, session.distance_km)
  }, [session])

  // Extraído a variable: la dep era la expresión `!!session`, que ESLint no
  // puede comprobar estáticamente. Con la variable el efecto queda limpio y sin
  // disable — se emite una vez por sesión cargada, no en cada cambio. (#484)
  const sessionLoaded = !!session

  useEffect(() => {
    if (sessionLoaded && id) {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.cardioDetailViewed, {
        surface: 'cardio', source: 'cardio_detail', own: isOwn,
      })
    }
  }, [id, isOwn, sessionLoaded])

  const formattedDate = session?.started_at
    ? new Date(session.started_at.replace(' ', 'T')).toLocaleDateString(i18n.language, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex items-center justify-center">
        <div className="text-muted-foreground font-mono text-sm">{t('common.loading', 'Cargando...')}</div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center gap-4">
        <div className="text-muted-foreground font-mono text-sm">{error || t('cardio.sessionNotFound')}</div>
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          {t('common.back', 'Volver')}
        </button>
      </div>
    )
  }

  const shareUserName = isOwn
    ? (user?.display_name || user?.email?.split('@')[0] || undefined)
    : authorName || undefined

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 pb-24 space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10,3 5,8 10,13" />
        </svg>
        {t('common.back', 'Volver')}
      </button>

      {/* Author header */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0 overflow-hidden">
          {authorAvatarUrl ? (
            <img src={authorAvatarUrl} alt={authorName} className="size-full object-cover" />
          ) : (
            authorName[0]?.toUpperCase() || '?'
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {authorName || t('common.unknownUser')}
            {isOwn && <span className="ml-1.5 text-[10px] text-lime font-normal">({t('feed.you', 'Tú')})</span>}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono tracking-wide">
            <span>{t(`cardio.${session.activity_type}`, session.activity_type)}</span>
            <span>·</span>
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Route map */}
      {session.gps_points.length > 1 && (
        <Suspense fallback={<div className="rounded-xl bg-muted/50 animate-pulse" style={{ height: '260px' }} />}>
          <RouteMap
            points={session.gps_points}
            pointsVersion={session.gps_points.length}
            height="260px"
            activityType={session.activity_type}
          />
        </Suspense>
      )}

      {/* Elevation profile */}
      {session.gps_points.length > 2 && (
        <ElevationProfile points={session.gps_points} height={80} />
      )}

      {/* Stats: track quality · primary · secondary · splits */}
      <CardioSessionStatsPanel
        activityType={session.activity_type}
        distanceKm={session.distance_km}
        durationSeconds={session.duration_seconds}
        avgPace={session.avg_pace}
        avgSpeedKmh={session.avg_speed_kmh}
        maxPace={session.max_pace}
        maxSpeedKmh={session.max_speed_kmh}
        caloriesBurned={session.calories_burned}
        elevationGain={session.elevation_gain}
        splits={session.splits}
        trackQuality={trackQuality}
      />

      {/* Note (read-only) */}
      {session.note && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">{t('cardio.notesOptional')}</div>
          <div className="px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-sm italic text-muted-foreground">
            "{session.note}"
          </div>
        </div>
      )}

      {/* Share card */}
      <CardioShareCard
        session={session}
        referralCode={isOwn ? referralCode : undefined}
        userName={shareUserName}
      />
    </div>
  )
}
