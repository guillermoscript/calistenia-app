import { useTranslation } from 'react-i18next'
import { formatDuration, formatPace, formatSpeed } from '@calistenia/core/lib/geo'
import type { TrackQuality } from '@calistenia/core/lib/geo'
import SplitsTable from './SplitsTable'
import { cn } from '../../lib/utils'
import type { CardioActivityType, KmSplit } from '@calistenia/core/types'

interface CardioSessionStatsPanelProps {
  activityType: CardioActivityType
  distanceKm: number
  durationSeconds: number
  avgPace: number
  avgSpeedKmh?: number
  maxPace?: number
  maxSpeedKmh?: number
  caloriesBurned?: number
  elevationGain?: number
  splits?: KmSplit[]
  /** `null` cuando no hay ruta suficiente para evaluarla; entonces no se avisa de nada. */
  trackQuality?: TrackQuality | null
}

/**
 * Resumen de una sesión de cardio ya terminada: aviso de calidad de la traza,
 * rejilla de stats principales, rejilla secundaria y tabla de parciales.
 *
 * Sale de #531 (restos del #479). Lo pintaban por duplicado la pantalla de
 * sesión (justo al terminar, sobre lo que aún vive en el contexto) y la de
 * detalle (sobre el registro ya guardado). Las dos resuelven sus valores de
 * sitios distintos, así que el panel recibe primitivas ya resueltas en vez de
 * una `CardioSession`: es lo único que tienen en común de verdad.
 */
export default function CardioSessionStatsPanel({
  activityType,
  distanceKm,
  durationSeconds,
  avgPace,
  avgSpeedKmh,
  maxPace,
  maxSpeedKmh,
  caloriesBurned,
  elevationGain,
  splits,
  trackQuality,
}: CardioSessionStatsPanelProps) {
  const { t } = useTranslation()
  const isCycling = activityType === 'cycling'

  return (
    <>
      {/* Track quality warning */}
      {trackQuality && trackQuality.grade !== 'good' && (
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono',
          trackQuality.grade === 'poor' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400',
        )}>
          <span>{trackQuality.grade === 'poor' ? '⚠' : 'ℹ'}</span>
          <span>
            {trackQuality.grade === 'poor'
              ? t('cardio.trackingIssues')
              : t('cardio.estimatedDistance', { km: trackQuality.gapDistanceKm, gaps: trackQuality.gapCount })}
          </span>
        </div>
      )}

      {/* Primary stats: distance · duration · pace or speed */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-4 bg-muted/60 rounded-xl">
          <div className="font-bebas text-3xl text-lime tabular-nums">
            {trackQuality && trackQuality.grade !== 'good' ? '~' : ''}{distanceKm.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">KM</div>
        </div>
        <div className="text-center p-4 bg-muted/60 rounded-xl">
          <div className="font-bebas text-3xl tabular-nums">{formatDuration(durationSeconds)}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.duration').toUpperCase()}</div>
        </div>
        {isCycling ? (
          <div className="text-center p-4 bg-muted/60 rounded-xl">
            <div className="font-bebas text-3xl text-sky-500 tabular-nums">{formatSpeed(avgSpeedKmh ?? 0)}</div>
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">KM/H</div>
          </div>
        ) : (
          <div className="text-center p-4 bg-muted/60 rounded-xl">
            <div className="font-bebas text-3xl text-sky-500 tabular-nums">{formatPace(avgPace)}</div>
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.pace').toUpperCase()}</div>
          </div>
        )}
      </div>

      {/* Secondary stats: calories · elevation · max pace or speed */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-muted/40 rounded-xl">
          <div className="font-bebas text-2xl text-amber-400 tabular-nums">{caloriesBurned ?? 0}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('nutrition.calories').toUpperCase()}</div>
        </div>
        <div className="text-center p-3 bg-muted/40 rounded-xl">
          <div className="font-bebas text-2xl text-amber-400 tabular-nums">{elevationGain ?? 0}m</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.elevation').toUpperCase()}</div>
        </div>
        <div className="text-center p-3 bg-muted/40 rounded-xl">
          {isCycling ? (
            <>
              <div className="font-bebas text-2xl text-pink-500 tabular-nums">{formatSpeed(maxSpeedKmh ?? 0)}</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.maxSpeed').toUpperCase()}</div>
            </>
          ) : (
            <>
              <div className="font-bebas text-2xl text-pink-500 tabular-nums">{formatPace(maxPace ?? 0)}</div>
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-1">{t('cardio.maxPace').toUpperCase()}</div>
            </>
          )}
        </div>
      </div>

      {/* Splits table */}
      {splits && splits.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">{t('cardio.splits')}</div>
          <SplitsTable splits={splits} />
        </div>
      )}
    </>
  )
}
