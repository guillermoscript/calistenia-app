/** Sleep-only pattern summary card — web SleepPage section (issue #244, Fase 5). */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import {
  useSleepInsight,
  MIN_SLEEP_INSIGHT_DAYS,
  type SleepInsightPayload,
} from '@calistenia/core/hooks/useSleepInsight'

type Trend = SleepInsightPayload['trend']

const TREND_CONFIG: Record<Trend, { icon: string; color: string; key: string; fallback: string }> = {
  improving: { icon: '↑', color: 'text-lime', key: 'sleep.insight.trend.improving', fallback: 'Mejorando' },
  stable: { icon: '→', color: 'text-muted-foreground', key: 'sleep.insight.trend.stable', fallback: 'Estable' },
  declining: { icon: '↓', color: 'text-amber-400', key: 'sleep.insight.trend.declining', fallback: 'Bajando' },
}

const CONSISTENCY_CONFIG: Record<
  SleepInsightPayload['bedtimeConsistency'],
  { color: string; key: string; fallback: string }
> = {
  consistent: { color: 'text-lime', key: 'sleep.insight.bedtimeConsistency.consistent', fallback: 'Consistente' },
  variable: { color: 'text-amber-400', key: 'sleep.insight.bedtimeConsistency.variable', fallback: 'Variable' },
  irregular: { color: 'text-destructive', key: 'sleep.insight.bedtimeConsistency.irregular', fallback: 'Irregular' },
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

/** "hace 2h" / "ayer" / "hace 3d" — mismo idioma que InsightsCard cross-métrica. */
function relativeTime(iso?: string): string {
  if (!iso) return ''
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60))
  if (hours < 1) return 'ahora'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'ayer' : `hace ${days}d`
}

function GenerateButton({
  isGenerating,
  onClick,
  label,
}: {
  isGenerating: boolean
  onClick: () => void
  label: string
}) {
  const { t } = useTranslation()
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={isGenerating}
      className="bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-bebas tracking-widest h-9 px-4"
    >
      {isGenerating && (
        <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {isGenerating ? t('sleep.insight.generating', 'Generando…') : label}
    </Button>
  )
}

/** Disclaimer siempre visible — correlación ≠ causa. */
function Disclaimer() {
  const { t } = useTranslation()
  return (
    <p className="text-[10px] tracking-wide text-muted-foreground">
      {t('sleep.insight.disclaimer', 'Patrones observados, no causas ni consejo médico.')}
    </p>
  )
}

interface SleepInsightsCardProps {
  userId: string | null
}

export default function SleepInsightsCard({ userId }: SleepInsightsCardProps) {
  const { t } = useTranslation()
  const [triedOnce, setTriedOnce] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { insight, isLoading, isGenerating, generate, needsMoreData } = useSleepInsight(userId, 'weekly')

  const onGenerate = useCallback(async () => {
    setTriedOnce(true)
    await generate()
  }, [generate])

  if (!userId) return null

  const failed = triedOnce && !isGenerating && !insight && !needsMoreData
  const hasMore = !!insight && (insight.payload.patterns.length > 0 || !!insight.payload.suggestion)

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
        {t('sleep.insight.kicker', 'TU SUEÑO')}
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-6 w-2/3 bg-muted rounded" />
          <div className="h-3 w-1/3 bg-muted rounded" />
          <div className="h-3 w-1/2 bg-muted rounded" />
        </div>
      ) : insight ? (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="font-bebas text-2xl md:text-3xl leading-none text-foreground">
                {insight.payload.headline}
              </div>
              <span
                className={cn(
                  'flex items-center gap-1 shrink-0 text-[10px] uppercase tracking-wide',
                  TREND_CONFIG[insight.payload.trend].color,
                )}
              >
                <span aria-hidden="true" className="text-sm leading-none">
                  {TREND_CONFIG[insight.payload.trend].icon}
                </span>
                {t(TREND_CONFIG[insight.payload.trend].key, TREND_CONFIG[insight.payload.trend].fallback)}
              </span>
            </div>
            {!!insight.generatedAt && (
              <div className="mt-1.5 text-[10px] text-muted-foreground">{relativeTime(insight.generatedAt)}</div>
            )}
          </div>

          {/* Stats: duración/calidad/consistencia */}
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
            <div className="text-center">
              <div className="font-bebas text-lg leading-none text-foreground">
                {formatDuration(insight.payload.avgDurationMin)}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground mt-1">
                {t('sleep.insight.avgDuration', 'Duración media')}
              </div>
            </div>
            <div className="text-center">
              <div className="font-bebas text-lg leading-none text-foreground">
                {insight.payload.avgQuality.toFixed(1)} / 5
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground mt-1">
                {t('sleep.insight.avgQuality', 'Calidad media')}
              </div>
            </div>
            <div className="text-center">
              <div className={cn('font-bebas text-lg leading-none', CONSISTENCY_CONFIG[insight.payload.bedtimeConsistency].color)}>
                {t(
                  CONSISTENCY_CONFIG[insight.payload.bedtimeConsistency].key,
                  CONSISTENCY_CONFIG[insight.payload.bedtimeConsistency].fallback,
                )}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground mt-1">
                {t('sleep.insight.bedtimeConsistencyLabel', 'Consistencia horario')}
              </div>
            </div>
          </div>

          {/* Colapsado: disclaimer + "ver más" */}
          {!expanded && hasMore && (
            <div className="space-y-3 border-t border-border pt-3">
              <Disclaimer />
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('sleep.insight.seeMore', 'Ver más')}
              </button>
            </div>
          )}

          {/* Expandido: patrones + sugerencia. Transición CSS pura, sin librerías. */}
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-300 ease-out',
              expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
              <div
                className={cn(
                  'space-y-4 border-t border-border pt-3 transition-opacity duration-300',
                  expanded ? 'opacity-100' : 'opacity-0',
                )}
              >
                {insight.payload.patterns.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                      {t('sleep.insight.patterns', 'PATRONES')}
                    </div>
                    {insight.payload.patterns.map((p, i) => (
                      <p key={i} className="text-sm text-foreground">• {p}</p>
                    ))}
                  </div>
                )}

                {hasMore && <Disclaimer />}

                {!!insight.payload.suggestion && (
                  <div className="border-t border-border pt-3">
                    <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
                      {t('sleep.insight.suggestion', 'SUGERENCIA')}
                    </div>
                    <p className="text-sm font-medium text-foreground">{insight.payload.suggestion}</p>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('sleep.insight.seeLess', 'Ver menos')}
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onGenerate}
                    disabled={isGenerating}
                    className="text-[10px] tracking-widest h-8 hover:border-indigo-400 hover:text-indigo-400"
                  >
                    {isGenerating ? t('sleep.insight.generating', 'Generando…') : t('sleep.insight.refresh', 'Actualizar')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : needsMoreData ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('sleep.insight.needsMoreData', 'Sigue registrando — necesitas al menos {{n}} noches con datos.', {
              n: MIN_SLEEP_INSIGHT_DAYS,
            })}
          </p>
          <GenerateButton
            isGenerating={isGenerating}
            onClick={onGenerate}
            label={t('sleep.insight.generate', 'Generar resumen')}
          />
        </div>
      ) : failed ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{t('sleep.insight.failed', 'No se pudo generar. Reintenta.')}</p>
          <GenerateButton
            isGenerating={isGenerating}
            onClick={onGenerate}
            label={t('sleep.insight.generate', 'Generar resumen')}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="font-bebas text-2xl leading-none text-foreground">
            {t('sleep.insight.empty', 'Descubre tus patrones de sueño')}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('sleep.insight.emptyBody', 'Duración, calidad, consistencia y más de tu semana.')}
          </p>
          <GenerateButton
            isGenerating={isGenerating}
            onClick={onGenerate}
            label={t('sleep.insight.generate', 'Generar resumen')}
          />
        </div>
      )}
    </div>
  )
}
