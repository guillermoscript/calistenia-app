import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDuration, formatPace, formatSpeed } from '@calistenia/core/lib/geo'
import { useTranslation } from 'react-i18next'
import i18n from '../../lib/i18n'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { cn } from '../../lib/utils'
import type { CardioActivityType, CardioSession } from '@calistenia/core/types'

/** Pestañas del historial: «todas» + un filtro por cada tipo de actividad. */
type HistoryFilter = 'all' | CardioActivityType
const FILTERS: HistoryFilter[] = ['all', 'running', 'walking', 'cycling']

interface CardioHistoryProps {
  sessions: CardioSession[]
  loading?: boolean
  onDelete?: (id: string) => Promise<void>
  /** La carga falló. Manda sobre la lista vacía: sin esto un 504 se pintaba
      como «no tienes sesiones», que es mentira (#559, CALISTENIA-APP-S). */
  error?: boolean
  onRetry?: () => void
}

export default function CardioHistory({ sessions, loading, onDelete, error, onRetry }: CardioHistoryProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const visible = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter(s => s.activity_type === filter)),
    [sessions, filter],
  )

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  // Antes que el vacío: no sabemos si hay sesiones, sólo que no pudimos leerlas.
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-3" aria-hidden="true">📡</div>
        <p className="text-sm text-muted-foreground">{t('cardio.historyError')}</p>
        <p className="text-xs text-muted-foreground/60 mt-1 mb-4">{t('cardio.historyErrorBody')}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-lg border border-border px-4 py-2 text-[11px] font-mono uppercase tracking-widest text-foreground transition-colors hover:bg-muted"
          >
            {t('cardio.retry')}
          </button>
        )}
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-3">🗺️</div>
        <p className="text-sm text-muted-foreground">{t('cardio.noSessions')}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{t('cardio.startFirstSession')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Pestañas de filtro */}
      <div className="flex gap-1 rounded-xl bg-muted/50 p-1" role="radiogroup" aria-label={t('cardio.history')}>
        {FILTERS.map(f => {
          const active = filter === f
          const label = f === 'all' ? t('cardio.filterAll') : t(`cardio.${f}`)
          return (
            <button
              key={f}
              role="radio"
              aria-checked={active}
              onClick={() => setFilter(f)}
              className={cn(
                'flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-mono uppercase tracking-widest transition-colors',
                active ? 'bg-background border border-lime/30 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f !== 'all' && <span aria-hidden="true">{CARDIO_ACTIVITY[f]?.icon}</span>}
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-muted-foreground">{t('cardio.noSessionsOfType')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(session => {
            const sessionKey = session.id ?? session.started_at
            const isCycling = session.activity_type === 'cycling'
            const activity = CARDIO_ACTIVITY[session.activity_type]
            return (
              <div key={sessionKey} className="flex items-stretch rounded-xl border border-border bg-muted/30 overflow-hidden">
                {/* La fila abre el detalle (/cardio/session/:id): mapa, elevación,
                    splits y compartir viven allí y no se duplican aquí. */}
                <button
                  onClick={() => { if (session.id) navigate(`/cardio/session/${session.id}`) }}
                  disabled={!session.id}
                  className="flex-1 min-w-0 text-left p-4 hover:bg-muted/50 transition-colors disabled:cursor-default"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{activity?.icon || '🏃'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {t(`cardio.${session.activity_type}`)}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {new Date(session.started_at).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <div className="flex gap-3 sm:gap-4 text-right shrink-0">
                      <div>
                        <div className="text-sm font-bebas text-lime tabular-nums">{session.distance_km.toFixed(2)} km</div>
                        <div className="text-[9px] text-muted-foreground">{t('cardio.distance')}</div>
                      </div>
                      <div>
                        <div className="text-sm font-bebas text-foreground tabular-nums">{formatDuration(session.duration_seconds)}</div>
                        <div className="text-[9px] text-muted-foreground">{t('cardio.duration')}</div>
                      </div>
                      <div>
                        {isCycling ? (
                          <>
                            <div className="text-sm font-bebas text-sky-500 tabular-nums">{formatSpeed(session.avg_speed_kmh || 0)}</div>
                            <div className="text-[9px] text-muted-foreground">km/h</div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bebas text-sky-500 tabular-nums">{formatPace(session.avg_pace)}</div>
                            <div className="text-[9px] text-muted-foreground">{t('cardio.pace')}</div>
                          </>
                        )}
                      </div>
                    </div>
                    <svg
                      className="size-4 text-muted-foreground shrink-0"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {onDelete && session.id && (
                  <button
                    onClick={() => setDeleteConfirmId(session.id!)}
                    aria-label={t('cardio.deleteSession')}
                    title={t('cardio.deleteSession')}
                    className="px-3 border-l border-border/50 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M6.67 7.33v4M9.33 7.33v4" />
                      <path d="M3.33 4h9.34l-.67 9.33a1.33 1.33 0 01-1.33 1.34H5.33A1.33 1.33 0 014 13.33L3.33 4z" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {onDelete && (
        <ConfirmDialog
          open={deleteConfirmId !== null}
          onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
          title={t('cardio.deleteSession')}
          description={t('cardio.deleteSessionConfirm')}
          confirmLabel={t('common.delete').toUpperCase()}
          cancelLabel={t('common.cancel').toUpperCase()}
          variant="destructive"
          onConfirm={async () => {
            if (deleteConfirmId) {
              await onDelete(deleteConfirmId)
              setDeleteConfirmId(null)
            }
          }}
        />
      )}
    </div>
  )
}
