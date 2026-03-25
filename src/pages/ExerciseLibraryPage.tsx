import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS } from '../data/workouts'
import { SUPPLEMENTARY_EXERCISES } from '../data/supplementary-exercises'
import catalogData from '../data/exercise-catalog.json'
import { getExerciseEquipment, EQUIPMENT_CATALOG, getEquipmentLabel } from '../lib/equipment'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { useWorkout } from '../contexts/WorkoutContext'
import { useWgerSearch } from '../hooks/useWgerSearch'
import { useFavorites } from '../hooks/useFavorites'
import WgerResultCard from '../components/WgerResultCard'
import type { Exercise, Priority, DifficultyLevel } from '../types'
import { SearchIcon } from '../components/icons/nav-icons'

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
  difficulty?: DifficultyLevel
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

const DIFFICULTY_STYLE: Record<DifficultyLevel, { label: string; text: string; bg: string; border: string }> = {
  beginner:     { label: 'Principiante', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  intermediate: { label: 'Intermedio',   text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  advanced:     { label: 'Avanzado',     text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
}

const DEFAULT_MUSCLE_GROUPS = [
  'Pecho', 'Hombros', 'Triceps', 'Dorsal', 'Biceps', 'Core',
  'Cuadriceps', 'Gluteos', 'Isquios', 'Lumbar', 'Pantorrillas',
  'Deltoides', 'Psoas', 'Columna',
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
    if (muscles.includes('gluteo') || name.includes('glute bridge')) return 'lumbar'
    return 'lumbar'
  }

  // Push
  if (name.includes('push-up') || name.includes('push up') || name.includes('dip') ||
      name.includes('pike') || name.includes('hspu')) return 'push'

  // Pull
  if (name.includes('pull-up') || name.includes('pull up') || name.includes('chin-up') ||
      name.includes('row') || name.includes('face pull') || name.includes('retraccion') ||
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

function inferDifficulty(phase: number): DifficultyLevel {
  if (phase <= 1) return 'beginner'
  if (phase <= 2) return 'intermediate'
  return 'advanced'
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
        difficulty: ex.difficulty || inferDifficulty(workout.phase),
      })
    }
  }

  // Add supplementary exercises
  for (const ex of SUPPLEMENTARY_EXERCISES) {
    if (seen.has(ex.id)) continue
    seen.set(ex.id, {
      id: ex.id,
      slug: ex.id,
      name: ex.name,
      muscles: ex.muscles,
      category: ex.category,
      priority: ex.priority,
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      note: ex.note,
      youtube: ex.youtube,
      isTimer: ex.isTimer,
      timerSeconds: ex.timerSeconds,
      difficulty: ex.difficulty,
    })
  }

  // Add exercises from master catalog JSON (wger-sourced + any new)
  const catalogCategories = (catalogData as any).categories || {}
  for (const catData of Object.values(catalogCategories) as any[]) {
    for (const ex of catData.exercises || []) {
      if (seen.has(ex.id)) {
        // Enrich existing exercise with images/youtube from catalog
        const existing = seen.get(ex.id)!
        if (!existing.demoImages?.length && ex.images?.length) {
          existing.demoImages = ex.images
        }
        continue
      }
      seen.set(ex.id, {
        id: ex.id,
        slug: ex.id,
        name: ex.name,
        muscles: ex.muscles || '',
        category: ex.category || 'full',
        priority: ex.priority || 'med',
        sets: ex.sets ?? 3,
        reps: ex.reps || '8-12',
        rest: ex.rest ?? 60,
        note: ex.note || '',
        youtube: ex.youtube_query || '',
        isTimer: ex.isTimer || false,
        timerSeconds: ex.timerSeconds,
        demoImages: ex.images?.length ? ex.images : undefined,
        difficulty: ex.difficulty,
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
    difficulty: rec.difficulty_level || undefined,
  }
}


// ── Category placeholder icons ───────────────────────────────────────────────

function CategoryIcon({ category }: { category: string }) {
  const base = 'size-10 opacity-30'
  const color = CATEGORY_COLORS[category]?.text || 'text-muted-foreground'

  switch (category) {
    case 'push':
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 14l4-4 4 4" /><path d="M12 14l4-4 4 4" /><line x1="2" y1="18" x2="22" y2="18" />
        </svg>
      )
    case 'pull':
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="15" /><polyline points="8 11 12 15 16 11" /><line x1="4" y1="3" x2="20" y2="3" />
        </svg>
      )
    case 'legs':
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4v6l-2 8h-1" /><path d="M14 4v6l2 8h1" /><circle cx="12" cy="3" r="1" />
        </svg>
      )
    case 'core':
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="12" rx="4" ry="6" /><line x1="12" y1="6" x2="12" y2="18" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="16" y2="14" />
        </svg>
      )
    case 'lumbar':
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3c0 0-3 4-3 9s3 9 3 9" /><path d="M12 3c0 0 3 4 3 9s-3 9-3 9" />
        </svg>
      )
    case 'skill':
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.5 7H22l-6 4.5 2.5 7L12 16l-6.5 4.5 2.5-7L2 9h7.5z" />
        </svg>
      )
    case 'movilidad':
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2" /><path d="M8 22l2-7 2 3 2-3 2 7" /><path d="M6 12c2-1 4-2 6-2s4 1 6 2" />
        </svg>
      )
    default: // full body
      return (
        <svg className={cn(base, color)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4" r="2" /><path d="M12 6v5" /><path d="M8 8l4 3 4-3" /><path d="M10 11v5l-2 5" /><path d="M14 11v5l2 5" />
        </svg>
      )
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExerciseLibraryPage() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<CatalogExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryId>('todos')
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null)
  const [activeEquipment, setActiveEquipment] = useState<string | null>(null)
  const [activeDifficulty, setActiveDifficulty] = useState<DifficultyLevel | null>(null)
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set())
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  const { wgerResults, wgerLoading, wgerError, searchWger: doWgerSearch, importExercise, importing, clearResults } = useWgerSearch()
  const { favoriteIds, toggleFavorite, isFavorite, count: favCount } = useFavorites()

  // Collect exercise IDs from active program
  const { state, actions } = useWorkout()
  const programExerciseIds = useMemo(() => {
    const ids = new Set<string>()
    if (!state.activeProgram) return ids
    for (const phase of state.phases) {
      for (const day of state.weekDays) {
        const workout = actions.getWorkout(phase.id, day.id)
        if (workout) workout.exercises.forEach(ex => ids.add(ex.id))
      }
    }
    return ids
  }, [state.activeProgram, state.phases, state.weekDays, actions])

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

  // Extract unique muscle groups from all exercises
  const muscleGroups = useMemo(() => {
    if (exercises.length === 0) return DEFAULT_MUSCLE_GROUPS
    const allMuscles = new Set<string>()
    exercises.forEach(ex => {
      ex.muscles.split(',').forEach(m => {
        const trimmed = m.trim()
        if (trimmed) allMuscles.add(trimmed)
      })
    })
    // Sort and return unique muscles, but limit to most common ones
    const sorted = Array.from(allMuscles).sort((a, b) => a.localeCompare(b))
    return sorted.length > 0 ? sorted : DEFAULT_MUSCLE_GROUPS
  }, [exercises])

  // Filtered exercises
  const filtered = useMemo(() => {
    let result = exercises

    // Favorites filter
    if (showFavoritesOnly) {
      result = result.filter(ex => favoriteIds.has(ex.id))
    }

    // Category filter
    if (activeCategory !== 'todos') {
      result = result.filter(ex => ex.category === activeCategory)
    }

    // Muscle group filter
    if (activeMuscle) {
      const muscle = activeMuscle.toLowerCase()
      result = result.filter(ex => ex.muscles.toLowerCase().includes(muscle))
    }

    // Difficulty filter
    if (activeDifficulty) {
      result = result.filter(ex => ex.difficulty === activeDifficulty)
    }

    // Equipment filter
    if (activeEquipment) {
      result = result.filter(ex => {
        const equipmentIds = getExerciseEquipment({ name: ex.name, note: ex.note })
        return equipmentIds.includes(activeEquipment)
      })
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
  }, [exercises, showFavoritesOnly, favoriteIds, activeCategory, activeDifficulty, activeMuscle, activeEquipment, search])

  const getCategoryStyle = (cat: string) =>
    CATEGORY_COLORS[cat] || { text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' }

  const hasActiveFilters = showFavoritesOnly || activeCategory !== 'todos' || activeDifficulty !== null || activeMuscle !== null || activeEquipment !== null || search.trim() !== ''

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="font-bebas text-5xl md:text-7xl leading-none tracking-wide">EJERCICIOS</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono tracking-wide">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Cargando...
            </span>
          ) : `${filtered.length} ejercicio${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div id="tour-exercises-search" className="relative mb-6">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o musculo..."
          className="w-full h-12 pl-11 pr-4 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime-400/30 focus:ring-1 focus:ring-lime-400/20 transition-all text-sm"
        />
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">Filtros</span>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              onClick={() => { setShowFavoritesOnly(false); setActiveCategory('todos'); setActiveDifficulty(null); setActiveMuscle(null); setActiveEquipment(null); setSearch('') }}
              className="text-[11px] font-mono tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors uppercase"
            >
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* ── Category pills (always visible) + Favorites toggle ──────────── */}
      <div id="tour-category-filters" className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        <button
          onClick={() => setShowFavoritesOnly(v => !v)}
          className={cn(
            'px-3.5 py-2.5 rounded-full text-[11px] font-mono tracking-widest whitespace-nowrap transition-all duration-150 border uppercase flex items-center gap-1.5',
            showFavoritesOnly
              ? 'bg-amber-500/10 text-amber-400 border-amber-400/20'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
          )}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {favCount > 0 && favCount}
        </button>
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'px-4 py-2.5 rounded-full text-[11px] font-mono tracking-widest whitespace-nowrap transition-all duration-150 border uppercase',
                isActive
                  ? cn(cat.bg, cat.color, 'border-current/20')
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              )}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* ── Difficulty pills ──────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        {(['beginner', 'intermediate', 'advanced'] as DifficultyLevel[]).map(level => {
          const isActive = activeDifficulty === level
          const style = DIFFICULTY_STYLE[level]
          return (
            <button
              key={level}
              onClick={() => setActiveDifficulty(isActive ? null : level)}
              className={cn(
                'px-4 py-2.5 rounded-full text-[11px] font-mono tracking-widest whitespace-nowrap transition-all duration-150 border uppercase',
                isActive
                  ? cn(style.bg, style.text, style.border)
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              )}
            >
              {style.label}
            </button>
          )
        })}
      </div>

      {/* ── More filters toggle ────────────────────────────────────────── */}
      <button
        onClick={() => setShowMoreFilters(v => !v)}
        className={cn(
          'flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase mb-3 transition-colors',
          (activeMuscle || activeEquipment)
            ? 'text-lime'
            : 'text-muted-foreground/60 hover:text-muted-foreground'
        )}
      >
        <span>{showMoreFilters ? '▾' : '▸'} Equipo & musculo</span>
        {(activeMuscle || activeEquipment) && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-lime/10 text-lime border border-lime/20">
            {[activeEquipment && getEquipmentLabel(activeEquipment), activeMuscle].filter(Boolean).join(' + ')}
          </span>
        )}
      </button>

      {/* ── Equipment + Muscle filters (collapsible) ───────────────────── */}
      {showMoreFilters && (
        <div className="mb-4 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Equipment */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            {EQUIPMENT_CATALOG.filter(e => e.id !== 'ninguno').map(eq => {
              const isActive = activeEquipment === eq.id
              return (
                <button
                  key={eq.id}
                  onClick={() => setActiveEquipment(isActive ? null : eq.id)}
                  className={cn(
                    'px-4 py-2.5 rounded-full text-[11px] font-mono tracking-widest whitespace-nowrap transition-all duration-150 border uppercase',
                    isActive
                      ? 'bg-amber-500/10 text-amber-400 border-amber-400/20'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                  )}
                >
                  {eq.icon} {eq.label}
                </button>
              )
            })}
          </div>

          {/* Muscle groups */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <button
              onClick={() => setActiveMuscle(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-widest whitespace-nowrap transition-all duration-150 uppercase',
                !activeMuscle
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
              )}
            >
              TODOS
            </button>
            {muscleGroups.map(muscle => (
              <button
                key={muscle}
                onClick={() => setActiveMuscle(activeMuscle === muscle ? null : muscle)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-widest whitespace-nowrap transition-all duration-150 uppercase',
                  activeMuscle === muscle
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground/60 hover:text-muted-foreground'
                )}
              >
                {muscle.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Spacer when filters are collapsed */}
      {!showMoreFilters && <div className="mb-4" />}

      {/* ── Loading state ───────────────────────────────────────────────── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-muted p-5 animate-pulse">
              <div className="h-5 w-3/4 bg-muted rounded mb-3" />
              <div className="h-3 w-full bg-muted rounded mb-2" />
              <div className="h-3 w-1/2 bg-muted rounded mb-4" />
              <div className="h-5 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-24">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center">
            <SearchIcon className="size-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">No se encontraron ejercicios</p>
          <p className="text-xs text-muted-foreground/60 mb-6">Prueba con otro filtro o busqueda</p>
          {search.length >= 3 && (
            <button
              onClick={() => doWgerSearch(search)}
              disabled={wgerLoading}
              className="px-5 py-2.5 rounded-lg text-sm font-mono tracking-wide bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-all disabled:opacity-50"
            >
              {wgerLoading ? 'Buscando...' : 'Buscar en wger →'}
            </button>
          )}
        </div>
      )}

      {/* ── Exercise grid ───────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div id="tour-exercise-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(ex => {
            const catStyle = getCategoryStyle(ex.category)
            const muscleList = ex.muscles.split(',').map(m => m.trim()).filter(Boolean)
            return (
              <button
                key={ex.id}
                onClick={() => navigate(`/exercises/${ex.slug || ex.id}`)}
                className="group text-left rounded-xl bg-muted/80 overflow-hidden hover:bg-muted/80 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-lime-400/30"
              >
                {/* Thumbnail or category placeholder */}
                <div className="relative">
                  {ex.demoImages && ex.demoImages.length > 0 ? (
                    <div className="h-36 bg-muted overflow-hidden">
                      <img
                        src={ex.demoImages[0]}
                        alt={ex.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className={cn('h-24 flex items-center justify-center', catStyle.bg || 'bg-muted/50')}>
                      <CategoryIcon category={ex.category} />
                    </div>
                  )}
                  {/* Favorite star */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(ex.id) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleFavorite(ex.id) } }}
                    className={cn(
                      'absolute top-2 right-2 size-7 rounded-full flex items-center justify-center transition-all duration-150',
                      isFavorite(ex.id)
                        ? 'bg-amber-400/20 text-amber-400'
                        : 'bg-background/60 backdrop-blur text-muted-foreground/40 opacity-0 group-hover:opacity-100'
                    )}
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill={isFavorite(ex.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </span>
                </div>

                <div className="p-4">
                  {/* Priority dot + Name + Program badge */}
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className={cn('size-2 rounded-full mt-1.5 flex-shrink-0', PRIORITY_DOT[ex.priority])} />
                    <div className="flex-1 min-w-0">
                      <span className="font-bebas text-lg tracking-wide leading-tight line-clamp-2 group-hover:text-lime-400 transition-colors duration-150 uppercase">
                        {ex.name}
                      </span>
                      {programExerciseIds.has(ex.id) && (
                        <span className="inline-block ml-1.5 text-[8px] font-mono tracking-widest text-lime-400 bg-lime-500/10 border border-lime-500/20 rounded px-1.5 py-0.5 align-middle uppercase">
                          EN PROGRAMA
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Muscles dot-separated */}
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-3 pl-[18px]">
                    {muscleList.join(' · ')}
                  </p>

                  {/* Category badge + difficulty + sets x reps */}
                  <div className="flex items-center justify-between gap-2 pl-[18px]">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] px-2 py-0.5 font-mono tracking-widest border',
                          catStyle.text, catStyle.bg, catStyle.border
                        )}
                      >
                        {ex.category.toUpperCase()}
                      </Badge>
                      {ex.difficulty && DIFFICULTY_STYLE[ex.difficulty] && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] px-2 py-0.5 font-mono tracking-widest border',
                            DIFFICULTY_STYLE[ex.difficulty].text,
                            DIFFICULTY_STYLE[ex.difficulty].bg,
                            DIFFICULTY_STYLE[ex.difficulty].border
                          )}
                        >
                          {DIFFICULTY_STYLE[ex.difficulty].label.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] font-bebas text-lime-400 tracking-wide">
                      {ex.sets} x {ex.reps}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── "Search more" link when few local results ──────────────────── */}
      {!loading && filtered.length > 0 && filtered.length < 3 && search.length >= 3 && wgerResults.length === 0 && (
        <div className="text-center mt-6">
          <button
            onClick={() => doWgerSearch(search)}
            disabled={wgerLoading}
            className="text-xs font-mono tracking-wide text-sky-400/70 hover:text-sky-400 transition-colors disabled:opacity-50"
          >
            {wgerLoading ? 'Buscando...' : 'Buscar más en wger...'}
          </button>
        </div>
      )}

      {/* ── wger results ──────────────────────────────────────────────── */}
      {wgerResults.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tracking-widest text-sky-400 uppercase">Resultados de wger</span>
              <span className="text-[10px] text-muted-foreground">({wgerResults.length})</span>
            </div>
            <button
              onClick={clearResults}
              className="text-[10px] font-mono tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              CERRAR
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wgerResults.map(suggestion => (
              <WgerResultCard
                key={suggestion.data.id}
                suggestion={suggestion}
                onImport={async (wgerId) => {
                  try {
                    const recordId = await importExercise(wgerId)
                    setImportedIds(prev => new Set(prev).add(wgerId))
                    // Optimistic update: add to local exercises
                    try {
                      const rec = await pb.collection('exercises_catalog').getOne(recordId)
                      setExercises(prev => [...prev, mapPBRecord(rec)].sort((a, b) => a.name.localeCompare(b.name)))
                    } catch { /* Will show on next load */ }
                  } catch (err) {
                    console.error('Import failed:', err)
                  }
                }}
                importing={importing.has(suggestion.data.id)}
                imported={importedIds.has(suggestion.data.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── wger error ────────────────────────────────────────────────── */}
      {wgerError && wgerResults.length === 0 && !wgerLoading && (
        <div className="text-center mt-6">
          <p className="text-xs text-muted-foreground/60">{wgerError}</p>
        </div>
      )}
    </div>
  )
}
