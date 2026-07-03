/** Cross-metric weekly insight card — web Dashboard section (épica #128 Fase 2, issues #131/#133). */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import {
  useCrossInsights,
  MIN_INSIGHT_DAYS,
  type CrossInsightCorrelation,
} from '@calistenia/core/hooks/useCrossInsights'

const STRENGTH_LABEL: Record<CrossInsightCorrelation['strength'], string> = {
  weak: '●',
  moderate: '●●',
  strong: '●●●',
}

const STRENGTH_COLOR: Record<CrossInsightCorrelation['strength'], string> = {
  weak: 'text-muted-foreground',
  moderate: 'text-amber-400',
  strong: 'text-lime',
}

// El backend aún no declara `lag` en el tipo compartido — se lee de forma
// opcional y defensiva (issue #133, punto opcional 6).
type Correlation = CrossInsightCorrelation & { lag?: string }

// Fuerte primero: rankeo para ordenar de la señal más clara a la más tenue.
const STRENGTH_RANK: Record<CrossInsightCorrelation['strength'], number> = {
  strong: 0,
  moderate: 1,
  weak: 2,
}

/** Copia ordenada por fuerza (desc), estable — nunca muta el payload original. */
function sortByStrength(list: CrossInsightCorrelation[]): Correlation[] {
  return list
    .map((c, index) => ({ c, index }))
    .sort((a, b) => STRENGTH_RANK[a.c.strength] - STRENGTH_RANK[b.c.strength] || a.index - b.index)
    .map(({ c }) => c)
}

/** "hace 2h" / "ayer" / "hace 3d" — sin deps nuevas, granularidad de horas/días. */
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
      className="bg-lime hover:bg-lime/90 text-lime-foreground text-[10px] font-bebas tracking-widest h-9 px-4"
    >
      {isGenerating && (
        <span className="size-3 border-2 border-lime-foreground/30 border-t-lime-foreground rounded-full animate-spin" />
      )}
      {isGenerating ? t('insights.card.generating', 'Generando…') : label}
    </Button>
  )
}

/** Disclaimer siempre visible (colapsado y expandido) — correlación ≠ causa. */
function Disclaimer() {
  const { t } = useTranslation()
  return (
    <p className="text-[10px] tracking-wide text-muted-foreground">
      {t('insights.card.disclaimer', 'Patrones observados, no causas ni consejo médico.')}
    </p>
  )
}

/** Una fila de correlación. Las `weak` se atenúan — nunca se presentan como una certeza. */
function CorrelationRow({ c }: { c: Correlation }) {
  const { t } = useTranslation()
  const isWeak = c.strength === 'weak'
  return (
    <div className="space-y-1.5">
      <p className={cn('text-sm', isWeak ? 'text-muted-foreground/80' : 'text-foreground')}>{c.observation}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {c.metrics.map((m, j) => (
          <span
            key={j}
            className="text-[9px] uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5"
          >
            {m}
          </span>
        ))}
        <span className={cn('text-[10px]', STRENGTH_COLOR[c.strength])}>{STRENGTH_LABEL[c.strength]}</span>
        {c.lag === 'next_day' && (
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {t('insights.card.nextDay', 'día sig.')}
          </span>
        )}
      </div>
    </div>
  )
}

interface InsightsCardProps {
  userId: string | null
}

export default function InsightsCard({ userId }: InsightsCardProps) {
  const { t } = useTranslation()
  const [triedOnce, setTriedOnce] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { insight, isLoading, isGenerating, generate, needsMoreData } = useCrossInsights(userId, 'weekly')

  const onGenerate = useCallback(async () => {
    setTriedOnce(true)
    await generate()
  }, [generate])

  if (!userId) return null

  const failed = triedOnce && !isGenerating && !insight && !needsMoreData

  const sortedCorrelations = insight ? sortByStrength(insight.payload.correlations) : []
  const strongest = sortedCorrelations[0]
  const primaryCorrelations = sortedCorrelations.filter((c) => c.strength !== 'weak')
  const weakCorrelations = sortedCorrelations.filter((c) => c.strength === 'weak')
  const hasMore =
    !!insight &&
    (sortedCorrelations.length > 0 ||
      insight.payload.wins.length > 0 ||
      insight.payload.watchouts.length > 0 ||
      !!insight.payload.suggestion)

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
        {t('insights.card.kicker', 'TU SEMANA')}
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
            <div className="font-bebas text-2xl md:text-3xl leading-none text-foreground">
              {insight.payload.headline}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
              {!!insight.payload.period && <span>{insight.payload.period}</span>}
              {!!insight.payload.period && !!insight.generatedAt && <span>·</span>}
              {!!insight.generatedAt && <span>{relativeTime(insight.generatedAt)}</span>}
            </div>
          </div>

          {/* Colapsado: solo la correlación más fuerte + disclaimer + "ver más" */}
          {!expanded && hasMore && (
            <div className="space-y-3 border-t border-border pt-3">
              {strongest && <CorrelationRow c={strongest} />}
              <Disclaimer />
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('insights.card.seeMore', 'Ver más')}
              </button>
            </div>
          )}

          {/* Expandido: todas las correlaciones (atenuando las débiles) + logros + a vigilar + sugerencia.
              Transición CSS pura (grid-template-rows 0fr → 1fr) — sin librerías. */}
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
                {primaryCorrelations.length > 0 && (
                  <div className="space-y-3">
                    {primaryCorrelations.map((c, i) => (
                      <CorrelationRow key={i} c={c} />
                    ))}
                  </div>
                )}

                {weakCorrelations.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                      {t('insights.card.maybe', 'POSIBLES PATRONES')}
                    </div>
                    <div className="space-y-3">
                      {weakCorrelations.map((c, i) => (
                        <CorrelationRow key={i} c={c} />
                      ))}
                    </div>
                  </div>
                )}

                {hasMore && <Disclaimer />}

                {insight.payload.wins.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                      {t('insights.card.wins', 'LOGROS')}
                    </div>
                    {insight.payload.wins.map((w, i) => (
                      <p key={i} className="text-sm text-foreground">✓ {w}</p>
                    ))}
                  </div>
                )}

                {insight.payload.watchouts.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                      {t('insights.card.watch', 'A VIGILAR')}
                    </div>
                    {insight.payload.watchouts.map((w, i) => (
                      <p key={i} className="text-sm text-foreground">• {w}</p>
                    ))}
                  </div>
                )}

                {!!insight.payload.suggestion && (
                  <div className="border-t border-border pt-3">
                    <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
                      {t('insights.card.tip', 'SUGERENCIA')}
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
                    {t('insights.card.seeLess', 'Ver menos')}
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onGenerate}
                    disabled={isGenerating}
                    className="text-[10px] tracking-widest h-8 hover:border-lime hover:text-lime"
                  >
                    {isGenerating ? t('insights.card.generating', 'Generando…') : t('insights.card.refresh', 'Actualizar')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : needsMoreData ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('insights.card.needMore', 'Sigue registrando — necesitas al menos {{n}} días con datos.', {
              n: MIN_INSIGHT_DAYS,
            })}
          </p>
          <GenerateButton
            isGenerating={isGenerating}
            onClick={onGenerate}
            label={t('insights.card.generate', 'Generar mi resumen')}
          />
        </div>
      ) : failed ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{t('insights.card.error', 'No se pudo generar. Reintenta.')}</p>
          <GenerateButton
            isGenerating={isGenerating}
            onClick={onGenerate}
            label={t('insights.card.generate', 'Generar mi resumen')}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="font-bebas text-2xl leading-none text-foreground">
            {t('insights.card.emptyTitle', 'Descubre tus patrones')}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('insights.card.emptyBody', 'Cruza sueño, entrenos, nutrición y más de tu semana.')}
          </p>
          <GenerateButton
            isGenerating={isGenerating}
            onClick={onGenerate}
            label={t('insights.card.generate', 'Generar mi resumen')}
          />
        </div>
      )}
    </div>
  )
}
