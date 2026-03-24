import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChallenges } from '../hooks/useChallenges'
import { useFollows } from '../hooks/useFollows'
import { cn } from '../lib/utils'
import { todayStr, toLocalDateStr } from '../lib/dateUtils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'
import type { ChallengeMetric } from '../types'

const METRICS: { id: ChallengeMetric; label: string; icon: string; desc: string }[] = [
  { id: 'most_sessions', label: 'Sesiones', icon: '💪', desc: 'Quién entrena más días' },
  { id: 'most_pullups', label: 'Pull-ups', icon: '🏋️', desc: 'Máximo de pull-ups' },
  { id: 'most_pushups', label: 'Push-ups', icon: '🫸', desc: 'Máximo de push-ups' },
  { id: 'longest_streak', label: 'Racha', icon: '🔥', desc: 'Mayor racha consecutiva' },
  { id: 'most_lsit', label: 'L-sit', icon: '🧘', desc: 'Mayor tiempo en L-sit' },
  { id: 'most_handstand', label: 'Handstand', icon: '🤸', desc: 'Mayor tiempo en handstand' },
  { id: 'custom', label: 'Personalizado', icon: '✏️', desc: 'Define tu propia métrica' },
]

const DURATION_PRESETS = [
  { label: '1 semana', days: 7 },
  { label: '2 semanas', days: 14 },
  { label: '1 mes', days: 30 },
  { label: 'Personalizado', days: 0 },
]

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return toLocalDateStr(d)
}

interface CreateChallengePageProps {
  userId: string
}

export default function CreateChallengePage({ userId }: CreateChallengePageProps) {
  const navigate = useNavigate()
  const { createChallenge } = useChallenges(userId)
  const { following } = useFollows(userId)

  const today = todayStr()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [metric, setMetric] = useState<ChallengeMetric>('most_sessions')
  const [customMetric, setCustomMetric] = useState('')
  const [goal, setGoal] = useState('')
  const [durationPreset, setDurationPreset] = useState(7)
  const [startsAt, setStartsAt] = useState(today)
  const [endsAt, setEndsAt] = useState(addDays(today, 7))
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const handleDurationPreset = (days: number) => {
    setDurationPreset(days)
    if (days > 0) {
      setEndsAt(addDays(startsAt, days))
    }
  }

  const handleStartChange = (val: string) => {
    setStartsAt(val)
    if (durationPreset > 0) {
      setEndsAt(addDays(val, durationPreset))
    }
  }

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllFriends = () => {
    if (selectedFriends.size === following.length) {
      setSelectedFriends(new Set())
    } else {
      setSelectedFriends(new Set(following.map(f => f.id)))
    }
  }

  const isCustomMetric = metric === 'custom'
  const canSubmit = title.trim().length > 0 && startsAt && endsAt && endsAt >= startsAt && (!isCustomMetric || customMetric.trim().length > 0)

  const handleSubmit = async () => {
    if (!canSubmit || creating) return
    setCreating(true)
    const id = await createChallenge({
      title: title.trim(),
      metric,
      custom_metric: isCustomMetric ? customMetric.trim() : undefined,
      description: description.trim() || undefined,
      goal: goal ? Number(goal) : undefined,
      starts_at: startsAt,
      ends_at: endsAt,
      invitedUserIds: Array.from(selectedFriends),
    })
    setCreating(false)
    if (id) navigate(`/challenges/${id}`, { replace: true })
    else navigate('/challenges', { replace: true })
  }

  const shareWhatsApp = () => {
    const msg = `🎯 Te reto a "${title || 'un desafío'}" en Calistenia App!\n${window.location.origin}/challenges`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Back */}
      <button onClick={() => navigate('/challenges')} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        Volver
      </button>

      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Nuevo</div>
      <h1 className="font-bebas text-3xl md:text-4xl mb-6">CREAR DESAFIO</h1>

      {/* Title */}
      <div className="mb-5">
        <label htmlFor="challenge-title" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">Nombre del desafío</label>
        <Input
          id="challenge-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ej: Semana de pull-ups, Reto de 100 flexiones..."
          maxLength={60}
        />
      </div>

      {/* Description */}
      <div className="mb-5">
        <label htmlFor="challenge-desc" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">
          Descripción <span className="opacity-50">(opcional)</span>
        </label>
        <textarea
          id="challenge-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Reglas, contexto o motivación del desafío..."
          maxLength={300}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        />
      </div>

      {/* Metric */}
      <fieldset className="mb-5">
        <legend className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Qué se compite</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {METRICS.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              aria-pressed={metric === m.id}
              className={cn(
                'px-3 py-2.5 min-h-[44px] rounded-lg text-left transition-all duration-200 border active:scale-[0.97]',
                metric === m.id
                  ? 'text-lime border-lime/40 bg-lime/10'
                  : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/20',
              )}
            >
              <div className="text-[11px] font-medium">
                <span className="mr-1.5">{m.icon}</span>
                {m.label}
              </div>
              <div className="text-[9px] opacity-60 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>

        {/* Custom metric input */}
        {isCustomMetric && (
          <div className="mt-3 motion-safe:animate-fade-in">
            <label htmlFor="challenge-custom-metric" className="sr-only">Métrica personalizada</label>
            <Input
              id="challenge-custom-metric"
              value={customMetric}
              onChange={e => setCustomMetric(e.target.value)}
              placeholder="Ej: Km corridos, minutos de plancha, vasos de agua..."
              maxLength={40}
            />
          </div>
        )}
      </fieldset>

      {/* Goal */}
      <div className="mb-5">
        <label htmlFor="challenge-goal" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2 block">
          Meta <span className="opacity-50">(opcional)</span>
        </label>
        <div className="flex items-center gap-3">
          <Input
            id="challenge-goal"
            type="number"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="Ej: 100"
            min="1"
            className="w-32"
          />
          <span className="text-xs text-muted-foreground">
            {isCustomMetric ? (customMetric || 'unidades') : METRICS.find(m => m.id === metric)?.label.toLowerCase() || ''}
          </span>
        </div>
      </div>

      {/* Duration presets */}
      <fieldset className="mb-5">
        <legend className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Duración</legend>
        <div className="flex flex-wrap gap-2 mb-3">
          {DURATION_PRESETS.map(p => (
            <button
              key={p.days}
              onClick={() => handleDurationPreset(p.days)}
              aria-pressed={durationPreset === p.days}
              className={cn(
                'px-3 py-2.5 min-h-[44px] rounded-md text-[11px] font-medium transition-all duration-150 border active:scale-95',
                durationPreset === p.days
                  ? 'text-lime border-lime/40 bg-lime/10'
                  : 'text-muted-foreground border-border hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date pickers */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="challenge-start" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5 block">Inicio</label>
            <Input id="challenge-start" type="date" value={startsAt} onChange={e => handleStartChange(e.target.value)} min={today} />
          </div>
          <div>
            <label htmlFor="challenge-end" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5 block">Fin</label>
            <Input
              id="challenge-end"
              type="date"
              value={endsAt}
              onChange={e => { setEndsAt(e.target.value); setDurationPreset(0) }}
              min={startsAt || today}
              disabled={durationPreset > 0}
            />
          </div>
        </div>
      </fieldset>

      {/* Friend selector */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
            Invitar amigos {selectedFriends.size > 0 && `(${selectedFriends.size})`}
          </span>
          {following.length > 1 && (
            <button
              onClick={selectAllFriends}
              className="text-[10px] text-lime hover:text-lime/80 transition-colors"
            >
              {selectedFriends.size === following.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          )}
        </div>
        {following.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-3">
              Sigue a alguien primero para poder invitarlos
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/friends')}
                className="text-[10px] tracking-widest h-8"
              >
                BUSCAR AMIGOS
              </Button>
              <Button
                size="sm"
                onClick={shareWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] tracking-widest h-8"
              >
                <WhatsAppIcon className="size-3.5 mr-1" />
                INVITAR POR WHATSAPP
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" role="group" aria-label="Seleccionar amigos para invitar">
            {following.map(user => {
              const selected = selectedFriends.has(user.id)
              return (
                <button
                  key={user.id}
                  onClick={() => toggleFriend(user.id)}
                  aria-pressed={selected}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-150 text-left active:scale-[0.98]',
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
                  <div className="size-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium shrink-0" aria-hidden="true">
                    {user.displayName[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm truncate block">{user.displayName}</span>
                    {user.username && <span className="text-[10px] text-muted-foreground">@{user.username}</span>}
                  </div>
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
