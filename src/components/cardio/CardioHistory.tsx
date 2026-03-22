import { useState } from 'react'
import { formatDuration, formatPace, formatSpeed } from '../../lib/geo'
import { CARDIO_ACTIVITY } from '../../lib/style-tokens'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import RouteMap from './RouteMap'
import CardioShareCard from './CardioShareCard'
import ElevationProfile from './ElevationProfile'
import SplitsTable from './SplitsTable'
import type { CardioSession } from '../../types'

interface CardioHistoryProps {
  sessions: CardioSession[]
  loading?: boolean
  onDelete?: (id: string) => Promise<void>
}

export default function CardioHistory({ sessions, loading, onDelete }: CardioHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-3">🗺️</div>
        <p className="text-sm text-muted-foreground">No hay sesiones de cardio</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Selecciona una actividad e inicia tu primera sesión</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map(session => {
        const sessionKey = session.id ?? session.started_at
        const isExpanded = expanded === sessionKey
        const isCycling = session.activity_type === 'cycling'
        const activity = CARDIO_ACTIVITY[session.activity_type]
        return (
          <div key={sessionKey} className="rounded-xl border border-border bg-muted/30 overflow-hidden">
            {/* Collapsed row */}
            <button
              onClick={() => setExpanded(isExpanded ? null : sessionKey)}
              className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{activity?.icon || '🏃'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {activity?.label || session.activity_type}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(session.started_at).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4 text-right shrink-0">
                  <div>
                    <div className="text-sm font-bebas text-lime tabular-nums">{session.distance_km.toFixed(2)} km</div>
                    <div className="text-[9px] text-muted-foreground">Distancia</div>
                  </div>
                  <div>
                    <div className="text-sm font-bebas text-foreground tabular-nums">{formatDuration(session.duration_seconds)}</div>
                    <div className="text-[9px] text-muted-foreground">Duración</div>
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
                        <div className="text-[9px] text-muted-foreground">Ritmo</div>
                      </>
                    )}
                  </div>
                </div>
                {/* Expand chevron */}
                <svg
                  className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
                {/* Route map */}
                {session.gps_points.length > 0 && (
                  <RouteMap points={session.gps_points} height="220px" activityType={session.activity_type} />
                )}

                {/* Elevation profile */}
                {session.gps_points.length > 2 && (
                  <ElevationProfile points={session.gps_points} height={72} />
                )}

                {/* Primary stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-2xl text-lime tabular-nums">{session.distance_km.toFixed(2)}</div>
                    <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">KM</div>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-2xl tabular-nums">{formatDuration(session.duration_seconds)}</div>
                    <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">DURACIÓN</div>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg">
                    {isCycling ? (
                      <>
                        <div className="font-bebas text-2xl text-sky-500 tabular-nums">{formatSpeed(session.avg_speed_kmh || 0)}</div>
                        <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">KM/H</div>
                      </>
                    ) : (
                      <>
                        <div className="font-bebas text-2xl text-sky-500 tabular-nums">{formatPace(session.avg_pace)}</div>
                        <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">RITMO</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Secondary stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-lg text-amber-400 tabular-nums">{session.calories_burned || 0}</div>
                    <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">KCAL</div>
                  </div>
                  <div className="p-2.5 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-lg text-amber-400 tabular-nums">{session.elevation_gain}m</div>
                    <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">DESNIVEL</div>
                  </div>
                  <div className="p-2.5 bg-muted/40 rounded-lg">
                    {isCycling ? (
                      <>
                        <div className="font-bebas text-lg text-pink-500 tabular-nums">{formatSpeed(session.max_speed_kmh || 0)}</div>
                        <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">VEL MÁX</div>
                      </>
                    ) : (
                      <>
                        <div className="font-bebas text-lg text-pink-500 tabular-nums">{formatPace(session.max_pace || 0)}</div>
                        <div className="text-[10px] font-mono tracking-widest text-muted-foreground mt-0.5">RITMO MÁX</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Splits table */}
                {session.splits && session.splits.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Splits por km</div>
                    <SplitsTable splits={session.splits} />
                  </div>
                )}

                {/* Note */}
                {session.note && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                    {session.note}
                  </div>
                )}

                {/* Timestamp detail */}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>
                    Inicio: {new Date(session.started_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {session.finished_at && (
                    <span>
                      Fin: {new Date(session.finished_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {session.gps_points.length > 0 && (
                    <span>{session.gps_points.length} puntos GPS</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  {onDelete && session.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(session.id!)}
                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 gap-1.5"
                    >
                      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M6.67 7.33v4M9.33 7.33v4" />
                        <path d="M3.33 4h9.34l-.67 9.33a1.33 1.33 0 01-1.33 1.34H5.33A1.33 1.33 0 014 13.33L3.33 4z" />
                      </svg>
                      Eliminar
                    </Button>
                  )}
                  <div className="ml-auto">
                    <CardioShareCard session={session} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {onDelete && (
        <ConfirmDialog
          open={deleteConfirmId !== null}
          onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
          title="Eliminar sesión"
          description="¿Eliminar esta sesión de cardio? Esta acción no se puede deshacer."
          confirmLabel="ELIMINAR"
          cancelLabel="CANCELAR"
          variant="destructive"
          onConfirm={async () => {
            if (deleteConfirmId) {
              await onDelete(deleteConfirmId)
              setDeleteConfirmId(null)
              setExpanded(null)
            }
          }}
        />
      )}
    </div>
  )
}
