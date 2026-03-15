import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS } from '../data/workouts'
import { cn } from '../lib/utils'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import type { Exercise, Priority } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

interface CatalogExercise {
  id: string
  slug: string
  name: string
  muscles: string
  category: string
  priority: Priority
  sets: number | string
  reps: string
  rest: number
  note: string
  youtube: string
  isTimer?: boolean
  timerSeconds?: number
  demoImages?: string[]
  demoVideo?: string
}

// ── Constants ────────────────────────────────────────────────────────────────

type CategoryId = 'todos' | 'push' | 'pull' | 'legs' | 'core' | 'lumbar' | 'full' | 'movilidad' | 'skill'

interface CategoryDef {
  id: CategoryId
  label: string
  color: string
  bg: string
}

const CATEGORIES: CategoryDef[] = [
  { id: 'todos',     label: 'Todos',     color: 'text-foreground',      bg: 'bg-muted' },
  { id: 'push',      label: 'Push',      color: 'text-lime-400',        bg: 'bg-lime-500/10' },
  { id: 'pull',      label: 'Pull',      color: 'text-sky-400',         bg: 'bg-sky-500/10' },
  { id: 'legs',      label: 'Legs',      color: 'text-pink-400',        bg: 'bg-pink-500/10' },
  { id: 'core',      label: 'Core',      color: 'text-amber-400',       bg: 'bg-amber-500/10' },
  { id: 'lumbar',    label: 'Lumbar',     color: 'text-red-400',         bg: 'bg-red-500/10' },
  { id: 'full',      label: 'Full',      color: 'text-yellow-400',      bg: 'bg-yellow-500/10' },
  { id: 'movilidad', label: 'Movilidad', color: 'text-emerald-400',     bg: 'bg-emerald-500/10' },
  { id: 'skill',     label: 'Skill',     color: 'text-violet-400',      bg: 'bg-violet-500/10' },
]

const CATEGORY_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  push:      { text: 'text-lime-400',    bg: 'bg-lime-500/10',    border: 'border-lime-500/20' },
  pull:      { text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  legs:      { text: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20' },
  core:      { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  lumbar:    { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  full:      { text: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
  movilidad: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  skill:     { text: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
}

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-red-500',
  med:  'bg-amber-400',
  low:  'bg-sky-500',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Prioritario',
  med:  'Importante',
  low:  'Complementario',
}

const MUSCLE_GROUPS = [
  'Pecho', 'Hombros', 'Tríceps', 'Dorsal', 'Bíceps', 'Core',
  'Cuádriceps', 'Glúteos', 'Isquios', 'Lumbar', 'Pantorrillas',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferCategory(exercise: Exercise, dayType: string): string {
  const name = exercise.name.toLowerCase()
  const muscles = exercise.muscles.toLowerCase()
  const note = exercise.note.toLowerCase()

  // Skills
  if (name.includes('handstand') || name.includes('l-sit') || name.includes('muscle-up') ||
      name.includes('front lever') || name.includes('back lever') || name.includes('planche') ||
      name.includes('human flag') || name.includes('skill')) return 'skill'

  // Movilidad
  if (name.includes('stretch') || name.includes('yoga') || name.includes('mobility') ||
      name.includes('movilidad') || name.includes('cat-cow') || name.includes('pigeon') ||
      name.includes('child') || name.includes('forward fold') || name.includes('hip flexor') ||
      name.includes('thoracic') || name.includes('cossack') || name.includes('jefferson') ||
      name.includes('world') || name.includes('90/90')) return 'movilidad'

  // Core
  if (muscles.includes('core') || name.includes('hollow') || name.includes('plank') ||
      name.includes('dead bug') || name.includes('side plank')) return 'core'

  // Lumbar
  if (dayType === 'lumbar' || name.includes('bird-dog') || name.includes('superman') ||
      name.includes('glute bridge') || note.includes('lumbar')) {
    if (muscles.includes('glúteo') || name.includes('glute bridge')) return 'lumbar'
    return 'lumbar'
  }

  // Push
  if (name.includes('push-up') || name.includes('push up') || name.includes('dip') ||
      name.includes('pike') || name.includes('hspu')) return 'push'

  // Pull
  if (name.includes('pull-up') || name.includes('pull up') || name.includes('chin-up') ||
      name.includes('row') || name.includes('face pull') || name.includes('retracción') ||
      name.includes('australian') || name.includes('renegade') || name.includes('inverted')) return 'pull'

  // Legs
  if (name.includes('squat') || name.includes('lunge') || name.includes('bulgarian') ||
      name.includes('pistol') || name.includes('nordic') || name.includes('step-up') ||
      name.includes('calf') || name.includes('wall sit') || name.includes('jump squat') ||
      name.includes('box jump') || name.includes('shrimp') || name.includes('good morning') ||
      dayType === 'legs') return 'legs'

  // Full body
  if (name.includes('burpee') || dayType === 'full') return 'full'

  return dayType || 'full'
}

function extractExercisesFromWorkouts(): CatalogExercise[] {
  const seen = new Map<string, CatalogExercise>()

  for (const [_key, workout] of Object.entries(WORKOUTS)) {
    const dayType = workout.day === 'lun' ? 'push'
      : workout.day === 'mar' ? 'pull'
      : workout.day === 'mie' ? 'lumbar'
      : workout.day === 'jue' ? 'legs'
      : 'full'

    for (const ex of workout.exercises) {
      if (seen.has(ex.id)) continue
      seen.set(ex.id, {
        id: ex.id,
        slug: ex.id,
        name: ex.name,
        muscles: ex.muscles,
        category: inferCategory(ex, dayType),
        priority: ex.priority,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        note: ex.note,
        youtube: ex.youtube,
        isTimer: ex.isTimer,
        timerSeconds: ex.timerSeconds,
        demoImages: ex.demoImages,
        demoVideo: ex.demoVideo,
      })
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function mapPBRecord(rec: any): CatalogExercise {
  return {
    id: rec.id,
    slug: rec.slug || rec.id,
    name: rec.name,
    muscles: rec.muscles || '',
    category: rec.category || 'full',
    priority: rec.priority || 'med',
    sets: rec.default_sets ?? 3,
    reps: rec.default_reps || '8-12',
    rest: rec.default_rest ?? 90,
    note: rec.note || rec.description || '',
    youtube: rec.youtube || '',
    isTimer: rec.is_timer || false,
    timerSeconds: rec.timer_seconds,
    demoImages: rec.default_images ? (Array.isArray(rec.default_images) ? rec.default_images : [rec.default_images]) : undefined,
    demoVideo: rec.demo_video,
  }
}

// ── Search icon ──────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="15" y2="15" />
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExerciseLibraryPage() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<CatalogExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryId>('todos')
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null)

  // Fetch from PB, fallback to hardcoded
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const available = await isPocketBaseAvailable()
        if (available && !cancelled) {
          try {
            const res = await pb.collection('exercises_catalog').getList(1, 200, { sort: 'name' })
            if (!cancelled && res.items.length > 0) {
              setExercises(res.items.map(mapPBRecord))
              setLoading(false)
              return
            }
          } catch {
            // Collection might not exist, fall through to hardcoded
          }
        }
      } catch {
        // PB not available
      }

      if (!cancelled) {
        setExercises(extractExercisesFromWorkouts())
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Filtered exercises
  const filtered = useMemo(() => {
    let result = exercises

    // Category filter
    if (activeCategory !== 'todos') {
      result = result.filter(ex => ex.category === activeCategory)
    }

    // Muscle group filter
    if (activeMuscle) {
      const muscle = activeMuscle.toLowerCase()
      result = result.filter(ex => ex.muscles.toLowerCase().includes(muscle))
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(ex =>
        ex.name.toLowerCase().includes(q) ||
        ex.muscles.toLowerCase().includes(q)
      )
    }

    return result
  }, [exercises, activeCategory, activeMuscle, search])

  const getCategoryStyle = (cat: string) =>
    CATEGORY_COLORS[cat] || { text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-bebas text-3xl tracking-wide">EJERCICIOS</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Cargando...' : `${filtered.length} de ${exercises.length} ejercicios`}
          </p>
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o m\u00FAsculo..."
          className="pl-10 h-10"
        />
      </div>

      {/* ── Category pills ──────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 border',
                isActive
                  ? cn(cat.bg, cat.color, 'border-current/20')
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
              )}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* ── Muscle group filter ──────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        <button
          onClick={() => setActiveMuscle(null)}
          className={cn(
            'px-2 py-1 rounded text-[10px] font-mono tracking-wide whitespace-nowrap transition-all duration-150',
            !activeMuscle
              ? 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          TODOS
        </button>
        {MUSCLE_GROUPS.map(muscle => (
          <button
            key={muscle}
            onClick={() => setActiveMuscle(activeMuscle === muscle ? null : muscle)}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-mono tracking-wide whitespace-nowrap transition-all duration-150',
              activeMuscle === muscle
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {muscle.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Loading state ───────────────────────────────────────────────── */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-4 w-3/4 mb-3" />
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-1/2 mb-3" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">&#x1F50D;</div>
          <p className="text-sm text-muted-foreground">No se encontraron ejercicios</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Prueba con otro filtro o b&uacute;squeda</p>
        </div>
      )}

      {/* ── Exercise grid ───────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(ex => {
            const catStyle = getCategoryStyle(ex.category)
            return (
              <button
                key={ex.id}
                onClick={() => navigate(`/exercises/${ex.slug || ex.id}`)}
                className="group text-left rounded-xl border border-border bg-card overflow-hidden hover:border-lime/30 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-lime/40"
              >
                {/* Thumbnail placeholder or image */}
                {ex.demoImages && ex.demoImages.length > 0 ? (
                  <div className="h-28 sm:h-32 bg-muted/30 overflow-hidden">
                    <img
                      src={ex.demoImages[0]}
                      alt={ex.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="h-20 sm:h-24 bg-muted/20 flex items-center justify-center">
                    <svg className="size-8 text-muted-foreground/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="8" width="4" height="8" rx="1" />
                      <rect x="17" y="8" width="4" height="8" rx="1" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                      <rect x="5" y="7" width="3" height="10" rx="1" />
                      <rect x="16" y="7" width="3" height="10" rx="1" />
                    </svg>
                  </div>
                )}

                <div className="p-3">
                  {/* Priority dot + Name */}
                  <div className="flex items-start gap-2 mb-1.5">
                    <div className={cn('size-2 rounded-full mt-1.5 flex-shrink-0', PRIORITY_DOT[ex.priority])} />
                    <span className="font-semibold text-[13px] leading-tight line-clamp-2 group-hover:text-lime transition-colors duration-150">
                      {ex.name}
                    </span>
                  </div>

                  {/* Muscles */}
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2 pl-4">
                    {ex.muscles}
                  </p>

                  {/* Category badge + sets x reps */}
                  <div className="flex items-center justify-between gap-2 pl-4">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-1.5 py-0 font-mono tracking-wider border',
                        catStyle.text, catStyle.bg, catStyle.border
                      )}
                    >
                      {ex.category.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground/60">
                      {ex.sets} &times; {ex.reps}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
