import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDiscoverRaces } from '@calistenia/core/hooks/useDiscoverRaces'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'

/** Cuántas carreras se listan en línea antes de mandar a /races/discover. */
const MAX_INLINE = 5

/**
 * Búsqueda de competencias activas (públicas, en `waiting` o `countdown`) desde
 * la propia vista de cardio. La pantalla completa con geolocalización y radio
 * sigue viviendo en /races/discover; aquí solo va el buscador por nombre.
 */
export default function ActiveRacesPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  // La queryKey de useDiscoverRaces incluye `search`: sin debounce se dispara
  // una consulta por pulsación.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(id)
  }, [search])

  const { races, loading, error } = useDiscoverRaces({ search: debounced })
  const shown = races.slice(0, MAX_INLINE)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">{t('race.activeTitle')}</div>
        <button
          onClick={() => navigate('/races/discover')}
          className="text-[10px] font-mono tracking-widest text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {t('race.seeAll').toUpperCase()}
        </button>
      </div>

      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('race.searchPlaceholder')}
        className="h-10 text-sm bg-muted/40 border-border"
      />

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading && shown.length === 0 && (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && shown.length === 0 && (
        <p className="text-xs text-muted-foreground py-3">
          {debounced ? t('race.noPublicRaces') : t('race.createAndShare')}
        </p>
      )}

      <div className="space-y-2">
        {shown.map(r => (
          <button
            key={r.id}
            onClick={() => navigate(`/race/${r.id}`)}
            className={cn(
              'w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-muted/30',
              'hover:border-lime/30 hover:bg-lime/5 transition-colors',
            )}
          >
            <span className="text-xl shrink-0">{CARDIO_ACTIVITY[r.activity_type]?.icon ?? '🏁'}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.name}</div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-muted-foreground">
                {r.mode === 'distance' && r.target_distance_km > 0 && (
                  <span>{r.target_distance_km} km</span>
                )}
                {r.mode === 'time' && r.target_duration_seconds > 0 && (
                  <span>{Math.round(r.target_duration_seconds / 60)} min</span>
                )}
                <span className={r.status === 'countdown' ? 'text-amber-400' : 'text-lime'}>
                  ● {t(r.status === 'countdown' ? 'race.startingSoon' : 'race.waitingLabel').toUpperCase()}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {races.length > MAX_INLINE && (
        <button
          onClick={() => navigate('/races/discover')}
          className="w-full text-center text-[10px] font-mono tracking-widest text-muted-foreground hover:text-foreground py-1"
        >
          {t('race.moreItems', { n: races.length - MAX_INLINE }).toUpperCase()}
        </button>
      )}
    </div>
  )
}
