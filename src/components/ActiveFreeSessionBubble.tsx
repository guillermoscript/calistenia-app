import { useNavigate, useLocation } from 'react-router-dom'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import { cn } from '../lib/utils'

/**
 * Floating bubble rendered when a session is active but the user is not on /session.
 * Tapping it navigates back to the session page.
 */
export default function ActiveSessionBubble() {
  const { isActive, exerciseCount, workout } = useActiveSession()
  const navigate = useNavigate()
  const location = useLocation()

  // Only show when session is active and user is NOT on the session page
  if (!isActive || location.pathname === '/session') return null

  const title = workout?.title || 'Sesion'

  return (
    <button
      onClick={() => navigate('/session')}
      className={cn(
        'fixed z-50',
        'bottom-[calc(52px+env(safe-area-inset-bottom,0px)+8px)] right-4 sm:bottom-6 sm:right-6',
        'flex items-center gap-3 pl-3.5 pr-4 py-3',
        'rounded-2xl border backdrop-blur-xl shadow-2xl',
        'bg-lime-950/80 border-lime-500/30 shadow-lime-500/10',
        'transition-all duration-300 ease-out',
        'active:scale-[0.96]',
        'focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300',
      )}
      aria-label={`${title} activa — ${exerciseCount} ejercicios — toca para volver`}
    >
      {/* Pulsing indicator */}
      <div className="relative flex-shrink-0">
        <div className="size-10 rounded-xl bg-lime-500/20 flex items-center justify-center">
          <svg className="size-5 text-lime-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8h1a4 4 0 010 8h-1" />
            <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
            <line x1="6" y1="1" x2="6" y2="4" />
            <line x1="10" y1="1" x2="10" y2="4" />
            <line x1="14" y1="1" x2="14" y2="4" />
          </svg>
        </div>
        <span className="absolute -top-0.5 -right-0.5 flex size-3">
          <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75" />
          <span className="relative inline-flex rounded-full size-3 bg-lime-400" />
        </span>
      </div>

      {/* Label */}
      <div className="flex flex-col items-start">
        <span className="font-bebas text-lg leading-none text-lime-300">
          {title}
        </span>
        <span className="text-[10px] font-mono tracking-[0.2em] text-muted-foreground mt-0.5">
          {exerciseCount} EJERCICIO{exerciseCount !== 1 ? 'S' : ''}
        </span>
      </div>

      {/* Arrow */}
      <div className="flex-shrink-0 size-9 rounded-lg bg-lime-500/20 flex items-center justify-center ml-1">
        <svg className="size-4 text-lime-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </button>
  )
}
