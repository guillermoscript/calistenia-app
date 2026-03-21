import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChallenges, type ChallengeWithMeta } from '../hooks/useChallenges'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import type { ChallengeMetric } from '../types'

const METRIC_LABELS: Record<ChallengeMetric, string> = {
  most_sessions: 'Mas sesiones',
  most_pullups: 'Mas pull-ups',
  most_pushups: 'Mas push-ups',
  longest_streak: 'Mayor racha',
  most_lsit: 'Mayor L-sit',
  most_handstand: 'Mayor handstand',
}

function daysRemaining(endsAt: string): string {
  const diff = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return 'Finalizado'
  if (diff === 1) return '1 dia restante'
  return `${diff} dias restantes`
}

type Filter = 'active' | 'past'

interface ChallengesPageProps {
  userId: string
}

export default function ChallengesPage({ userId }: ChallengesPageProps) {
  const navigate = useNavigate()
  const { active, past, loading, load } = useChallenges(userId)
  const [filter, setFilter] = useState<Filter>('active')

  useEffect(() => { load() }, [load])

  const items = filter === 'active' ? active : past

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Social</div>
      <div className="flex items-end justify-between mb-6">
        <h1 className="font-bebas text-4xl md:text-5xl">DESAFIOS</h1>
        <Button
          onClick={() => navigate('/challenges/new')}
          size="sm"
          className="bg-lime text-lime-foreground hover:bg-lime/90 text-[10px] tracking-widest h-9"
        >
          + CREAR
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-6">
        {([
          { id: 'active' as Filter, label: 'Activos', count: active.length },
          { id: 'past' as Filter, label: 'Finalizados', count: past.length },
        ]).map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] tracking-wide font-medium transition-all duration-200 border',
              filter === f.id
                ? 'text-lime border-current bg-accent/50'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {f.label}
            {f.count > 0 && <span className="ml-1 text-[10px] opacity-70">{f.count}</span>}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-sm text-muted-foreground py-12 text-center">Cargando desafios...</div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="text-center py-16 motion-safe:animate-scale-in">
          <div className="text-3xl mb-3">🎯</div>
          <div className="text-sm text-muted-foreground mb-1">
            {filter === 'active' ? 'Sin desafios activos' : 'Sin desafios finalizados'}
          </div>
          <div className="text-xs text-muted-foreground mb-4">
            Crea un desafio y compite con tus amigos
          </div>
          {filter === 'active' && (
            <Button onClick={() => navigate('/challenges/new')} className="bg-lime text-lime-foreground hover:bg-lime/90">
              Crear desafio
            </Button>
          )}
        </div>
      )}

      {/* Challenge cards */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((ch, i) => (
            <div
              key={ch.id}
              className="motion-safe:animate-fade-in"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
            >
              <ChallengeCard challenge={ch} onTap={() => navigate(`/challenges/${ch.id}`)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Challenge Card ───────────────────────────────────────────────────────────

function ChallengeCard({ challenge: ch, onTap }: { challenge: ChallengeWithMeta; onTap: () => void }) {
  const isActive = ch.status === 'active'

  return (
    <button
      onClick={onTap}
      className={cn(
        'w-full text-left px-4 py-3.5 rounded-lg border transition-colors flex items-center justify-between gap-3',
        isActive
          ? 'bg-card border-border hover:border-lime/30'
          : 'bg-card/50 border-border/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{ch.title}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-lime tracking-wide">{METRIC_LABELS[ch.metric]}</span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className={cn('text-[10px]', isActive ? 'text-amber-400' : 'text-muted-foreground')}>
            {daysRemaining(ch.ends_at)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-muted-foreground">{ch.participantCount} participantes</span>
        <svg className="size-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
      </div>
    </button>
  )
}
