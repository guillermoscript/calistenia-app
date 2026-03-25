import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS } from '../data/workouts'
import { SUPPLEMENTARY_EXERCISES } from '../data/supplementary-exercises'
import catalogData from '../data/exercise-catalog.json'
import { getExerciseEquipment, EQUIPMENT_CATALOG, getEquipmentLabel } from '../lib/equipment'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'
import { useActiveSession } from '../contexts/ActiveSessionContext'
import type { Exercise, Workout } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogExercise {
  id: string
  name: string
  muscles: string
  category: string
  sets: number | string
  reps: string
  rest: number
  note: string
  youtube: string
  priority: 'high' | 'med' | 'low'
  isTimer?: boolean
  timerSeconds?: number
  demoImages?: string[]
  demoVideo?: string
}

type CategoryId = 'todos' | 'push' | 'pull' | 'legs' | 'core' | 'lumbar' | 'full' | 'movilidad' | 'skill'

const CATEGORIES: { id: CategoryId; label: string; accent: string }[] = [
  { id: 'todos',     label: 'Todos',     accent: 'text-foreground' },
  { id: 'push',      label: 'Push',      accent: 'text-lime' },
  { id: 'pull',      label: 'Pull',      accent: 'text-sky-500' },
  { id: 'legs',      label: 'Legs',      accent: 'text-pink-500' },
  { id: 'core',      label: 'Core',      accent: 'text-amber-400' },
  { id: 'lumbar',    label: 'Lumbar',     accent: 'text-red-500' },
  { id: 'full',      label: 'Full',      accent: 'text-amber-400' },
  { id: 'movilidad', label: 'Movilidad', accent: 'text-emerald-400' },
  { id: 'skill',     label: 'Skill',     accent: 'text-violet-400' },
]

const CAT_BORDER: Record<string, string> = {
  push: 'border-l-lime', pull: 'border-l-sky-500', legs: 'border-l-pink-500',
  core: 'border-l-amber-400', lumbar: 'border-l-red-500', full: 'border-l-amber-400',
  movilidad: 'border-l-emerald-400', skill: 'border-l-violet-400',
}

const CAT_TEXT: Record<string, string> = {
  push: 'text-lime', pull: 'text-sky-500', legs: 'text-pink-500',
  core: 'text-amber-400', lumbar: 'text-red-500', full: 'text-amber-400',
  movilidad: 'text-emerald-400', skill: 'text-violet-400',
}

const STORAGE_KEY = 'calistenia_free_session_queue'

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferCategory(exercise: { name: string; muscles: string; note: string }, dayType: string): string {
  const name = exercise.name.toLowerCase()
  const muscles = exercise.muscles.toLowerCase()
  const note = exercise.note.toLowerCase()

  if (name.includes('handstand') || name.includes('l-sit') || name.includes('muscle-up') ||
      name.includes('front lever') || name.includes('back lever') || name.includes('planche') ||
      name.includes('human flag') || name.includes('skill')) return 'skill'
  if (name.includes('stretch') || name.includes('yoga') || name.includes('mobility') ||
      name.includes('movilidad') || name.includes('cat-cow') || name.includes('pigeon') ||
      name.includes('thoracic') || name.includes('cossack') || name.includes('90/90')) return 'movilidad'
  if (muscles.includes('core') || name.includes('hollow') || name.includes('plank') ||
      name.includes('dead bug') || name.includes('side plank')) return 'core'
  if (dayType === 'lumbar' || name.includes('bird-dog') || name.includes('superman') ||
      name.includes('glute bridge') || note.includes('lumbar')) return 'lumbar'
  if (name.includes('push-up') || name.includes('push up') || name.includes('dip') ||
      name.includes('pike') || name.includes('hspu')) return 'push'
  if (name.includes('pull-up') || name.includes('pull up') || name.includes('chin-up') ||
      name.includes('row') || name.includes('face pull') || name.includes('australian') ||
      name.includes('inverted')) return 'pull'
  if (name.includes('squat') || name.includes('lunge') || name.includes('bulgarian') ||
      name.includes('pistol') || name.includes('nordic') || name.includes('step-up') ||
      name.includes('calf') || name.includes('wall sit') || name.includes('jump squat') ||
      name.includes('box jump') || name.includes('good morning') ||
      dayType === 'legs') return 'legs'
  if (name.includes('burpee') || dayType === 'full') return 'full'
  return dayType || 'full'
}

function extractExercisesFromWorkouts(): CatalogExercise[] {
  const seen = new Map<string, CatalogExercise>()
  for (const [, workout] of Object.entries(WORKOUTS)) {
    const dayType = workout.day === 'lun' ? 'push'
      : workout.day === 'mar' ? 'pull'
      : workout.day === 'mie' ? 'lumbar'
      : workout.day === 'jue' ? 'legs'
      : 'full'
    for (const ex of workout.exercises) {
      if (seen.has(ex.id)) continue
      seen.set(ex.id, {
        id: ex.id, name: ex.name, muscles: ex.muscles,
        category: inferCategory(ex, dayType), priority: ex.priority,
        sets: ex.sets, reps: ex.reps, rest: ex.rest,
        note: ex.note, youtube: ex.youtube,
        isTimer: ex.isTimer, timerSeconds: ex.timerSeconds,
        demoImages: ex.demoImages, demoVideo: ex.demoVideo,
      })
    }
  }
  // Add supplementary exercises
  for (const ex of SUPPLEMENTARY_EXERCISES) {
    if (seen.has(ex.id)) continue
    seen.set(ex.id, {
      id: ex.id, name: ex.name, muscles: ex.muscles,
      category: ex.category, priority: ex.priority,
      sets: ex.sets, reps: ex.reps, rest: ex.rest,
      note: ex.note, youtube: ex.youtube,
      isTimer: ex.isTimer, timerSeconds: ex.timerSeconds,
    })
  }

  // Add exercises from master catalog JSON
  const catalogCategories = (catalogData as any).categories || {}
  for (const catData of Object.values(catalogCategories) as any[]) {
    for (const ex of catData.exercises || []) {
      if (seen.has(ex.id)) continue
      seen.set(ex.id, {
        id: ex.id, name: ex.name, muscles: ex.muscles || '',
        category: ex.category || 'full', priority: ex.priority || 'med',
        sets: ex.sets ?? 3, reps: ex.reps || '8-12', rest: ex.rest ?? 60,
        note: ex.note || '', youtube: ex.youtube_query || '',
        isTimer: ex.isTimer || false, timerSeconds: ex.timerSeconds,
        demoImages: ex.images?.length ? ex.images : undefined,
      })
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function mapPBRecord(rec: any): CatalogExercise {
  return {
    id: rec.id ?? '', name: rec.name ?? 'Sin nombre', muscles: rec.muscles ?? '',
    category: rec.category || 'full', priority: rec.priority || 'med',
    sets: rec.default_sets ?? 3, reps: rec.default_reps || '8-12',
    rest: rec.default_rest ?? 90, note: rec.note || rec.description || '',
    youtube: rec.youtube || '',
    isTimer: rec.is_timer || false, timerSeconds: rec.timer_seconds,
    demoImages: rec.default_images ? (Array.isArray(rec.default_images) ? rec.default_images : [rec.default_images]) : undefined,
    demoVideo: rec.demo_video,
  }
}

function catalogToExercise(cat: CatalogExercise): Exercise {
  return {
    id: cat.id, name: cat.name, sets: cat.sets, reps: cat.reps,
    rest: cat.rest, muscles: cat.muscles, note: cat.note,
    youtube: cat.youtube, priority: cat.priority,
    isTimer: cat.isTimer, timerSeconds: cat.timerSeconds,
    demoImages: cat.demoImages, demoVideo: cat.demoVideo,
  }
}

function estimateDuration(exercises: CatalogExercise[]): number {
  let totalSecs = 0
  for (const ex of exercises) {
    const sets = typeof ex.sets === 'number' ? ex.sets : 3
    const secPerSet = 45
    totalSecs += sets * (secPerSet + ex.rest)
  }
  return Math.round(totalSecs / 60)
}

function loadSavedQueue(): CatalogExercise[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e: any) => e && typeof e.id === 'string' && typeof e.name === 'string')
  } catch {
    return []
  }
}

function saveQueue(selected: CatalogExercise[]) {
  try {
    if (selected.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selected))
    }
  } catch { /* storage full or unavailable */ }
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FreeSessionPage() {
  const { isActive: sessionActive, startSession: contextStartSession } = useActiveSession()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<CatalogExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryId>('todos')
  const [activeEquipment, setActiveEquipment] = useState<string | null>(null)
  const [selected, setSelected] = useState<CatalogExercise[]>(loadSavedQueue)
  const [queueOpen, setQueueOpen] = useState(false)
  const startingRef = useRef(false)

  const debouncedSearch = useDebounce(search, 200)

  // Persist queue to localStorage
  useEffect(() => { saveQueue(selected) }, [selected])

  // Close queue sheet when all exercises removed
  useEffect(() => {
    if (selected.length === 0) setQueueOpen(false)
  }, [selected.length])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadError(false)
      try {
        const available = await isPocketBaseAvailable()
        if (available && !cancelled) {
          try {
            const res = await pb.collection('exercises_catalog').getList(1, 200, { sort: 'name' })
            if (!cancelled && res.items.length > 0) {
              setCatalog(res.items.map(mapPBRecord))
              setLoading(false)
              return
            }
          } catch { /* fall through to hardcoded */ }
        }
      } catch { /* PB not available */ }
      if (!cancelled) {
        const fallback = extractExercisesFromWorkouts()
        if (fallback.length === 0) {
          setLoadError(true)
        }
        setCatalog(fallback)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let result = catalog
    if (activeCategory !== 'todos') result = result.filter(ex => ex.category === activeCategory)
    if (activeEquipment) {
      result = result.filter(ex => {
        const equipmentIds = getExerciseEquipment({ name: ex.name, note: ex.note })
        return equipmentIds.includes(activeEquipment)
      })
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(ex => ex.name.toLowerCase().includes(q) || ex.muscles.toLowerCase().includes(q))
    }
    return result
  }, [catalog, activeCategory, activeEquipment, debouncedSearch])

  const selectedIds = useMemo(() => new Set(selected.map(e => e.id)), [selected])
  const selectedOrder = useMemo(() => {
    const m = new Map<string, number>()
    selected.forEach((e, i) => m.set(e.id, i + 1))
    return m
  }, [selected])

  const toggleExercise = useCallback((ex: CatalogExercise) => {
    setSelected(prev => {
      const exists = prev.some(e => e.id === ex.id)
      return exists ? prev.filter(e => e.id !== ex.id) : [...prev, ex]
    })
  }, [])

  const moveUp = useCallback((idx: number) => {
    if (idx === 0) return
    setSelected(prev => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n })
  }, [])

  const moveDown = useCallback((idx: number) => {
    setSelected(prev => {
      if (idx >= prev.length - 1) return prev
      const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n
    })
  }, [])

  const removeExercise = useCallback((idx: number) => {
    setSelected(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const startSession = useCallback(() => {
    if (selected.length === 0 || startingRef.current) return
    startingRef.current = true
    const workout: Workout = {
      phase: 0, day: 'lun', title: 'Sesion Libre',
      exercises: selected.map(catalogToExercise),
    }
    contextStartSession(workout, `free_${Date.now()}`, 'free')
    navigate('/session')
    // Reset guard after a tick so re-entry from exit works
    setTimeout(() => { startingRef.current = false }, 100)
  }, [selected.length, contextStartSession, selected, navigate])

  const handleRetryLoad = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    setCatalog([])
    // Re-trigger the load effect
    const load = async () => {
      try {
        const available = await isPocketBaseAvailable()
        if (available) {
          const res = await pb.collection('exercises_catalog').getList(1, 200, { sort: 'name' })
          if (res.items.length > 0) {
            setCatalog(res.items.map(mapPBRecord))
            setLoading(false)
            return
          }
        }
      } catch { /* fall through */ }
      const fallback = extractExercisesFromWorkouts()
      if (fallback.length === 0) setLoadError(true)
      setCatalog(fallback)
      setLoading(false)
    }
    load()
  }, [])

  // ── Active session — show resume banner ────────────────────────────────

  const totalSets = selected.reduce((sum, ex) => sum + (typeof ex.sets === 'number' ? ex.sets : 3), 0)
  const estMin = estimateDuration(selected)

  // ── Builder UI ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 md:px-6 md:py-8">

      {/* ── Resume banner when session is minimized ────────────────────────── */}
      {sessionActive && (
        <button
          onClick={() => navigate('/session')}
          className="w-full mb-4 flex items-center gap-3 rounded-xl border border-lime/30 bg-lime/10 px-4 py-3 transition-all active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-lime/40"
        >
          <div className="relative flex-shrink-0">
            <div className="size-9 rounded-lg bg-lime/20 flex items-center justify-center">
              <svg className="size-4 text-lime" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </div>
            <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-lime opacity-75" />
              <span className="relative inline-flex rounded-full size-2.5 bg-lime" />
            </span>
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-lime">Sesion en curso</div>
            <div className="text-[10px] text-muted-foreground">Toca para retomar tu sesion</div>
          </div>
          <svg className="size-4 text-lime flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-7">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-1 uppercase">Modo libre</div>
        <h1 className="font-bebas text-[28px] md:text-[32px] tracking-wide leading-none">
          Arma tu sesion
        </h1>
      </div>

      {/* ── Two-column layout on desktop ────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:gap-6">

        {/* ── Left: Exercise catalog ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Search */}
          <div id="tour-free-search" className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="15" y2="15" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre o musculo..."
              aria-label="Buscar ejercicios"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={cn(
                'w-full pl-9 py-2.5 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime/50 focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors',
                search ? 'pr-14' : 'pr-3',
              )}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Borrar busqueda"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs px-2.5 py-2 min-h-[44px] flex items-center"
              >
                borrar
              </button>
            )}
          </div>

          {/* Category filter */}
          <div id="tour-free-categories" className="relative mb-5 md:mb-4"
            style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)' }}
          >
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none md:flex-wrap md:overflow-visible md:pb-0 md:[mask-image:none]" role="group" aria-label="Filtrar por categoria">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={activeCategory === cat.id}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-md text-[11px] tracking-wide font-medium transition-all duration-200 border focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                    activeCategory === cat.id
                      ? cn(cat.accent, 'border-current bg-accent/50')
                      : 'text-muted-foreground border-transparent hover:text-foreground',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equipment filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 scrollbar-none">
            {EQUIPMENT_CATALOG.filter(e => e.id !== 'ninguno').map(eq => {
              const isActive = activeEquipment === eq.id
              return (
                <button
                  key={eq.id}
                  onClick={() => setActiveEquipment(isActive ? null : eq.id)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-md text-[11px] tracking-wide font-medium transition-all duration-200 border',
                    isActive
                      ? 'text-amber-400 border-amber-400/30 bg-amber-500/10'
                      : 'text-muted-foreground border-transparent hover:text-foreground',
                  )}
                >
                  {eq.icon} {eq.label}
                </button>
              )
            })}
            {activeEquipment && (
              <button
                onClick={() => setActiveEquipment(null)}
                className="shrink-0 px-2 py-1.5 rounded-md text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
              >
                limpiar
              </button>
            )}
          </div>

          {/* Exercise list */}
          {loading ? (
            <Loader label="Cargando catálogo..." className="py-16" />
          ) : loadError && catalog.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="text-muted-foreground text-sm">No se pudo cargar el catalogo</div>
              <Button variant="outline" size="sm" onClick={handleRetryLoad}>
                Reintentar
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-muted-foreground text-sm">
                {search ? `Sin resultados para "${search}"` : 'No hay ejercicios en esta categoria'}
              </div>
              {search && (
                <button onClick={() => setSearch('')} className="mt-2 text-xs text-lime hover:text-lime/80">
                  Borrar busqueda
                </button>
              )}
            </div>
          ) : (
            <div id="tour-free-catalog" className="space-y-1" role="list" aria-label="Catalogo de ejercicios">
              {filtered.map(ex => {
                const isSelected = selectedIds.has(ex.id)
                const orderNum = selectedOrder.get(ex.id) ?? 0
                return (
                  <button
                    key={ex.id}
                    role="listitem"
                    onClick={() => toggleExercise(ex)}
                    aria-pressed={isSelected}
                    className={cn(
                      'w-full text-left flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-lime/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      isSelected
                        ? 'bg-lime/5 border-l-lime'
                        : cn('bg-card hover:bg-accent/30', CAT_BORDER[ex.category] || 'border-l-transparent'),
                    )}
                  >
                    {/* Selection state */}
                    <div className={cn(
                      'size-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-mono font-bold transition-all duration-200',
                      isSelected
                        ? 'bg-lime text-lime-foreground'
                        : 'bg-muted/50 text-muted-foreground',
                    )}>
                      {isSelected ? orderNum : '+'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate leading-tight">{ex.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground truncate">{ex.muscles || 'General'}</span>
                        <span className="text-[10px] text-muted-foreground/40">·</span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{ex.sets}×{ex.reps}</span>
                      </div>
                    </div>

                    <span className={cn('text-[9px] font-mono tracking-wider uppercase shrink-0', CAT_TEXT[ex.category] || 'text-muted-foreground')}>
                      {ex.category}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right: Session queue (desktop sidebar) ─────────────────────── */}
        <div className="hidden lg:block w-[280px] shrink-0">
          <div className="sticky top-16">
            <SessionQueue
              selected={selected}
              totalSets={totalSets}
              estMin={estMin}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onRemove={removeExercise}
              onStart={startSession}
              onClear={() => setSelected([])}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile: floating bar + bottom sheet ─────────────────────────────── */}
      <div className="lg:hidden">
        {/* Floating bottom bar */}
        <div id="tour-free-bar" className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button
              onClick={() => selected.length > 0 && setQueueOpen(!queueOpen)}
              aria-label={selected.length > 0 ? `Ver ${selected.length} ejercicios seleccionados` : 'Ningun ejercicio seleccionado'}
              aria-expanded={queueOpen}
              className="flex-1 flex items-center gap-2.5 min-w-0"
            >
              <div className={cn(
                'size-8 rounded-lg flex items-center justify-center font-bebas text-lg transition-colors',
                selected.length > 0 ? 'bg-lime/15 text-lime' : 'bg-muted text-muted-foreground',
              )}>
                {selected.length}
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs font-medium truncate">
                  {selected.length === 0
                    ? 'Ningun ejercicio'
                    : `${selected.length} ejercicio${selected.length > 1 ? 's' : ''}`}
                </div>
                {selected.length > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    {totalSets} series · ~{estMin} min
                  </div>
                )}
              </div>
              {selected.length > 0 && (
                <svg className={cn('size-4 text-muted-foreground transition-transform ml-auto', queueOpen && 'rotate-180')} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4,6 8,10 12,6" />
                </svg>
              )}
            </button>
            <Button
              onClick={startSession}
              disabled={selected.length === 0}
              size="sm"
              className={cn(
                'font-bebas text-base tracking-wide px-5 transition-all',
                selected.length > 0
                  ? 'bg-[hsl(var(--lime))] text-[hsl(var(--lime-foreground))] hover:bg-[hsl(var(--lime))]/90'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              Iniciar
            </Button>
          </div>
        </div>

        {/* Bottom sheet overlay */}
        {queueOpen && selected.length > 0 && (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <div
            onKeyDown={(e) => { if (e.key === 'Escape') setQueueOpen(false) }}
          >
            <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setQueueOpen(false)} aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Tu sesion de ejercicios"
              className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+3.25rem)] left-0 right-0 z-30 max-h-[60vh] overflow-y-auto rounded-t-xl border-t border-border bg-background px-4 py-4 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">Tu sesion</div>
                <button
                  onClick={() => { setSelected([]); setQueueOpen(false) }}
                  aria-label="Vaciar todos los ejercicios de la sesion"
                  className="text-[11px] text-red-400 hover:text-red-300"
                >
                  Vaciar
                </button>
              </div>
              <QueueList
                selected={selected}
                onMoveUp={moveUp}
                onMoveDown={moveDown}
                onRemove={removeExercise}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Session Queue (desktop sidebar) ───────────────────────────────────────────

function SessionQueue({
  selected, totalSets, estMin,
  onMoveUp, onMoveDown, onRemove, onStart, onClear,
}: {
  selected: CatalogExercise[]
  totalSets: number
  estMin: number
  onMoveUp: (i: number) => void
  onMoveDown: (i: number) => void
  onRemove: (i: number) => void
  onStart: () => void
  onClear: () => void
}) {
  if (selected.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <div className="font-bebas text-lg tracking-wide text-muted-foreground/60 mb-2">Tu sesion</div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Selecciona ejercicios del catalogo para armar tu rutina personalizada
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="size-2 rounded-full bg-border" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">Tu sesion</div>
          <button
            onClick={onClear}
            aria-label="Vaciar todos los ejercicios de la sesion"
            className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
          >
            Vaciar
          </button>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-bebas text-2xl leading-none text-lime">{selected.length}</span>
          <span className="text-[10px] text-muted-foreground">
            ejercicio{selected.length !== 1 ? 's' : ''} · {totalSets} series · ~{estMin} min
          </span>
        </div>
      </div>

      {/* Exercise list */}
      <div className="px-2 py-2 max-h-[calc(100vh-320px)] overflow-y-auto">
        <QueueList
          selected={selected}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
        />
      </div>

      {/* Start button */}
      <div className="p-3 border-t border-border">
        <Button
          onClick={onStart}
          className="w-full font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] text-[hsl(var(--lime-foreground))] hover:bg-[hsl(var(--lime))]/90"
        >
          Iniciar sesion
        </Button>
      </div>
    </div>
  )
}

// ── Queue List (shared between mobile sheet and desktop sidebar) ──────────────

const QueueList = memo(function QueueList({
  selected, onMoveUp, onMoveDown, onRemove,
}: {
  selected: CatalogExercise[]
  onMoveUp: (i: number) => void
  onMoveDown: (i: number) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="space-y-0.5" role="list" aria-label="Ejercicios en tu sesion">
      {selected.map((ex, idx) => (
        <div
          key={ex.id}
          role="listitem"
          className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/30 transition-colors group"
        >
          <span className="font-mono text-[10px] text-muted-foreground w-4 text-right shrink-0">{idx + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate leading-tight">{ex.name}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{ex.sets}×{ex.reps}</div>
          </div>
          <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp(idx) }}
              disabled={idx === 0}
              aria-label={`Mover ${ex.name} arriba`}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-accent disabled:opacity-20 transition-colors focus-visible:ring-2 focus-visible:ring-lime/40"
            >
              <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4,10 8,6 12,10" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown(idx) }}
              disabled={idx === selected.length - 1}
              aria-label={`Mover ${ex.name} abajo`}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-accent disabled:opacity-20 transition-colors focus-visible:ring-2 focus-visible:ring-lime/40"
            >
              <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4,6 8,10 12,6" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(idx) }}
              aria-label={`Eliminar ${ex.name}`}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors ml-0.5 focus-visible:ring-2 focus-visible:ring-red-500/40"
            >
              <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
})
