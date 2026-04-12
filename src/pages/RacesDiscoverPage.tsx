import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Loader } from '../components/ui/loader'
import { useDiscoverRaces } from '../hooks/useDiscoverRaces'
import { cn } from '../lib/utils'

const ACTIVITY_EMOJI: Record<string, string> = {
  running: '🏃',
  walking: '🚶',
  cycling: '🚴',
}

export default function RacesDiscoverPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [radiusKm, setRadiusKm] = useState(50)

  const { races, loading, error } = useDiscoverRaces({
    search,
    nearLat: coords?.lat ?? null,
    nearLng: coords?.lng ?? null,
    radiusKm,
  })

  // Try to get location on mount (one-shot)
  useEffect(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
    )
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-24">
      <div>
        <h1 className="font-bebas text-4xl md:text-5xl leading-none tracking-wide">{t('race.nearbyTitle').toUpperCase()}</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono tracking-wide">
          {t('race.nearbySubtitle')}
        </p>
      </div>

      <div className="space-y-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('race.searchPlaceholder')}
          className="bg-muted/40 border-border"
        />
        <div className="flex items-center gap-2">
          {coords ? (
            <div className="flex-1 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <span className="size-2 rounded-full bg-lime animate-pulse" />
              <span>{t('race.locationOk').toUpperCase()}</span>
              <button
                onClick={() => setCoords(null)}
                className="ml-auto text-[9px] underline hover:text-foreground"
              >
                {t('race.removeLocation')}
              </button>
            </div>
          ) : (
            <Button
              onClick={() => {
                if (!navigator.geolocation) return
                setLocating(true)
                navigator.geolocation.getCurrentPosition(
                  pos => {
                    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                    setLocating(false)
                  },
                  () => setLocating(false),
                  { enableHighAccuracy: true, timeout: 8000 },
                )
              }}
              disabled={locating}
              variant="outline"
              className="flex-1 h-9 text-xs font-mono tracking-widest border-border"
            >
              {(locating ? t('race.locating') : t('race.useLocation')).toUpperCase()}
            </Button>
          )}
          {coords && (
            <select
              value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))}
              className="h-9 px-2 text-[10px] font-mono bg-muted/40 border border-border rounded"
            >
              <option value={5}>5 km</option>
              <option value={10}>10 km</option>
              <option value={25}>25 km</option>
              <option value={50}>50 km</option>
              <option value={100}>100 km</option>
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10"><Loader /></div>
      )}

      {!loading && races.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-2">🔍</div>
          <p className="text-sm">{t('race.noPublicRaces')} {coords ? t('race.nearHint') : ''}</p>
          <p className="text-[10px] font-mono mt-1">{t('race.createAndShare')}</p>
        </div>
      )}

      <div className="space-y-2">
        {races.map(r => (
          <button
            key={r.id}
            onClick={() => navigate(`/race/${r.id}`)}
            className={cn(
              'w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30',
              'hover:border-lime/30 hover:bg-lime/5 transition-colors',
            )}
          >
            <div className="size-12 rounded-lg bg-muted flex items-center justify-center text-2xl">
              {ACTIVITY_EMOJI[r.activity_type] ?? '🏃'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bebas text-xl tracking-wide truncate">{r.name}</div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-muted-foreground">
                {r.mode === 'distance' && r.target_distance_km > 0 && (
                  <span>{r.target_distance_km} km</span>
                )}
                {r.mode === 'time' && r.target_duration_seconds > 0 && (
                  <span>{Math.round(r.target_duration_seconds / 60)} min</span>
                )}
                {r.status === 'countdown' && (
                  <span className="text-amber-400">● {t('race.startingSoon').toUpperCase()}</span>
                )}
                {r.status === 'waiting' && (
                  <span className="text-lime">● {t('race.waitingLabel').toUpperCase()}</span>
                )}
              </div>
            </div>
            {r.distanceKm != null && (
              <div className="text-right">
                <div className="font-bebas text-lg tabular-nums text-lime">{r.distanceKm.toFixed(1)}</div>
                <div className="text-[9px] font-mono text-muted-foreground">KM</div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
