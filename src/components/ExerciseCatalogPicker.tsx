import { useState, useEffect, useMemo } from 'react'
import { cn } from '../lib/utils'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS } from '../data/workouts'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import type { EditorExercise } from '../hooks/useProgramEditor'

interface ExerciseCatalogPickerProps {
  onAdd: (exercise: EditorExercise) => void
  onClose: () => void
}

interface CatalogExercise {
  exerciseId: string
  name: string
  sets: number | string
  reps: string
  rest: number
  muscles: string
  note: string
  youtube: string
  priority: 'high' | 'med' | 'low'
  isTimer: boolean
  timerSeconds: number
  category: string
}

const CATEGORIES = [
  { id: 'all',      label: 'Todos' },
  { id: 'push',     label: 'Push' },
  { id: 'pull',     label: 'Pull' },
  { id: 'legs',     label: 'Legs' },
  { id: 'core',     label: 'Core' },
  { id: 'lumbar',   label: 'Lumbar' },
  { id: 'full',     label: 'Full' },
  { id: 'mobility', label: 'Movilidad' },
  { id: 'skill',    label: 'Skill' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400 border-red-400/30',
  med:  'text-amber-400 border-amber-400/30',
  low:  'text-emerald-400 border-emerald-400/30',
}

function inferCategory(muscles: string, name: string): string {
  const ml = muscles.toLowerCase()
  const nl = name.toLowerCase()
  if (ml.includes('lumbar') || ml.includes('columna') || nl.includes('lumbar')) return 'lumbar'
  if (ml.includes('pecho') || ml.includes('tríceps') || ml.includes('hombro') || ml.includes('deltoid') || nl.includes('push') || nl.includes('dip') || nl.includes('pike')) return 'push'
  if (ml.includes('dorsal') || ml.includes('bíceps') || ml.includes('romboid') || nl.includes('pull') || nl.includes('chin') || nl.includes('row')) return 'pull'
  if (ml.includes('cuádriceps') || ml.includes('glúteo') || ml.includes('isquio') || ml.includes('pantorrilla') || nl.includes('squat') || nl.includes('lunge')) return 'legs'
  if (ml.includes('core') || ml.includes('oblicuo') || ml.includes('abdominal') || nl.includes('plank') || nl.includes('hollow')) return 'core'
  if (ml.includes('full') || nl.includes('burpee') || nl.includes('full')) return 'full'
  if (nl.includes('stretch') || nl.includes('movilidad') || nl.includes('pose') || nl.includes('fold') || nl.includes('rotation')) return 'mobility'
  if (nl.includes('l-sit') || nl.includes('handstand') || nl.includes('muscle up') || nl.includes('front lever')) return 'skill'
  return 'full'
}

function extractFallbackCatalog(): CatalogExercise[] {
  const seen = new Set<string>()
  const catalog: CatalogExercise[] = []

  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (seen.has(ex.id)) return
      seen.add(ex.id)
      catalog.push({
        exerciseId: ex.id,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        muscles: ex.muscles,
        note: ex.note,
        youtube: ex.youtube,
        priority: ex.priority,
        isTimer: ex.isTimer || false,
        timerSeconds: ex.timerSeconds || 0,
        category: inferCategory(ex.muscles, ex.name),
      })
    })
  })

  return catalog.sort((a, b) => a.name.localeCompare(b.name))
}

export default function ExerciseCatalogPicker({ onAdd, onClose }: ExerciseCatalogPickerProps) {
  const [catalog, setCatalog] = useState<CatalogExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (available) {
        try {
          const res = await pb.collection('exercises_catalog').getList(1, 500, { sort: 'name' })
          if (res.items.length > 0) {
            setCatalog(res.items.map(r => ({
              exerciseId: r.exercise_id || r.id,
              name: r.name,
              sets: r.sets ?? 3,
              reps: r.reps ?? '10',
              rest: r.rest_seconds ?? 60,
              muscles: r.muscles ?? '',
              note: r.note ?? '',
              youtube: r.youtube ?? '',
              priority: r.priority ?? 'med',
              isTimer: r.is_timer ?? false,
              timerSeconds: r.timer_seconds ?? 0,
              category: r.category || inferCategory(r.muscles || '', r.name),
            })))
            setLoading(false)
            return
          }
        } catch { /* fall through to fallback */ }
      }
      setCatalog(extractFallbackCatalog())
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    let items = catalog
    if (category !== 'all') {
      items = items.filter(ex => ex.category === category)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(ex =>
        ex.name.toLowerCase().includes(q) ||
        ex.muscles.toLowerCase().includes(q)
      )
    }
    return items
  }, [catalog, search, category])

  const handleAdd = (ex: CatalogExercise) => {
    onAdd({
      exerciseId: ex.exerciseId,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      muscles: ex.muscles,
      note: ex.note,
      youtube: ex.youtube,
      priority: ex.priority,
      isTimer: ex.isTimer,
      timerSeconds: ex.timerSeconds,
    })
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="font-mono text-[10px] text-muted-foreground tracking-[3px] mb-1">CATÁLOGO</div>
          <DialogTitle className="font-bebas text-[28px] leading-none">AGREGAR EJERCICIO</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Busca y selecciona ejercicios del catálogo
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <Input
          placeholder="Buscar por nombre o músculo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm"
        />

        {/* Category pills */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <Button
              key={cat.id}
              variant={category === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory(cat.id)}
              className={cn(
                'h-7 px-2.5 text-[10px] tracking-wide',
                category === cat.id && 'bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90'
              )}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-1.5">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Cargando catálogo...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No se encontraron ejercicios</div>
          ) : (
            filtered.map(ex => (
              <div
                key={ex.exerciseId}
                className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-lg hover:border-[hsl(var(--lime))]/25 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">{ex.name}</span>
                    <Badge variant="outline" className={cn('text-[9px] shrink-0', PRIORITY_COLORS[ex.priority])}>
                      {ex.priority.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {ex.muscles} · {ex.sets}×{ex.reps} · {ex.rest}s
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAdd(ex)}
                  className="h-7 px-3 text-[10px] tracking-wide bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90 shrink-0"
                >
                  AGREGAR
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Footer count */}
        <div className="text-[10px] text-muted-foreground text-center pt-1">
          {filtered.length} ejercicio{filtered.length !== 1 ? 's' : ''}
        </div>
      </DialogContent>
    </Dialog>
  )
}
