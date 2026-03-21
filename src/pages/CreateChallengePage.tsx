import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChallenges } from '../hooks/useChallenges'
import { useFollows } from '../hooks/useFollows'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import type { ChallengeMetric } from '../types'

const METRICS: { id: ChallengeMetric; label: string; icon: string }[] = [
  { id: 'most_sessions', label: 'Mas sesiones', icon: '💪' },
  { id: 'most_pullups', label: 'Pull-ups', icon: '🏋️' },
  { id: 'most_pushups', label: 'Push-ups', icon: '🫸' },
  { id: 'longest_streak', label: 'Mayor racha', icon: '🔥' },
  { id: 'most_lsit', label: 'L-sit', icon: '🧘' },
  { id: 'most_handstand', label: 'Handstand', icon: '🤸' },
]

interface CreateChallengePageProps {
  userId: string
}

export default function CreateChallengePage({ userId }: CreateChallengePageProps) {
  const navigate = useNavigate()
  const { createChallenge } = useChallenges(userId)
  const { following } = useFollows(userId)

  const today = new Date().toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const [title, setTitle] = useState('')
  const [metric, setMetric] = useState<ChallengeMetric>('most_sessions')
  const [startsAt, setStartsAt] = useState(today)
  const [endsAt, setEndsAt] = useState(nextWeek)
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSubmit = title.trim().length > 0 && startsAt && endsAt && endsAt >= startsAt

  const handleSubmit = async () => {
    if (!canSubmit || creating) return
    setCreating(true)
    const id = await createChallenge({
      title: title.trim(),
      metric,
      starts_at: startsAt,
      ends_at: endsAt,
      invitedUserIds: Array.from(selectedFriends),
    })
    setCreating(false)
    if (id) navigate(`/challenges/${id}`, { replace: true })
    else navigate('/challenges', { replace: true })
  }

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Back */}
      <button onClick={() => navigate('/challenges')} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1">
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        Volver
      </button>

      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Nuevo</div>
      <h1 className="font-bebas text-3xl md:text-4xl mb-6">CREAR DESAFIO</h1>

      {/* Title */}
      <div className="mb-5">
        <label className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">Nombre del desafio</label>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ej: Semana de pull-ups"
          maxLength={60}
        />
      </div>

      {/* Metric */}
      <div className="mb-5">
        <label className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">Que se compite</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {METRICS.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              aria-pressed={metric === m.id}
              className={cn(
                'px-3 py-2.5 rounded-lg text-[11px] font-medium transition-all duration-200 border text-left',
                metric === m.id
                  ? 'text-lime border-lime/40 bg-lime/10'
                  : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/20',
              )}
            >
              <span className="mr-1.5">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">Inicio</label>
          <Input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} min={today} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">Fin</label>
          <Input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} min={startsAt || today} />
        </div>
      </div>

      {/* Friend selector */}
      <div className="mb-6">
        <label className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">
          Invitar amigos {selectedFriends.size > 0 && `(${selectedFriends.size})`}
        </label>
        {following.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4">
            Sigue a alguien primero para poder invitarlos
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {following.map(user => {
              const selected = selectedFriends.has(user.id)
              return (
                <button
                  key={user.id}
                  onClick={() => toggleFriend(user.id)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all text-left',
                    selected
                      ? 'border-lime/40 bg-lime/5'
                      : 'border-border hover:border-foreground/20',
                  )}
                >
                  <div className={cn(
                    'size-5 rounded border-2 flex items-center justify-center transition-colors shrink-0',
                    selected ? 'border-lime bg-lime' : 'border-muted-foreground/30',
                  )}>
                    {selected && (
                      <svg className="size-3 text-lime-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3,8 7,12 13,4" /></svg>
                    )}
                  </div>
                  <div className="size-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium shrink-0">
                    {user.displayName[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm truncate">{user.displayName}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || creating}
        className="w-full bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-lg tracking-wide h-12"
      >
        {creating ? 'Creando...' : 'CREAR DESAFIO'}
      </Button>
    </div>
  )
}
