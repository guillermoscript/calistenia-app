import { useTranslation } from 'react-i18next'
import { useAuthState } from '../../contexts/AuthContext'
import { useRaceContext } from '../../contexts/RaceContext'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import RaceMap from './RaceMap'

export default function RaceLobby() {
  const { t } = useTranslation()
  const { user } = useAuthState()
  const {
    race, participants, me, isCreator, hasJoined, lastError, clearError, actions,
  } = useRaceContext()

  if (!race) return null

  const handleJoin = async () => {
    const displayName = (user as { display_name?: string; name?: string } | null)?.display_name
      || (user as { name?: string } | null)?.name
      || 'Athlete'
    try {
      await actions.join(displayName)
    } catch { /* surfaced via lastError */ }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/race/${race.id}`
    if (navigator.share) {
      try { await navigator.share({ title: race.name, url }) } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(url) } catch { /* ignore */ }
    }
  }

  const canStart = isCreator && participants.length >= 1

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      {lastError && (
        <div className="flex items-start gap-2 text-xs bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2">
          <span className="flex-1">{lastError.message}</span>
          <button onClick={clearError} className="text-red-300/60 hover:text-red-300">×</button>
        </div>
      )}

      <div className="text-center">
        <h1 className="font-bebas text-5xl md:text-6xl leading-none tracking-wide">{race.name}</h1>
        {race.mode === 'distance' && race.target_distance_km > 0 && (
          <div className="mt-2 text-lime font-bebas text-2xl tabular-nums">
            {race.target_distance_km} km
          </div>
        )}
        {race.mode === 'time' && race.target_duration_seconds > 0 && (
          <div className="mt-2 text-lime font-bebas text-2xl tabular-nums">
            {Math.round(race.target_duration_seconds / 60)} min
          </div>
        )}
      </div>

      {race.route_points && race.route_points.length > 0 && (
        <RaceMap routePoints={race.route_points} height="200px" />
      )}

      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-mono tracking-widest">
          <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
          {t('race.waitingForParticipants')}
        </span>
      </div>

      <div>
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">
          {t('race.participants')} ({participants.length})
        </div>
        <div className="space-y-2">
          {participants.map(p => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/40',
                p.user === me?.user && 'border-lime/30 bg-lime/5',
              )}
            >
              <div className={cn(
                'size-9 rounded-full flex items-center justify-center text-sm font-bebas tracking-wider',
                p.user === me?.user
                  ? 'bg-lime/20 text-lime border border-lime/30'
                  : 'bg-muted text-muted-foreground border border-border',
              )}>
                {p.display_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium flex-1">{p.display_name}</span>
              {p.status === 'ready' && (
                <span className="text-[9px] font-mono tracking-widest text-lime bg-lime/10 px-1.5 py-0.5 rounded">
                  READY
                </span>
              )}
              {p.user === me?.user && (
                <span className="text-[10px] text-lime font-mono tracking-widest">YOU</span>
              )}
            </div>
          ))}
          {participants.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">
              {t('race.waitingForParticipants')}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {!hasJoined && (
          <Button
            onClick={handleJoin}
            className="w-full h-14 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-xl tracking-widest"
          >
            {t('race.join')}
          </Button>
        )}
        {hasJoined && me?.status !== 'ready' && !isCreator && (
          <Button
            onClick={actions.markReady}
            variant="outline"
            className="w-full h-12 font-bebas text-lg tracking-widest border-lime/30 text-lime hover:bg-lime/10"
          >
            READY
          </Button>
        )}
        <Button
          onClick={handleShare}
          variant="outline"
          className="w-full h-11 font-bebas text-lg tracking-widest border-border"
        >
          {t('race.share')}
        </Button>
        {canStart && (
          <Button
            onClick={actions.startCountdown}
            className="w-full h-14 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-xl tracking-widest"
          >
            {t('race.start')}
          </Button>
        )}
        {isCreator && (
          <Button
            onClick={actions.cancelRace}
            variant="outline"
            className="w-full h-10 font-mono text-xs tracking-widest border-border text-muted-foreground"
          >
            CANCELAR
          </Button>
        )}
      </div>
    </div>
  )
}
