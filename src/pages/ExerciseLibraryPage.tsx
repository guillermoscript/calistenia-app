import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS } from '../data/workouts'
import { getExerciseEquipment, EQUIPMENT_CATALOG, getEquipmentLabel } from '../lib/equipment'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { useWgerSearch } from '../hooks/useWgerSearch'
import WgerResultCard from '../components/WgerResultCard'
import type { Exercise, Priority } from '../types'
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


// ── Component ────────────────────────────────────────────────────────────────

export default function ExerciseLibraryPage() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<CatalogExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryId>('todos')
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null)
  const [activeEquipment, setActiveEquipment] = useState<string | null>(null)
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set())

  const { wgerResults, wgerLoading, wgerError, searchWger: doWgerSearch, importExercise, importing, clearResults } = useWgerSearch()

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

    // Category filter
    if (activeCategory !== 'todos') {
      result = result.filter(ex => ex.category === activeCategory)
    }

    // Muscle group filter
    if (activeMuscle) {
      const muscle = activeMuscle.toLowerCase()
      result = result.filter(ex => ex.muscles.toLowerCase().includes(muscle))
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
  }, [exercises, activeCategory, activeMuscle, activeEquipment, search])

  const getCategoryStyle = (cat: string) =>
    CATEGORY_COLORS[cat] || { text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' }

  const hasActiveFilters = activeCategory !== 'todos' || activeMuscle !== null || activeEquipment !== null || search.trim() !== ''

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
        {hasActiveFilters && (
          <button
            onClick={() => { setActiveCategory('todos'); setActiveMuscle(null); setActiveEquipment(null); setSearch('') }}
            className="text-[11px] font-mono tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors uppercase"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {/* ── Category pills ──────────────────────────────────────────────── */}
      <div id="tour-category-filters" className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
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

      {/* ── Equipment filter ─────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
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

      {/* ── Muscle group filter ──────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-4 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
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
                {/* Thumbnail or placeholder */}
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
                  <div className="h-24 bg-muted/50 flex items-center justify-center">
                    <svg className="size-8 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="8" width="4" height="8" rx="1" />
                      <rect x="17" y="8" width="4" height="8" rx="1" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                      <rect x="5" y="7" width="3" height="10" rx="1" />
                      <rect x="16" y="7" width="3" height="10" rx="1" />
                    </svg>
                  </div>
                )}

                <div className="p-4">
                  {/* Priority dot + Name */}
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className={cn('size-2 rounded-full mt-1.5 flex-shrink-0', PRIORITY_DOT[ex.priority])} />
                    <span className="font-bebas text-lg tracking-wide leading-tight line-clamp-2 group-hover:text-lime-400 transition-colors duration-150 uppercase">
                      {ex.name}
                    </span>
                  </div>

                  {/* Muscles dot-separated */}
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-3 pl-[18px]">
                    {muscleList.join(' · ')}
                  </p>

                  {/* Category badge + sets x reps */}
                  <div className="flex items-center justify-between gap-2 pl-[18px]">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-2 py-0.5 font-mono tracking-widest border',
                        catStyle.text, catStyle.bg, catStyle.border
                      )}
                    >
                      {ex.category.toUpperCase()}
                    </Badge>
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
