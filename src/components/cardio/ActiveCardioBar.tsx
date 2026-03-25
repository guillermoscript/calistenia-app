import { useNavigate, useLocation } from 'react-router-dom'
import { useCardioSessionContext } from '../../contexts/CardioSessionContext'
import { formatDuration, formatPace, formatSpeed } from '../../lib/geo'
import { CARDIO_ACTIVITY } from '../../lib/style-tokens'
import { cn } from '../../lib/utils'

/**
 * Floating bar rendered above the mobile tab bar when a cardio session is active.
 * Shows live metrics and navigates to /cardio on tap.
 */
export default function ActiveCardioBar() {
  const { state, activityType, distance, duration, currentPace, currentSpeed } = useCardioSessionContext()
  const navigate = useNavigate()
  const location = useLocation()

  // Only show when session is active and user is NOT on the cardio page
  const isActive = state === 'tracking' || state === 'paused'
  const isOnCardioPage = location.pathname === '/cardio'

  if (!isActive || isOnCardioPage) return null

  const activity = CARDIO_ACTIVITY[activityType]
  const isPaused = state === 'paused'
  const isCycling = activityType === 'cycling'

  return (
    <button
      onClick={() => navigate('/cardio')}
      className={cn(
        'fixed left-3 right-3 z-50 sm:left-auto sm:right-6 sm:w-[380px]',
        // Position above mobile tab bar (52px tab + safe area) or bottom on desktop
        'bottom-[calc(52px+env(safe-area-inset-bottom,0px)+8px)] sm:bottom-6',
        // Min height 56px for comfortable touch target during exercise
        'flex items-center gap-3 px-4 py-3.5',
        'rounded-2xl border backdrop-blur-xl shadow-2xl',
        'transition-all duration-300 ease-out',
        'active:scale-[0.98]',
        isPaused
          ? 'bg-amber-50/90 border-amber-300 shadow-amber-200/20 dark:bg-amber-950/80 dark:border-amber-500/30 dark:shadow-amber-500/10'
          : 'bg-lime-50/90 border-lime-300 shadow-lime-200/20 dark:bg-zinc-950/80 dark:border-lime-500/30 dark:shadow-lime-500/10',
      )}
      aria-label="Sesión de cardio activa — toca para volver"
    >
      {/* GPS pulse indicator */}
      <div className="relative flex-shrink-0">
        <div className={cn(
          'size-11 rounded-xl flex items-center justify-center text-lg',
          isPaused ? 'bg-amber-500/20' : 'bg-lime-500/20',
        )}>
          {activity.icon}
        </div>
        {/* Pulsing dot — GPS signal */}
        {!isPaused && (
          <span className="absolute -top-0.5 -right-0.5 flex size-3">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-3 bg-lime-400" />
          </span>
        )}
        {isPaused && (
          <span className="absolute -top-0.5 -right-0.5 flex size-3">
            <span className="relative inline-flex rounded-full size-3 bg-amber-400" />
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="flex-1 min-w-0 flex items-center gap-3 sm:gap-4">
        {/* Duration — hero metric */}
        <div className="flex flex-col items-start">
          <span className={cn(
            'font-bebas text-2xl tabular-nums leading-none',
            isPaused ? 'text-amber-300' : 'text-lime-300',
          )}>
            {formatDuration(duration)}
          </span>
          <span className="text-[10px] font-mono tracking-[0.2em] text-muted-foreground mt-0.5">
            {isPaused ? 'PAUSADO' : 'EN CURSO'}
          </span>
        </div>

        {/* Distance */}
        <div className="flex flex-col items-start">
          <span className="font-bebas text-xl tabular-nums leading-none text-foreground">
            {distance.toFixed(2)}
          </span>
          <span className="text-[10px] font-mono tracking-[0.2em] text-muted-foreground mt-0.5">KM</span>
        </div>

        {/* Pace/Speed — critical for exercise awareness */}
        <div className="flex flex-col items-start">
          <span className="font-bebas text-xl tabular-nums leading-none text-sky-400">
            {isCycling ? formatSpeed(currentSpeed) : formatPace(currentPace)}
          </span>
          <span className="text-[10px] font-mono tracking-[0.2em] text-muted-foreground mt-0.5">
            {isCycling ? 'KM/H' : 'MIN/KM'}
          </span>
        </div>
      </div>

      {/* Arrow / CTA */}
      <div className={cn(
        'flex-shrink-0 size-9 rounded-lg flex items-center justify-center',
        isPaused ? 'bg-amber-500/20' : 'bg-lime-500/20',
      )}>
        <svg
          className={cn('size-4', isPaused ? 'text-amber-400' : 'text-lime-400')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </button>
  )
}
