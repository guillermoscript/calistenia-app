import { lazy, Suspense, useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pb, getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { formatDuration, formatPace, formatSpeed, assessTrackQuality } from '@calistenia/core/lib/geo'
import { op } from '@calistenia/core/lib/analytics'
import { useAuthState } from '../contexts/AuthContext'
import { cn } from '../lib/utils'
import SplitsTable from '../components/cardio/SplitsTable'
import ElevationProfile from '../components/cardio/ElevationProfile'
import CardioShareCard from '../components/cardio/CardioShareCard'
import type { CardioSession } from '@calistenia/core/types'

// Leaflet + RouteMap is ~150kb gzipped — split into its own chunk
const RouteMap = lazy(() => import('../components/cardio/RouteMap'))

export default function CardioSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, userId } = useAuthState()
  const referralCode = (user as any)?.referral_code || null

  const [session, setSession] = useState<CardioSession | null>(null)
  const [authorName, setAuthorName] = useState('')
  const [authorAvatarUrl, setAuthorAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    pb.collection('cardio_sessions')
      .getOne(id, { expand: 'user', $autoCancel: false })
      .then(record => {
        const s: CardioSession = {
          id: record.id,
          user: record.user,
          program: record.program,
          program_day_key: record.program_day_key,
          activity_type: record.activity_type,
          gps_points: Array.isArray(record.gps_points) ? record.gps_points : [],
          splits: Array.isArray(record.splits) ? record.splits : undefined,
          distance_km: record.distance_km,
          duration_seconds: record.duration_seconds,
          avg_pace: record.avg_pace,
          elevation_gain: record.elevation_gain,
          started_at: record.started_at,
          finished_at: record.finished_at,
          note: record.note,
          calories_burned: record.calories_burned,
          max_pace: record.max_pace,
          avg_speed_kmh: record.avg_speed_kmh,
          max_speed_kmh: record.max_speed_kmh,
        }
        setSession(s)
        const expandedUser = (record as any).expand?.user
        if (expandedUser) {
          setAuthorName(expandedUser.display_name || expandedUser.email?.split('@')[0] || '')
          setAuthorAvatarUrl(getUserAvatarUrl(expandedUser, '200x200'))
        }
      })
      .catch(() => setError(t('common.error', 'Error loading session')))
      .finally(() => setLoading(false))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isOwn = session?.user === userId

  const trackQuality = useMemo(() => {
    if (!session || session.gps_points.length < 2) return null
    return assessTrackQuality(session.gps_points, session.distance_km)
  }, [session])

  useEffect(() => {
    if (session && id) {
      op.track('cardio_detail_viewed', { own: isOwn })
    }
  }, [id, isOwn, !!session]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCycling = session?.activity_type === 'cycling'

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
        <div className="text-muted-foreground font-mono text-sm">{error || t('common.notFound', 'Sesión no encontrada')}</div>
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
    ? ((user as any)?.display_name || user?.email?.split('@')[0] || undefined)
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
            {authorName || t('common.unknown', 'Usuario')}
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

      {/* Track quality warning */}
      {trackQuality && trackQuality.grade !== 'good' && (
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono',
          trackQuality.grade === 'poor' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400',
        )}>
          <span>{trackQuality.grade === 'poor' ? '⚠' : 'ℹ'}</span>
          <span>
            {trackQuality.grade === 'poor'
              ? t('cardio.trackingIssues', 'GPS tracking had issues — distance is approximate')
              : t('cardio.estimatedDistance', '~{{km}} km estimated from {{gaps}} GPS gap(s)', { km: trackQuality.gapDistanceKm, gaps: trackQuality.gapCount })}
          </span>
        </div>
      )}

      {/* Primary stats: distance · duration · pace or speed */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-4 bg-muted/60 rounded-xl">
          <div className="font-bebas text-3xl text-lime tabular-nums">
            {trackQuality && trackQuality.grade !== 'good' ? '~' : ''}{session.distance_km.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">KM</div>
        </div>
        <div className="text-center p-4 bg-muted/60 rounded-xl">
          <div className="font-bebas text-3xl tabular-nums">{formatDuration(session.duration_seconds)}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.duration').toUpperCase()}</div>
        </div>
        {isCycling ? (
          <div className="text-center p-4 bg-muted/60 rounded-xl">
            <div className="font-bebas text-3xl text-sky-500 tabular-nums">{formatSpeed(session.avg_speed_kmh ?? 0)}</div>
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">KM/H</div>
          </div>
        ) : (
          <div className="text-center p-4 bg-muted/60 rounded-xl">
            <div className="font-bebas text-3xl text-sky-500 tabular-nums">{formatPace(session.avg_pace)}</div>
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.pace').toUpperCase()}</div>
          </div>
        )}
      </div>

      {/* Secondary stats: calories · elevation · max pace or speed */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-muted/40 rounded-xl">
          <div className="font-bebas text-2xl text-amber-400 tabular-nums">{session.calories_burned ?? 0}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('nutrition.calories').toUpperCase()}</div>
        </div>
        <div className="text-center p-3 bg-muted/40 rounded-xl">
          <div className="font-bebas text-2xl text-amber-400 tabular-nums">{session.elevation_gain ?? 0}m</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.elevation').toUpperCase()}</div>
        </div>
        <div className="text-center p-3 bg-muted/40 rounded-xl">
          {isCycling ? (
            <>
              <div className="font-bebas text-2xl text-pink-500 tabular-nums">{formatSpeed(session.max_speed_kmh ?? 0)}</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.maxSpeed').toUpperCase()}</div>
            </>
          ) : (
            <>
              <div className="font-bebas text-2xl text-pink-500 tabular-nums">{formatPace(session.max_pace ?? 0)}</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.maxPace').toUpperCase()}</div>
            </>
          )}
        </div>
      </div>

      {/* Splits table */}
      {session.splits && session.splits.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">{t('cardio.splits')}</div>
          <SplitsTable splits={session.splits} />
        </div>
      )}

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
