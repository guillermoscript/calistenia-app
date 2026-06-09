import { useMemo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { formatPace, formatDuration } from '../../lib/geo'
import { playRankUp, playRankDown, vibrate } from '../../lib/sounds'
import { serverNow } from '../../lib/race/raceClock'
import { useRaceContext } from '../../contexts/RaceContext'
import RaceMap from './RaceMap'
import type { RaceParticipant } from '../../types/race'

export default function RaceLive() {
  const { t } = useTranslation()
  const {
    race, participants, me, isCreator, myStats, lastError, clearError, actions,
  } = useRaceContext()

  const hasDistanceTarget = race?.mode === 'distance' && race.target_distance_km > 0
  const hasTimeTarget = race?.mode === 'time' && race.target_duration_seconds > 0

  const sorted = useMemo(() => {
    const list = [...participants]
    list.sort((a, b) => {
      const aFin = a.status === 'finished' && a.finished_at
      const bFin = b.status === 'finished' && b.finished_at
      if (aFin && bFin) {
        return new Date(a.finished_at!).getTime() - new Date(b.finished_at!).getTime()
      }
      if (aFin) return -1
      if (bFin) return 1
      // Primary: distance. Ties broken by less elapsed time (better pace),
      // then by display_name for stable order.
      if (b.distance_km !== a.distance_km) return b.distance_km - a.distance_km
      if (a.duration_seconds !== b.duration_seconds) return a.duration_seconds - b.duration_seconds
      return a.display_name.localeCompare(b.display_name)
    })
    return list
  }, [participants])

  const leaderId = sorted[0]?.id
  const leaderDistance = sorted[0]?.distance_km ?? 0

  // Sound + vibration when my rank changes during the race
  const myRank = me ? sorted.findIndex(p => p.id === me.id) : -1
  const prevRankRef = useRef<number>(myRank)
  useEffect(() => {
    if (myRank < 0 || sorted.length < 2) { prevRankRef.current = myRank; return }
    const prev = prevRankRef.current
    if (prev >= 0 && prev !== myRank) {
      if (myRank < prev) { playRankUp(); vibrate([60, 40, 60]) }
      else { playRankDown(); vibrate(120) }
    }
    prevRankRef.current = myRank
  }, [myRank, sorted.length])

  const mapMarkers = useMemo(() => {
    // Build markers from server-echoed participant positions, then override
    // the current user's marker with the live tracker stats so it appears
    // immediately on race start (no wait for first push round-trip) and
    // stays smooth between 3s pushes.
    const fromParticipants = participants
      .filter(p => p.last_lat != null && p.last_lng != null)
      .map(p => ({
        id: p.id,
        lat: p.last_lat!,
        lng: p.last_lng!,
        label: p.display_name,
        isMe: p.user === me?.user,
        isLeader: p.id === leaderId,
      }))

    const hasMe = fromParticipants.some(m => m.isMe)
    const meHasLiveFix =
      myStats &&
      myStats.last_lat != null &&
      myStats.last_lng != null &&
      !(myStats.last_lat === 0 && myStats.last_lng === 0)

    if (!meHasLiveFix) return fromParticipants

    const liveMe = {
      id: me?.id ?? 'me',
      lat: myStats!.last_lat,
      lng: myStats!.last_lng,
      label: me?.display_name ?? 'TÚ',
      isMe: true,
      isLeader: me?.id === leaderId,
    }

    return hasMe
      ? fromParticipants.map(m => (m.isMe ? liveMe : m))
      : [...fromParticipants, liveMe]
  }, [participants, me?.user, me?.id, me?.display_name, leaderId, myStats])

  // My stats override from tracker (more fresh than PB echo)
  const myDistance = myStats?.distance_km ?? me?.distance_km ?? 0
  const myPace = myStats?.avg_pace ?? me?.avg_pace ?? 0

  // Pure server-time elapsed — independent of GPS ticks so the timer and
  // remaining-time counter always tick even when GPS is stuck.
  const [elapsedNow, setElapsedNow] = useState(0)
  useEffect(() => {
    if (!race?.starts_at) return
    const startMs = new Date(race.starts_at).getTime()
    const tick = () => setElapsedNow(Math.max(0, Math.floor((serverNow() - startMs) / 1000)))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [race?.starts_at])
  const myDuration = elapsedNow

  if (!race) return null

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5">
      {lastError && (
        <div className="flex items-start gap-2 text-xs bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2">
          <span className="flex-1">
            {lastError.message.startsWith('race.') ? t(lastError.message) : lastError.message}
          </span>
          {lastError.kind === 'gps' && (
            <button
              onClick={() => {
                // Re-request geolocation to force the permission prompt again.
                if (!navigator.geolocation) return
                navigator.geolocation.getCurrentPosition(
                  () => clearError(),
                  () => { /* still denied, leave banner */ },
                  { enableHighAccuracy: true, timeout: 5000 },
                )
              }}
              className="text-lime font-mono tracking-widest uppercase text-[10px] px-2 py-0.5 rounded border border-lime/30 hover:bg-lime/10"
            >
              {t('race.retryGps')}
            </button>
          )}
          <button onClick={clearError} className="text-red-300/60 hover:text-red-300">×</button>
        </div>
      )}

      <RaceMap
        routePoints={race.route_points}
        markers={mapMarkers}
        height="240px"
      />

      <div className="text-center">
        <h1 className="font-bebas text-3xl tracking-wide">{race.name}</h1>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="size-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-mono tracking-widest text-red-400">
            {t('race.liveBoard').toUpperCase()}
          </span>
        </div>
      </div>

      {/* My stats bar */}
      <div className="grid grid-cols-3 gap-2 bg-muted/40 border border-border rounded-xl p-3">
        <Stat label={t('race.km').toUpperCase()} value={myDistance.toFixed(2)} />
        {hasTimeTarget ? (
          <Stat
            label={t('race.remaining').toUpperCase()}
            value={formatDuration(Math.max(0, Math.floor(race.target_duration_seconds - myDuration)))}
            highlight={race.target_duration_seconds - myDuration < 30}
          />
        ) : (
          <Stat
            label={t('race.elapsed').toUpperCase()}
            value={formatDuration(Math.floor(myDuration))}
          />
        )}
        <Stat label={t('race.pace').toUpperCase()} value={formatPace(myPace)} />
      </div>

      {/* Target progress */}
      {hasDistanceTarget && (
        <TargetBar
          label={`${leaderDistance.toFixed(2)} / ${race.target_distance_km} km`}
          ratio={Math.min(1, leaderDistance / race.target_distance_km)}
        />
      )}
      {hasTimeTarget && (
        <TargetBar
          label={`${formatDuration(Math.floor(myDuration))} / ${formatDuration(race.target_duration_seconds)}`}
          ratio={Math.min(1, myDuration / race.target_duration_seconds)}
        />
      )}

      <Leaderboard sorted={sorted} currentUserId={me?.user ?? null} />

      <div className="space-y-2">
        {isCreator && (
          <Button
            onClick={actions.finishRace}
            variant="outline"
            className="w-full h-11 font-bebas text-lg tracking-widest border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            {t('race.finish')}
          </Button>
        )}
        {!isCreator && me && me.status !== 'finished' && me.status !== 'dnf' && (
          <Button
            onClick={actions.leave}
            variant="outline"
            className="w-full h-11 font-bebas text-lg tracking-widest border-border text-muted-foreground"
          >
            {t('race.leave').toUpperCase()}
          </Button>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={cn(
        'font-bebas text-2xl tabular-nums leading-none',
        highlight && 'text-red-400 animate-pulse',
      )}>{value}</div>
      <div className="text-[9px] font-mono text-muted-foreground tracking-[0.2em] mt-1">{label}</div>
    </div>
  )
}

function TargetBar({ label, ratio }: { label: string; ratio: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
        <span>0</span>
        <span>{label}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-lime rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}

function Leaderboard({ sorted, currentUserId }: { sorted: RaceParticipant[]; currentUserId: string | null }) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">
        {t('race.participants')} ({sorted.length})
      </div>
      <div className="space-y-2">
        {sorted.map((p, idx) => {
          const isMe = p.user === currentUserId
          const isLeader = idx === 0 && p.distance_km > 0
          const isFinished = p.status === 'finished'
          const isDnf = p.status === 'dnf'
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg border',
                isMe ? 'border-lime/30 bg-lime/5' : 'border-border bg-muted/40',
              )}
            >
              <span className={cn(
                'font-bebas text-xl w-8 text-center tabular-nums',
                isLeader ? 'text-lime' : 'text-muted-foreground',
              )}>#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{p.display_name}</span>
                  {isLeader && (
                    <span className="text-[9px] font-mono tracking-widest text-lime bg-lime/10 px-1.5 py-0.5 rounded">
                      {t('race.leader').toUpperCase()}
                    </span>
                  )}
                  {isDnf && (
                    <span className="text-[9px] font-mono tracking-widest text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                      {t('race.dnf')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] font-mono text-muted-foreground">
                  <span>{formatPace(p.avg_pace)} /km</span>
                  <span>{formatDuration(p.duration_seconds)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className={cn(
                  'font-bebas text-2xl tabular-nums leading-none',
                  isLeader ? 'text-lime' : 'text-foreground',
                )}>{p.distance_km.toFixed(2)}</div>
                <div className="text-[9px] font-mono text-muted-foreground">KM</div>
              </div>
              <div className="flex-shrink-0">
                {isFinished ? (
                  <span className="text-base">🏁</span>
                ) : (
                  <span className={cn(
                    'size-2.5 rounded-full block',
                    p.status === 'racing' ? 'bg-green-500' : 'bg-zinc-600',
                  )} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
