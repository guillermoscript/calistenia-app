import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS } from '../data/workouts'
import { useProgressions } from '../hooks/useProgressions'
import { detectEquipment } from '../lib/equipment'
import { calculateWorkoutDuration } from '../lib/duration'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
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
  description?: string
}

interface RelatedProgram {
  id: string
  name: string
  phase: number
  day: string
  title: string
}

// ── Constants ────────────────────────────────────────────────────────────────

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

const PRIORITY_COLORS: Record<Priority, { text: string; bg: string; border: string }> = {
  high: { text: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20' },
  med:  { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  low:  { text: 'text-sky-400',   bg: 'bg-sky-500/10',   border: 'border-sky-500/20' },
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Prioritario',
  med:  'Importante',
  low:  'Complementario',
}

const CATEGORY_LABEL: Record<string, string> = {
  push: 'Empuje',
  pull: 'Tiron',
  legs: 'Piernas',
  core: 'Core',
  lumbar: 'Lumbar',
  full: 'Full Body',
  movilidad: 'Movilidad',
  skill: 'Skill',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferCategory(exercise: Exercise, dayType: string): string {
  const name = exercise.name.toLowerCase()
  const muscles = exercise.muscles.toLowerCase()

  if (name.includes('handstand') || name.includes('l-sit') || name.includes('muscle-up') ||
      name.includes('front lever') || name.includes('back lever') || name.includes('planche') ||
      name.includes('human flag') || name.includes('skill')) return 'skill'
  if (name.includes('stretch') || name.includes('yoga') || name.includes('mobility') ||
      name.includes('cat-cow') || name.includes('pigeon') || name.includes('child') ||
      name.includes('forward fold') || name.includes('hip flexor') || name.includes('thoracic') ||
      name.includes('cossack') || name.includes('jefferson') || name.includes('90/90')) return 'movilidad'
  if (muscles.includes('core') || name.includes('hollow') || name.includes('plank') ||
      name.includes('dead bug') || name.includes('side plank')) return 'core'
  if (dayType === 'lumbar' || name.includes('bird-dog') || name.includes('superman') ||
      name.includes('glute bridge')) return 'lumbar'
  if (name.includes('push-up') || name.includes('push up') || name.includes('dip') ||
      name.includes('pike') || name.includes('hspu')) return 'push'
  if (name.includes('pull-up') || name.includes('pull up') || name.includes('chin-up') ||
      name.includes('row') || name.includes('face pull') || name.includes('retraccion') ||
      name.includes('australian') || name.includes('renegade') || name.includes('inverted')) return 'pull'
  if (name.includes('squat') || name.includes('lunge') || name.includes('bulgarian') ||
      name.includes('pistol') || name.includes('nordic') || name.includes('step-up') ||
      name.includes('calf') || name.includes('wall sit') || name.includes('jump squat') ||
      name.includes('box jump') || name.includes('shrimp') || name.includes('good morning') ||
      dayType === 'legs') return 'legs'
  if (name.includes('burpee') || dayType === 'full') return 'full'

  return dayType || 'full'
}

function findExerciseInWorkouts(idOrSlug: string): CatalogExercise | null {
  for (const [_key, workout] of Object.entries(WORKOUTS)) {
    const dayType = workout.day === 'lun' ? 'push'
      : workout.day === 'mar' ? 'pull'
      : workout.day === 'mie' ? 'lumbar'
      : workout.day === 'jue' ? 'legs'
      : 'full'

    for (const ex of workout.exercises) {
      if (ex.id === idOrSlug) {
        return {
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
          description: ex.note,
        }
      }
    }
  }
  return null
}

function findRelatedWorkouts(exerciseId: string): (RelatedProgram & { durationMin: number })[] {
  const results: (RelatedProgram & { durationMin: number })[] = []
  const DAY_NAMES: Record<string, string> = {
    lun: 'Lunes', mar: 'Martes', mie: 'Miercoles',
    jue: 'Jueves', vie: 'Viernes', sab: 'Sabado', dom: 'Domingo',
  }

  for (const [key, workout] of Object.entries(WORKOUTS)) {
    if (workout.exercises.some(ex => ex.id === exerciseId)) {
      results.push({
        id: key,
        name: `Fase ${workout.phase} — ${DAY_NAMES[workout.day] || workout.day}`,
        phase: workout.phase,
        day: workout.day,
        title: workout.title,
        durationMin: calculateWorkoutDuration(workout.exercises),
      })
    }
  }
  return results
}

function findSimilarExercises(exercise: CatalogExercise): CatalogExercise[] {
  const similar: CatalogExercise[] = []
  const seen = new Set<string>([exercise.id])

  for (const [_key, workout] of Object.entries(WORKOUTS)) {
    const dayType = workout.day === 'lun' ? 'push'
      : workout.day === 'mar' ? 'pull'
      : workout.day === 'mie' ? 'lumbar'
      : workout.day === 'jue' ? 'legs'
      : 'full'

    for (const ex of workout.exercises) {
      if (seen.has(ex.id)) continue
      const cat = inferCategory(ex, dayType)
      if (cat === exercise.category) {
        seen.add(ex.id)
        similar.push({
          id: ex.id,
          slug: ex.id,
          name: ex.name,
          muscles: ex.muscles,
          category: cat,
          priority: ex.priority,
          sets: ex.sets,
          reps: ex.reps,
          rest: ex.rest,
          note: ex.note,
          youtube: ex.youtube,
          isTimer: ex.isTimer,
          timerSeconds: ex.timerSeconds,
        })
      }
    }
  }

  return similar.slice(0, 6)
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
    note: rec.note || '',
    youtube: rec.youtube || '',
    isTimer: rec.is_timer || false,
    timerSeconds: rec.timer_seconds,
    demoImages: rec.default_images ? (Array.isArray(rec.default_images) ? rec.default_images : [rec.default_images]) : undefined,
    demoVideo: rec.demo_video,
    description: rec.description || rec.note || '',
  }
}

// ── Icons ────────────────────────────────────────────────────────────────────

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="14" y1="8" x2="2" y2="8" />
      <polyline points="6,4 2,8 6,12" />
    </svg>
  )
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 9v4a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h4" />
      <polyline points="8,2 14,2 14,8" />
      <line x1="14" y1="2" x2="7" y2="9" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="10,3 5,8 10,13" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="6,3 11,8 6,13" />
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [exercise, setExercise] = useState<CatalogExercise | null>(null)
  const [loading, setLoading] = useState(true)
  const [imageIndex, setImageIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('descripcion')
  const { getChainForExercise, loading: progressionsLoading } = useProgressions()

  // Fetch exercise
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setImageIndex(0)

    const load = async () => {
      // Try PB first
      try {
        const available = await isPocketBaseAvailable()
        if (available && !cancelled) {
          try {
            // Try by slug first, then by id
            const res = await pb.collection('exercises_catalog').getList(1, 1, {
              filter: pb.filter('slug = {:val} || id = {:val}', { val: id }),
            })
            if (!cancelled && res.items.length > 0) {
              setExercise(mapPBRecord(res.items[0]))
              setLoading(false)
              return
            }
          } catch {
            // Fall through
          }
        }
      } catch {
        // PB not available
      }

      // Fallback to workouts data
      if (!cancelled) {
        const found = findExerciseInWorkouts(id)
        setExercise(found)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  // Progression chain
  const chain = useMemo(() => {
    if (!exercise) return []
    return getChainForExercise(exercise.id)
  }, [exercise, getChainForExercise])

  const currentChainIdx = chain.findIndex(p => p.exerciseId === exercise?.id)

  // Related workouts and similar exercises
  const relatedWorkouts = useMemo(() => {
    if (!exercise) return []
    return findRelatedWorkouts(exercise.id)
  }, [exercise])

  const similarExercises = useMemo(() => {
    if (!exercise) return []
    return findSimilarExercises(exercise)
  }, [exercise])

  const catStyle = exercise ? (CATEGORY_COLORS[exercise.category] || { text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' }) : null
  const prioStyle = exercise ? PRIORITY_COLORS[exercise.priority] : null

  // Muscle list as array
  const muscleList = exercise?.muscles.split(',').map(m => m.trim()).filter(Boolean) || []

  // Equipment detection
  const equipment = useMemo(() => {
    if (!exercise) return []
    return detectEquipment({ name: exercise.name, note: exercise.note })
  }, [exercise])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <Skeleton className="h-6 w-24 mb-8" />
        <Skeleton className="h-14 w-2/3 mb-4" />
        <Skeleton className="h-4 w-1/2 mb-8" />
        <Skeleton className="h-56 w-full rounded-xl mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!exercise) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12 text-center py-24">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center">
          <svg className="size-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-lg font-bebas tracking-wide text-foreground mb-2 uppercase">Ejercicio no encontrado</p>
        <p className="text-sm text-muted-foreground mb-6">
          No se encontro un ejercicio con el identificador "{id}"
        </p>
        <Button
          variant="outline"
          onClick={() => navigate('/exercises')}
          className="gap-2 border-border hover:border-lime-400/40 hover:text-lime-400"
        >
          <ArrowLeftIcon className="size-4" />
          Volver a la biblioteca
        </Button>
      </div>
    )
  }

  const images = exercise.demoImages || []
  const hasImages = images.length > 0
  const hasVideo = !!exercise.demoVideo

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12 pb-16">
      {/* ── Back button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/exercises')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeftIcon className="size-4" />
        <span className="font-mono text-[11px] tracking-widest uppercase">Biblioteca</span>
      </button>

      {/* ── Hero section ────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start gap-6 mb-8">
        <div className="flex-1">
          {/* Category + Priority inline */}
          <div className="flex items-center gap-2 mb-3">
            {catStyle && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-2.5 py-0.5 font-mono tracking-widest border',
                  catStyle.text, catStyle.bg, catStyle.border
                )}
              >
                {(CATEGORY_LABEL[exercise.category] || exercise.category).toUpperCase()}
              </Badge>
            )}
            {prioStyle && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-2.5 py-0.5 font-mono tracking-widest border',
                  prioStyle.text, prioStyle.bg, prioStyle.border
                )}
              >
                {PRIORITY_LABEL[exercise.priority].toUpperCase()}
              </Badge>
            )}
            {exercise.isTimer && (
              <Badge
                variant="outline"
                className="text-[10px] px-2.5 py-0.5 font-mono tracking-widest border text-sky-400 bg-sky-500/10 border-sky-500/20"
              >
                TIMER {exercise.timerSeconds}S
              </Badge>
            )}
          </div>

          <h1 className="font-bebas text-4xl md:text-6xl leading-none tracking-wide mb-4 uppercase">
            {exercise.name}
          </h1>

          {/* Muscles dot-separated */}
          <p className="text-sm text-muted-foreground mb-6">
            {muscleList.join(' · ')}
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-400 border-border hover:border-red-500/30 hover:bg-red-500/5 font-mono text-[11px] tracking-widest"
              onClick={() => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.youtube || exercise.name + ' tutorial')}`, '_blank')}
            >
              <span className="text-sm">&#9654;</span>
              YOUTUBE
              <ExternalLinkIcon className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border text-muted-foreground hover:text-foreground font-mono text-[11px] tracking-widest"
              onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(exercise.name + ' ejercicio calistenia tutorial')}`, '_blank')}
            >
              GOOGLE
              <ExternalLinkIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Media - shown on right on desktop */}
        <div className="md:w-[320px] shrink-0">
          {hasImages ? (
            <div className="relative rounded-xl overflow-hidden bg-muted">
              <img
                src={images[imageIndex]}
                alt={`${exercise.name} - imagen ${imageIndex + 1}`}
                className="w-full h-56 md:h-64 object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setImageIndex(i => (i - 1 + images.length) % images.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <button
                    onClick={() => setImageIndex(i => (i + 1) % images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImageIndex(i)}
                        className={cn(
                          'size-2 rounded-full transition-all duration-200',
                          i === imageIndex ? 'bg-lime-400 scale-125' : 'bg-foreground/30'
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : hasVideo ? (
            <div className="rounded-xl overflow-hidden bg-muted">
              <video
                src={exercise.demoVideo}
                controls
                className="w-full h-56 md:h-64 object-cover"
                preload="metadata"
              />
            </div>
          ) : (
            <div className="rounded-xl bg-muted/50 h-48 flex items-center justify-center">
              <svg className="size-12 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="8" width="4" height="8" rx="1" />
                <rect x="17" y="8" width="4" height="8" rx="1" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <rect x="5" y="7" width="3" height="10" rx="1" />
                <rect x="16" y="7" width="3" height="10" rx="1" />
              </svg>
            </div>
          )}
          {/* Show video below images when both exist */}
          {hasImages && hasVideo && (
            <div className="rounded-xl overflow-hidden bg-muted mt-3">
              <video
                src={exercise.demoVideo}
                controls
                className="w-full h-48 object-cover"
                preload="metadata"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs section ─────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="bg-muted/80 border border-border p-1 gap-1 mb-6">
          <TabsTrigger value="descripcion" className="font-mono text-[11px] tracking-widest data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-400 uppercase px-4 py-2">
            Descripcion
          </TabsTrigger>
          <TabsTrigger value="musculos" className="font-mono text-[11px] tracking-widest data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-400 uppercase px-4 py-2">
            Musculos
          </TabsTrigger>
          <TabsTrigger value="material" className="font-mono text-[11px] tracking-widest data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-400 uppercase px-4 py-2">
            Material
          </TabsTrigger>
          <TabsTrigger value="config" className="font-mono text-[11px] tracking-widest data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-400 uppercase px-4 py-2">
            Config
          </TabsTrigger>
          {!progressionsLoading && chain.length > 0 && (
            <TabsTrigger value="progresion" className="font-mono text-[11px] tracking-widest data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-400 uppercase px-4 py-2">
              Progresion
            </TabsTrigger>
          )}
        </TabsList>

        {/* Description tab */}
        <TabsContent value="descripcion">
          {(exercise.description || exercise.note) ? (
            <div className="rounded-xl bg-muted/60 p-6">
              <p className="text-sm text-foreground leading-relaxed">
                {exercise.description || exercise.note}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/40 p-8 text-center">
              <p className="text-sm text-muted-foreground">Sin descripcion disponible</p>
            </div>
          )}
        </TabsContent>

        {/* Muscles tab */}
        <TabsContent value="musculos">
          <div className="rounded-xl bg-muted/60 p-6">
            <div className="flex flex-wrap gap-3">
              {muscleList.map((muscle, i) => (
                <div
                  key={i}
                  className="px-4 py-2.5 rounded-xl bg-muted/60 text-sm text-foreground font-medium"
                >
                  {muscle}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Material tab */}
        <TabsContent value="material">
          <div className="rounded-xl bg-muted/60 p-6">
            <div className="flex flex-wrap gap-3">
              {equipment.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    'px-4 py-2.5 rounded-xl text-sm font-medium',
                    item === 'Sin equipo'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-muted/60 text-foreground'
                  )}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Config tab */}
        <TabsContent value="config">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/60 p-5 text-center">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-2 uppercase">Series</div>
              <div className="text-2xl font-bebas text-lime-400">{exercise.sets}</div>
            </div>
            <div className="rounded-xl bg-muted/60 p-5 text-center">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-2 uppercase">Reps</div>
              <div className="text-2xl font-bebas text-lime-400">{exercise.reps}</div>
            </div>
            <div className="rounded-xl bg-muted/60 p-5 text-center">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-2 uppercase">Descanso</div>
              <div className="text-2xl font-bebas text-lime-400">{exercise.rest}s</div>
            </div>
            {exercise.isTimer && exercise.timerSeconds && (
              <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-5 text-center">
                <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-2 uppercase">Timer</div>
                <div className="text-2xl font-bebas text-sky-400">{exercise.timerSeconds}s</div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Progression tab */}
        {!progressionsLoading && chain.length > 0 && (
          <TabsContent value="progresion">
            <div className="rounded-xl bg-muted/60 p-6">
              <div className="overflow-x-auto -mx-6 px-6 pb-2">
                <div className="flex items-center gap-1.5 min-w-max py-2">
                  {chain.map((prog, i) => {
                    const isCurrent = prog.exerciseId === exercise.id
                    const isPast = currentChainIdx >= 0 && i < currentChainIdx
                    const isFuture = currentChainIdx >= 0 && i > currentChainIdx

                    return (
                      <div key={prog.exerciseId} className="flex items-center gap-1.5">
                        <Link
                          to={`/exercises/${prog.exerciseId}`}
                          className={cn(
                            'relative px-3 py-2 rounded-lg border text-center transition-all duration-200 min-w-[90px] max-w-[120px]',
                            'hover:brightness-110',
                            isCurrent && 'border-lime-400 bg-lime-400/10 shadow-[0_0_8px_rgba(200,245,66,0.15)]',
                            isPast && 'border-emerald-500/30 bg-emerald-500/5',
                            isFuture && 'border-border bg-muted/30',
                          )}
                        >
                          <div className={cn(
                            'text-[9px] font-mono tracking-widest mb-1',
                            isCurrent ? 'text-lime-400' : isPast ? 'text-emerald-500/60' : 'text-muted-foreground/60',
                          )}>
                            LV.{prog.difficultyOrder}
                          </div>
                          <div className={cn(
                            'text-[11px] font-medium leading-tight',
                            isCurrent ? 'text-foreground' : isPast ? 'text-emerald-500/70' : 'text-muted-foreground/60',
                          )}>
                            {prog.exerciseName}
                          </div>
                          {isCurrent && (
                            <div className="text-[8px] font-mono text-lime-400 tracking-widest mt-1">ACTUAL</div>
                          )}
                        </Link>
                        {i < chain.length - 1 && (
                          <span className={cn(
                            'text-[14px] flex-shrink-0',
                            i < currentChainIdx ? 'text-emerald-500/40' : 'text-muted-foreground/50',
                          )}>
                            &rarr;
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {currentChainIdx >= 0 && chain[currentChainIdx] && (
                <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-4 py-3 mt-4 border-l-2 border-lime-400/20">
                  <span className="font-mono text-lime-400">{chain[currentChainIdx].targetRepsToAdvance} reps</span>
                  {' '}en{' '}
                  <span className="font-mono text-lime-400">{chain[currentChainIdx].sessionsAtTarget} sesiones</span>
                  {' '}consecutivas para avanzar
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div className="h-px bg-muted/60 my-8" />

      {/* ── Related workouts ────────────────────────────────────────────── */}
      {relatedWorkouts.length > 0 && (
        <div className="mb-10">
          <h2 className="font-bebas text-2xl tracking-widest mb-5 uppercase">Sesiones</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedWorkouts.map(w => (
              <div
                key={w.id}
                className="flex items-center gap-4 px-4 py-4 rounded-xl bg-muted/60 hover:bg-muted/60 transition-colors"
              >
                <div className="size-10 rounded-lg bg-lime-400/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bebas text-lime-400 tracking-wide">F{w.phase}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{w.name}</div>
                  <div className="text-[11px] text-muted-foreground">{w.title}</div>
                  {w.durationMin > 0 && (
                    <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">~{w.durationMin} min</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Similar exercises ───────────────────────────────────────────── */}
      {similarExercises.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bebas text-2xl tracking-widest mb-5 uppercase">Tambien te puede interesar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {similarExercises.map(sim => {
              const simCatStyle = CATEGORY_COLORS[sim.category] || { text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' }
              const simMuscles = sim.muscles.split(',').map(m => m.trim()).filter(Boolean)
              return (
                <Link
                  key={sim.id}
                  to={`/exercises/${sim.slug || sim.id}`}
                  className="group px-4 py-4 rounded-xl bg-muted/60 hover:bg-muted/60 transition-colors"
                >
                  <div className="font-bebas text-base tracking-wide leading-tight mb-1.5 group-hover:text-lime-400 transition-colors line-clamp-2 uppercase">
                    {sim.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1 mb-2.5">
                    {simMuscles.join(' · ')}
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[8px] px-2 py-0.5 font-mono tracking-widest border',
                        simCatStyle.text, simCatStyle.bg, simCatStyle.border
                      )}
                    >
                      {sim.category.toUpperCase()}
                    </Badge>
                    <span className="text-[11px] font-bebas text-lime-400 tracking-wide">
                      {sim.sets} x {sim.reps}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
