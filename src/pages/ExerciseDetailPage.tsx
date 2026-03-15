import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS } from '../data/workouts'
import { useProgressions } from '../hooks/useProgressions'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
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
  pull: 'Tir\u00F3n',
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
      name.includes('row') || name.includes('face pull') || name.includes('retracci\u00F3n') ||
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

function findRelatedWorkouts(exerciseId: string): RelatedProgram[] {
  const results: RelatedProgram[] = []
  const DAY_NAMES: Record<string, string> = {
    lun: 'Lunes', mar: 'Martes', mie: 'Mi\u00E9rcoles',
    jue: 'Jueves', vie: 'Viernes', sab: 'S\u00E1bado', dom: 'Domingo',
  }

  for (const [key, workout] of Object.entries(WORKOUTS)) {
    if (workout.exercises.some(ex => ex.id === exerciseId)) {
      results.push({
        id: key,
        name: `Fase ${workout.phase} \u2014 ${DAY_NAMES[workout.day] || workout.day}`,
        phase: workout.phase,
        day: workout.day,
        title: workout.title,
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
              filter: `slug = "${id}" || id = "${id}"`,
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

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-48 w-full rounded-xl mb-4" />
        <Skeleton className="h-6 w-64 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }

  if (!exercise) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto text-center py-20">
        <div className="text-4xl mb-4 opacity-30">&#x1F6AB;</div>
        <p className="text-lg font-semibold text-foreground mb-2">Ejercicio no encontrado</p>
        <p className="text-sm text-muted-foreground mb-6">
          No se encontr&oacute; un ejercicio con el identificador &ldquo;{id}&rdquo;
        </p>
        <Button
          variant="outline"
          onClick={() => navigate('/exercises')}
          className="gap-2"
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
    <div className="p-4 sm:p-6 max-w-3xl mx-auto pb-16">
      {/* ── Back button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/exercises')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeftIcon className="size-4" />
        <span>Biblioteca</span>
      </button>

      {/* ── Hero section ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="font-bebas text-3xl sm:text-4xl tracking-wide mb-3">
          {exercise.name}
        </h1>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Category badge */}
          {catStyle && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-2 py-0.5 font-mono tracking-wider border',
                catStyle.text, catStyle.bg, catStyle.border
              )}
            >
              {(CATEGORY_LABEL[exercise.category] || exercise.category).toUpperCase()}
            </Badge>
          )}

          {/* Priority badge */}
          {prioStyle && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-2 py-0.5 font-mono tracking-wider border',
                prioStyle.text, prioStyle.bg, prioStyle.border
              )}
            >
              {PRIORITY_LABEL[exercise.priority].toUpperCase()}
            </Badge>
          )}

          {/* Timer badge */}
          {exercise.isTimer && (
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0.5 font-mono tracking-wider border text-sky-400 bg-sky-500/10 border-sky-500/20"
            >
              TIMER {exercise.timerSeconds}S
            </Badge>
          )}

          {/* Muscle tags */}
          {muscleList.map((muscle, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="text-[10px] px-2 py-0.5"
            >
              {muscle}
            </Badge>
          ))}
        </div>
      </div>

      {/* ── Media section ───────────────────────────────────────────────── */}
      <div className="mb-6">
        {hasImages ? (
          <div className="relative rounded-xl overflow-hidden border border-border bg-muted/20">
            <img
              src={images[imageIndex]}
              alt={`${exercise.name} - imagen ${imageIndex + 1}`}
              className="w-full h-56 sm:h-72 object-cover"
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
                        i === imageIndex ? 'bg-lime scale-125' : 'bg-foreground/30'
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : hasVideo ? (
          <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
            <video
              src={exercise.demoVideo}
              controls
              className="w-full h-56 sm:h-72 object-cover"
              preload="metadata"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/10 h-40 sm:h-48 flex items-center justify-center">
            <div className="text-center">
              <svg className="size-12 text-muted-foreground/15 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="8" width="4" height="8" rx="1" />
                <rect x="17" y="8" width="4" height="8" rx="1" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <rect x="5" y="7" width="3" height="10" rx="1" />
                <rect x="16" y="7" width="3" height="10" rx="1" />
              </svg>
              <p className="text-xs text-muted-foreground/40">Sin media disponible</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-red-400 border-red-500/20 hover:bg-red-500/10"
          onClick={() => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.youtube || exercise.name + ' tutorial')}`, '_blank')}
        >
          <span className="text-sm">&#9654;</span>
          Ver en YouTube
          <ExternalLinkIcon className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(exercise.name + ' ejercicio calistenia tutorial')}`, '_blank')}
        >
          Ver en Google
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </div>

      {/* ── Description section ─────────────────────────────────────────── */}
      {(exercise.description || exercise.note) && (
        <Card className="mb-4">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-mono tracking-wide text-muted-foreground">
              DESCRIPCI&Oacute;N
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <p className="text-sm text-foreground leading-relaxed">
              {exercise.description || exercise.note}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Muscles section ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-mono tracking-wide text-muted-foreground">
            M&Uacute;SCULOS
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="flex flex-wrap gap-2">
            {muscleList.map((muscle, i) => (
              <div
                key={i}
                className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground"
              >
                {muscle}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Default config section ──────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-mono tracking-wide text-muted-foreground">
            CONFIGURACI&Oacute;N POR DEFECTO
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/20 rounded-lg p-3 text-center border border-border">
              <div className="text-xs text-muted-foreground font-mono tracking-wide mb-1">SERIES</div>
              <div className="text-lg font-bebas text-lime">{exercise.sets}</div>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center border border-border">
              <div className="text-xs text-muted-foreground font-mono tracking-wide mb-1">REPS</div>
              <div className="text-lg font-bebas text-lime">{exercise.reps}</div>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center border border-border">
              <div className="text-xs text-muted-foreground font-mono tracking-wide mb-1">DESCANSO</div>
              <div className="text-lg font-bebas text-lime">{exercise.rest}s</div>
            </div>
            {exercise.isTimer && exercise.timerSeconds && (
              <div className="bg-sky-500/5 rounded-lg p-3 text-center border border-sky-500/20">
                <div className="text-xs text-muted-foreground font-mono tracking-wide mb-1">TIMER</div>
                <div className="text-lg font-bebas text-sky-400">{exercise.timerSeconds}s</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Progression section ─────────────────────────────────────────── */}
      {!progressionsLoading && chain.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-mono tracking-wide text-muted-foreground">
              CADENA DE PROGRESI&Oacute;N
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="overflow-x-auto -mx-4 px-4 pb-2">
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
                          isCurrent && 'border-lime bg-lime/10 shadow-[0_0_8px_rgba(200,245,66,0.15)]',
                          isPast && 'border-emerald-500/30 bg-emerald-500/5',
                          isFuture && 'border-zinc-700/50 bg-zinc-800/30',
                        )}
                      >
                        <div className={cn(
                          'text-[9px] font-mono tracking-wider mb-1',
                          isCurrent ? 'text-lime' : isPast ? 'text-emerald-500/60' : 'text-muted-foreground/50',
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
                          <div className="text-[8px] font-mono text-lime tracking-widest mt-1">ACTUAL</div>
                        )}
                      </Link>
                      {i < chain.length - 1 && (
                        <span className={cn(
                          'text-[14px] flex-shrink-0',
                          i < currentChainIdx ? 'text-emerald-500/40' : 'text-muted-foreground/25',
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
              <div className="text-[11px] text-muted-foreground bg-muted/30 rounded px-3 py-2 mt-2 border-l-2 border-lime/20">
                <span className="font-mono text-lime">{chain[currentChainIdx].targetRepsToAdvance} reps</span>
                {' '}en{' '}
                <span className="font-mono text-lime">{chain[currentChainIdx].sessionsAtTarget} sesiones</span>
                {' '}consecutivas para avanzar
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Separator className="my-6" />

      {/* ── Related workouts ────────────────────────────────────────────── */}
      {relatedWorkouts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-mono tracking-wide text-muted-foreground mb-3">
            PROGRAMAS CON ESTE EJERCICIO
          </h2>
          <div className="grid gap-2">
            {relatedWorkouts.map(w => (
              <div
                key={w.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-lime/20 transition-colors"
              >
                <div className="size-8 rounded-md bg-lime/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bebas text-lime">F{w.phase}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground">{w.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Similar exercises ───────────────────────────────────────────── */}
      {similarExercises.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-mono tracking-wide text-muted-foreground mb-3">
            EJERCICIOS SIMILARES
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {similarExercises.map(sim => {
              const simCatStyle = CATEGORY_COLORS[sim.category] || { text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' }
              return (
                <Link
                  key={sim.id}
                  to={`/exercises/${sim.slug || sim.id}`}
                  className="group px-3 py-2.5 rounded-lg border border-border bg-card hover:border-lime/20 transition-colors"
                >
                  <div className="text-[13px] font-medium leading-tight mb-1 group-hover:text-lime transition-colors line-clamp-2">
                    {sim.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1 mb-1.5">
                    {sim.muscles}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[8px] px-1.5 py-0 font-mono tracking-wider border',
                      simCatStyle.text, simCatStyle.bg, simCatStyle.border
                    )}
                  >
                    {sim.category.toUpperCase()}
                  </Badge>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
