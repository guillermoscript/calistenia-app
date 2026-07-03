/** Historial de insights cross-métrica — "Tus semanas", web Dashboard (épica #128 Fase 3, issue #132). */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import {
  useInsightHistory,
  type InsightPeriodType,
  type CrossInsight,
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

/** "3 jul" (semanal) / "julio 2026" (mensual) — fallback al string crudo si la fecha no parsea. */
function formatPeriodDate(periodStart: string, periodType: InsightPeriodType, locale: string): string {
  const d = new Date(`${periodStart}T00:00:00`)
  if (Number.isNaN(d.getTime())) return periodStart
  if (periodType === 'monthly') {
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

/** Una semana/mes del historial — cabecera siempre visible, detalle en acordeón CSS. */
function HistoryRow({ insight, periodType }: { insight: CrossInsight; periodType: InsightPeriodType }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const p = insight.payload
  const hasDetails =
    p.correlations.length > 0 || p.wins.length > 0 || p.watchouts.length > 0 || !!p.suggestion

  return (
    <div className="border-t border-border first:border-t-0 pt-3 first:pt-0">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        disabled={!hasDetails}
        className={cn(
          'w-full text-left flex items-start justify-between gap-3',
          !hasDetails && 'cursor-default',
        )}
      >
        <div className="min-w-0">
          <div className="font-bebas text-lg leading-none text-foreground truncate">{p.headline}</div>
          <div className="font-mono text-[10px] text-muted-foreground mt-1">
            {p.period || formatPeriodDate(insight.periodStart, periodType, i18n.language)}
          </div>
        </div>
        {hasDetails && (
          <svg
            className={cn(
              'size-4 text-muted-foreground shrink-0 mt-1 transition-transform',
              open && 'rotate-180',
            )}
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <polyline points="4,6 8,10 12,6" />
          </svg>
        )}
      </button>

      {hasDetails && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div
              className={cn(
                'space-y-3 pt-3 transition-opacity duration-300',
                open ? 'opacity-100' : 'opacity-0',
              )}
            >
              {p.correlations.map((c, i) => (
                <div key={i} className="space-y-1.5">
                  <p
                    className={cn(
                      'text-sm',
                      c.strength === 'weak' ? 'text-muted-foreground/80' : 'text-foreground',
                    )}
                  >
                    {c.observation}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.metrics.map((m, j) => (
                      <span
                        key={j}
                        className="text-[9px] uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5"
                      >
                        {m}
                      </span>
                    ))}
                    <span className={cn('text-[10px]', STRENGTH_COLOR[c.strength])}>
                      {STRENGTH_LABEL[c.strength]}
                    </span>
                  </div>
                </div>
              ))}

              {p.wins.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                    {t('insights.card.wins', 'LOGROS')}
                  </div>
                  {p.wins.map((w, i) => (
                    <p key={i} className="text-sm text-foreground">✓ {w}</p>
                  ))}
                </div>
              )}

              {p.watchouts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                    {t('insights.card.watch', 'A VIGILAR')}
                  </div>
                  {p.watchouts.map((w, i) => (
                    <p key={i} className="text-sm text-foreground">• {w}</p>
                  ))}
                </div>
              )}

              {!!p.suggestion && (
                <div className="border-t border-border pt-3">
                  <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
                    {t('insights.card.tip', 'SUGERENCIA')}
                  </div>
                  <p className="text-sm font-medium text-foreground">{p.suggestion}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface InsightsHistoryProps {
  userId: string | null
}

export default function InsightsHistory({ userId }: InsightsHistoryProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [periodType, setPeriodType] = useState<InsightPeriodType>('weekly')
  // Solo se consulta una vez expandido — evita una llamada de red que nadie ve.
  const { data: history, isLoading, isError } = useInsightHistory(expanded ? userId : null, periodType)

  if (!userId) return null

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
        {t('insights.history.title', 'Tus semanas')}
      </div>

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('insights.card.history', 'Ver historial')}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPeriodType('weekly')}
              className={cn(
                'text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors',
                periodType === 'weekly'
                  ? 'border-lime text-lime'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {t('insights.history.weekly', 'Semanal')}
            </button>
            <button
              type="button"
              onClick={() => setPeriodType('monthly')}
              className={cn(
                'text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors',
                periodType === 'monthly'
                  ? 'border-lime text-lime'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {t('insights.history.monthly', 'Mensual')}
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-5 w-2/3 bg-muted rounded" />
              <div className="h-3 w-1/3 bg-muted rounded" />
              <div className="h-5 w-1/2 bg-muted rounded mt-3" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {t('insights.history.error', 'No se pudo cargar tu historial.')}
            </p>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('insights.history.empty', 'Aún no tienes resúmenes todavía')}
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((insight) => (
                <HistoryRow key={insight.id ?? insight.periodStart} insight={insight} periodType={periodType} />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('insights.card.seeLess', 'Ver menos')}
          </button>
        </div>
      )}
    </div>
  )
}
