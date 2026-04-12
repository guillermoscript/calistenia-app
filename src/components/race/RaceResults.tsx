import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthState } from '../../contexts/AuthContext'
import { useRaceContext } from '../../contexts/RaceContext'
import { pb } from '../../lib/pocketbase'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { formatPace, formatDuration } from '../../lib/geo'
import RaceShareCard from './RaceShareCard'

export default function RaceResults() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthState()
  const { race, participants, me } = useRaceContext()
  const userName = (user as { display_name?: string; name?: string } | null)?.display_name
    || (user as { name?: string } | null)?.name
    || undefined
  const [savedId, setSavedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSaveAsWorkout = async () => {
    if (!me || !race || savedId || saving) return
    setSaving(true)
    try {
      const userId = pb.authStore.record?.id
      if (!userId) throw new Error('not authed')
      const session = {
        user: userId,
        activity_type: 'running',
        gps_points: (me.gps_track || []).map(pt => ({
          lat: pt.lat, lng: pt.lng, timestamp: (race.starts_at ? new Date(race.starts_at).getTime() : 0) + pt.t,
        })),
        distance_km: me.distance_km,
        duration_seconds: me.duration_seconds,
        avg_pace: me.avg_pace,
        elevation_gain: 0,
        started_at: race.starts_at || new Date().toISOString(),
        finished_at: me.finished_at || race.finished_at || new Date().toISOString(),
        note: `Race: ${race.name}`,
      }
      const saved = await pb.collection('cardio_sessions').create(session)
      setSavedId(saved.id)
    } catch (e) {
      console.warn('save as workout failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const sorted = useMemo(() => {
    const list = [...participants]
    list.sort((a, b) => {
      const aFin = a.status === 'finished'
      const bFin = b.status === 'finished'
      if (aFin && bFin) {
        const af = a.finished_at ? new Date(a.finished_at).getTime() : Infinity
        const bf = b.finished_at ? new Date(b.finished_at).getTime() : Infinity
        return af - bf
      }
      if (aFin) return -1
      if (bFin) return 1
      if (a.status === 'dnf' && b.status !== 'dnf') return 1
      if (b.status === 'dnf' && a.status !== 'dnf') return -1
      return b.distance_km - a.distance_km
    })
    return list
  }, [participants])

  const winner = sorted[0]
  const totalElapsed = race?.starts_at && race?.finished_at
    ? Math.floor((new Date(race.finished_at).getTime() - new Date(race.starts_at).getTime()) / 1000)
    : 0

  if (!race) return null

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      <div className="text-center">
        <h1 className="font-bebas text-4xl tracking-wide">{race.name}</h1>
        <div className="mt-1 text-xs font-mono text-muted-foreground tracking-widest">
          {t('race.results').toUpperCase()}
        </div>
        <div className="mt-3 font-bebas text-3xl tabular-nums text-lime">
          {formatDuration(totalElapsed)}
        </div>
      </div>

      {winner && (
        <div className="rounded-2xl border border-lime/30 bg-lime/5 px-4 py-5 text-center">
          <div className="text-[10px] font-mono tracking-[0.3em] text-lime mb-1">WINNER</div>
          <div className="font-bebas text-3xl">{winner.display_name}</div>
          <div className="mt-2 text-sm font-mono text-muted-foreground">
            {winner.distance_km.toFixed(2)} km · {formatDuration(winner.duration_seconds)} · {formatPace(winner.avg_pace)} /km
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((p, idx) => {
          const isMe = p.user === me?.user
          const isDnf = p.status === 'dnf'
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg border',
                isMe ? 'border-lime/30 bg-lime/5' : 'border-border bg-muted/40',
                isDnf && 'opacity-60',
              )}
            >
              <span className="font-bebas text-xl w-8 text-center tabular-nums text-muted-foreground">
                #{idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{p.display_name}</span>
                  {isDnf && (
                    <span className="text-[9px] font-mono tracking-widest text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                      DNF
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] font-mono text-muted-foreground">
                  <span>{formatPace(p.avg_pace)} /km</span>
                  <span>{formatDuration(p.duration_seconds)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bebas text-2xl tabular-nums leading-none">
                  {p.distance_km.toFixed(2)}
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">KM</div>
              </div>
            </div>
          )
        })}
      </div>

      {me && (
        <RaceShareCard
          race={race}
          participants={participants}
          currentUserId={me.user}
          userName={userName}
        />
      )}

      {me && me.status === 'finished' && (
        <Button
          onClick={handleSaveAsWorkout}
          disabled={saving || !!savedId}
          variant="outline"
          className="w-full h-11 font-bebas text-lg tracking-widest border-lime/30 text-lime hover:bg-lime/10"
        >
          {savedId ? 'GUARDADO ✓' : saving ? '...' : 'Guardar como entrenamiento'}
        </Button>
      )}

      <Button
        onClick={() => navigate('/cardio')}
        variant="outline"
        className="w-full h-11 font-bebas text-lg tracking-widest border-border"
      >
        CARDIO
      </Button>
    </div>
  )
}
