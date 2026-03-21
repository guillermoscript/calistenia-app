import { Card, CardContent } from '../ui/card'
import { CARDIO_ACTIVITY } from '../../lib/style-tokens'
import type { CardioAggregateStats } from '../../hooks/useCardioStats'
import type { CardioSession } from '../../types'

interface CardioWidgetProps {
  weeklyStats: CardioAggregateStats
  lastSession: CardioSession | null
  onNavigate: () => void
}

export default function CardioWidget({ weeklyStats, lastSession, onNavigate }: CardioWidgetProps) {
  const hasActivity = weeklyStats.totalSessions > 0

  return (
    <button onClick={onNavigate} className="text-left w-full">
      <Card className="border-l-[3px] border-l-sky-500 hover:border-sky-500/50 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative size-14 shrink-0">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" className="text-muted" strokeWidth="5" />
                <circle
                  cx="28" cy="28" r="22"
                  fill="none" stroke="currentColor"
                  className="text-sky-500"
                  strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={2 * Math.PI * 22 * (1 - Math.min(weeklyStats.totalSessions / 5, 1))}
                  transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-base" aria-hidden="true">🏃</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Cardio</div>
              {hasActivity ? (
                <div className="text-sm">
                  <span className="text-foreground font-medium">{weeklyStats.totalDistance.toFixed(1)} km</span>
                  <span className="text-muted-foreground"> · {weeklyStats.totalSessions} sesiones</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Empieza tu primera sesión</div>
              )}
              {lastSession && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {CARDIO_ACTIVITY[lastSession.activity_type]?.icon || '🏃'}{' '}
                  {lastSession.distance_km.toFixed(1)} km ·{' '}
                  {new Date(lastSession.started_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  )
}
