import { useState } from 'react'
import { formatDuration, formatPace, formatSpeed } from '../../lib/geo'
import { CARDIO_ACTIVITY } from '../../lib/style-tokens'
import RouteMap from './RouteMap'
import CardioShareCard from './CardioShareCard'
import ElevationProfile from './ElevationProfile'
import type { CardioSession } from '../../types'

interface CardioHistoryProps {
  sessions: CardioSession[]
  loading?: boolean
}

export default function CardioHistory({ sessions, loading }: CardioHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

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
        const isExpanded = expanded === session.id
        const isCycling = session.activity_type === 'cycling'
        const activity = CARDIO_ACTIVITY[session.activity_type]
        return (
          <div key={session.id} className="rounded-xl border border-border bg-muted/30 overflow-hidden">
            <button
              onClick={() => setExpanded(isExpanded ? null : session.id!)}
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
                  <div className="hidden sm:block">
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
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                {session.gps_points.length > 0 && (
                  <RouteMap points={session.gps_points} height="200px" />
                )}
                {session.gps_points.length > 2 && (
                  <ElevationProfile points={session.gps_points} height={64} />
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-lg text-lime tabular-nums">{session.distance_km.toFixed(2)}</div>
                    <div className="text-[9px] text-muted-foreground">km</div>
                  </div>
                  <div className="p-2 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-lg tabular-nums">{formatDuration(session.duration_seconds)}</div>
                    <div className="text-[9px] text-muted-foreground">Duración</div>
                  </div>
                  <div className="p-2 bg-muted/40 rounded-lg">
                    {isCycling ? (
                      <>
                        <div className="font-bebas text-lg text-sky-500 tabular-nums">{formatSpeed(session.avg_speed_kmh || 0)}</div>
                        <div className="text-[9px] text-muted-foreground">km/h</div>
                      </>
                    ) : (
                      <>
                        <div className="font-bebas text-lg text-sky-500 tabular-nums">{formatPace(session.avg_pace)}</div>
                        <div className="text-[9px] text-muted-foreground">min/km</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-lg text-amber-400 tabular-nums">{session.elevation_gain}m</div>
                    <div className="text-[9px] text-muted-foreground">Desnivel</div>
                  </div>
                  <div className="p-2 bg-muted/40 rounded-lg">
                    <div className="font-bebas text-lg text-amber-400 tabular-nums">{session.calories_burned || 0}</div>
                    <div className="text-[9px] text-muted-foreground">kcal</div>
                  </div>
                </div>
                {session.note && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                    {session.note}
                  </div>
                )}
                <div className="flex justify-end">
                  <CardioShareCard session={session} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
