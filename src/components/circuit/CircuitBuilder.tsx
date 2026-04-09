import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalize } from '../../hooks/useLocalize'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { pb, isPocketBaseAvailable } from '../../lib/pocketbase'
import { WORKOUTS } from '../../data/workouts'
import { localize } from '../../lib/i18n-db'
import type { CircuitDefinition, CircuitExercise } from '../../types'
import type { TranslatableField } from '../../lib/i18n-db'

// ── Catalog item (lightweight shape for the picker) ───────────────────────────

interface CatalogItem {
  exerciseId: string
  name: TranslatableField
  muscles: TranslatableField
  reps: string
}

/** Build a de-duplicated catalog from the hardcoded WORKOUTS map. */
function extractFallbackCatalog(): CatalogItem[] {
  const seen = new Set<string>()
  const items: CatalogItem[] = []
  Object.values(WORKOUTS).forEach((w) =>
    w.exercises.forEach((ex) => {
      if (seen.has(ex.id)) return
      seen.add(ex.id)
      items.push({
        exerciseId: ex.id,
        name: ex.name as TranslatableField,
        muscles: ex.muscles as TranslatableField,
        reps: ex.reps,
      })
    }),
  )
  return items.sort((a, b) =>
    localize(a.name, 'es').localeCompare(localize(b.name, 'es')),
  )
}

/** Hook that loads the exercise catalog once (PocketBase first, WORKOUTS fallback). */
function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const available = await isPocketBaseAvailable()
      if (available) {
        try {
          const res = await pb.collection('exercises_catalog').getList(1, 500, { sort: 'name' })
          if (!cancelled && res.items.length > 0) {
            setCatalog(
              res.items.map((r) => ({
                exerciseId: r.exercise_id || r.id,
                name: r.name as TranslatableField,
                muscles: (r.muscles ?? '') as TranslatableField,
                reps: r.reps ?? '10',
              })),
            )
            return
          }
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) setCatalog(extractFallbackCatalog())
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return catalog
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface CircuitBuilderProps {
  id?: string
  initialPreset?: Partial<CircuitDefinition>
  onStart: (circuit: CircuitDefinition) => void
}

// ── Number Stepper ─────────────────────────────────────────────────────────────

function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="flex items-center justify-center size-8 rounded-lg bg-muted/50 text-foreground active:bg-muted disabled:opacity-30"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <span className="w-12 text-center text-sm font-medium tabular-nums">
          {value}{suffix ? ` ${suffix}` : ''}
        </span>
        <button
          type="button"
          className="flex items-center justify-center size-8 rounded-lg bg-muted/50 text-foreground active:bg-muted disabled:opacity-30"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </button>
      </div>
    </div>
  )
}

// ── Exercise Card ──────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  index,
  total,
  mode,
  l,
  t,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  exercise: CircuitExercise
  index: number
  total: number
  mode: 'circuit' | 'timed'
  l: (field: TranslatableField | undefined | null) => string
  t: (key: string) => string
  onUpdate: (ex: CircuitExercise) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [showOverride, setShowOverride] = useState(
    !!(exercise.workSecondsOverride || exercise.restSecondsOverride),
  )

  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border">
      {/* Reorder arrows */}
      <div className="flex flex-col gap-0.5 pt-0.5">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-20"
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-20"
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label="Move down"
        >
          ▼
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate">{l(exercise.name)}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-red-400 text-xs ml-2"
            onClick={onRemove}
            aria-label="Remove"
          >
            ✕
          </button>
        </div>

        {mode === 'circuit' && (
          <input
            type="text"
            className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 focus:outline-none focus:border-lime/40 focus:ring-1 focus:ring-lime/20 placeholder:text-muted-foreground/40"
            placeholder={t('circuit.repsPlaceholder')}
            value={exercise.reps ?? ''}
            onChange={(e) => onUpdate({ ...exercise, reps: e.target.value })}
          />
        )}

        {mode === 'timed' && (
          <div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                className="accent-lime"
                checked={showOverride}
                onChange={(e) => {
                  setShowOverride(e.target.checked)
                  if (!e.target.checked) {
                    onUpdate({
                      ...exercise,
                      workSecondsOverride: undefined,
                      restSecondsOverride: undefined,
                    })
                  }
                }}
              />
              {t('circuit.overrideTimers')}
            </label>
            {showOverride && (
              <div className="mt-1.5 space-y-0.5">
                <NumberStepper
                  label={t('circuit.workTime')}
                  value={exercise.workSecondsOverride ?? 40}
                  onChange={(v) => onUpdate({ ...exercise, workSecondsOverride: v })}
                  min={5}
                  max={120}
                  step={5}
                  suffix="s"
                />
                <NumberStepper
                  label={t('circuit.restTime')}
                  value={exercise.restSecondsOverride ?? 20}
                  onChange={(v) => onUpdate({ ...exercise, restSecondsOverride: v })}
                  min={0}
                  max={60}
                  step={5}
                  suffix="s"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── CircuitBuilder ─────────────────────────────────────────────────────────────

export default function CircuitBuilder({ id, initialPreset, onStart }: CircuitBuilderProps) {
  const { t } = useTranslation()
  const l = useLocalize()
  const catalog = useCatalog()

  // State from initial preset
  const [mode, setMode] = useState<'circuit' | 'timed'>(initialPreset?.mode ?? 'circuit')
  const [rounds, setRounds] = useState(initialPreset?.rounds ?? 3)
  const [restBetweenExercises, setRestBetweenExercises] = useState(initialPreset?.restBetweenExercises ?? 0)
  const [restBetweenRounds, setRestBetweenRounds] = useState(initialPreset?.restBetweenRounds ?? 60)
  const [workSeconds, setWorkSeconds] = useState(initialPreset?.workSeconds ?? 40)
  const [restSeconds, setRestSeconds] = useState(initialPreset?.restSeconds ?? 20)
  const [exercises, setExercises] = useState<CircuitExercise[]>(initialPreset?.exercises ?? [])

  // ── Exercise search state ───────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const filteredCatalog = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return []
    const q = searchQuery.toLowerCase()
    return catalog
      .filter((ex) => l(ex.name).toLowerCase().includes(q) || l(ex.muscles).toLowerCase().includes(q))
      .slice(0, 6)
  }, [searchQuery, catalog, l])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Exercise list mutations ──────────────────────────────────────────────

  const addExerciseFromCatalog = useCallback(
    (item: CatalogItem) => {
      setExercises((prev) => [
        ...prev,
        {
          exerciseId: item.exerciseId,
          name: item.name,
          reps: mode === 'circuit' ? item.reps || '10' : undefined,
        },
      ])
    },
    [mode],
  )

  const addCustomExercise = useCallback(() => {
    const name = searchQuery.trim()
    if (!name) return
    const id = name.toLowerCase().replace(/\s+/g, '_')
    setExercises((prev) => [
      ...prev,
      { exerciseId: id, name: { es: name, en: name }, reps: mode === 'circuit' ? '10' : undefined },
    ])
    setSearchQuery('')
    setShowResults(false)
  }, [searchQuery, mode])

  const updateExercise = useCallback((index: number, ex: CircuitExercise) => {
    setExercises((prev) => prev.map((e, i) => (i === index ? ex : e)))
  }, [])

  const removeExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const moveExercise = useCallback((from: number, to: number) => {
    setExercises((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }, [])

  // ── Summary text ─────────────────────────────────────────────────────────

  const estimateMinutes = () => {
    if (exercises.length === 0) return 0
    if (mode === 'timed') {
      const perRound = exercises.length * (workSeconds + restSeconds) + restBetweenRounds
      return Math.round((perRound * rounds) / 60)
    }
    return null // circuit mode duration is not predictable
  }

  const summaryText = () => {
    const count = exercises.length
    if (count === 0) return t('circuit.addExercisesPrompt')
    const base = `${rounds} ${t('circuit.rounds')} × ${count} ${t('circuit.exercises')}`
    const mins = estimateMinutes()
    if (mins !== null && mins > 0) return `${base} ~ ${mins} min`
    return base
  }

  // ── Start handler ────────────────────────────────────────────────────────

  const handleStart = () => {
    const circuit: CircuitDefinition = {
      id: `circuit_${Date.now()}`,
      name: { es: 'Circuito personalizado', en: 'Custom circuit' },
      mode,
      exercises,
      rounds,
      restBetweenExercises: mode === 'circuit' ? restBetweenExercises : 0,
      restBetweenRounds,
      ...(mode === 'timed' ? { workSeconds, restSeconds } : {}),
    }
    onStart(circuit)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div id={id} className="space-y-5">
      {/* Mode selector */}
      <div id="tour-circuit-mode" className="flex gap-1 p-1 bg-muted/50 rounded-xl">
        {(['circuit', 'timed'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={cn(
              'flex-1 text-sm font-medium py-2 rounded-lg transition-colors',
              mode === m
                ? 'bg-lime/20 text-lime border border-lime/30'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setMode(m)}
          >
            {t(`circuit.mode_${m}`)}
          </button>
        ))}
      </div>

      {/* Config */}
      <div id="tour-circuit-config" className="p-3 rounded-xl bg-muted/20 border border-border space-y-0.5">
        <NumberStepper
          label={t('circuit.rounds')}
          value={rounds}
          onChange={setRounds}
          min={1}
          max={20}
        />
        {mode === 'circuit' && (
          <NumberStepper
            label={t('circuit.restBetweenExercises')}
            value={restBetweenExercises}
            onChange={setRestBetweenExercises}
            min={0}
            max={120}
            step={5}
            suffix="s"
          />
        )}
        <NumberStepper
          label={t('circuit.restBetweenRounds')}
          value={restBetweenRounds}
          onChange={setRestBetweenRounds}
          min={0}
          max={180}
          step={15}
          suffix="s"
        />
        {mode === 'timed' && (
          <>
            <NumberStepper
              label={t('circuit.workTime')}
              value={workSeconds}
              onChange={setWorkSeconds}
              min={10}
              max={120}
              step={5}
              suffix="s"
            />
            <NumberStepper
              label={t('circuit.restTime')}
              value={restSeconds}
              onChange={setRestSeconds}
              min={0}
              max={60}
              step={5}
              suffix="s"
            />
          </>
        )}
      </div>

      {/* Exercise list */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">{t('circuit.exerciseList')}</h3>
        {exercises.length === 0 && (
          <p className="text-xs text-muted-foreground/60 text-center py-4">
            {t('circuit.noExercisesYet')}
          </p>
        )}
        {exercises.map((ex, i) => (
          <ExerciseCard
            key={`${ex.exerciseId}-${i}`}
            exercise={ex}
            index={i}
            total={exercises.length}
            mode={mode}
            l={l}
            t={t}
            onUpdate={(updated) => updateExercise(i, updated)}
            onRemove={() => removeExercise(i)}
            onMoveUp={() => moveExercise(i, i - 1)}
            onMoveDown={() => moveExercise(i, i + 1)}
          />
        ))}
      </div>

      {/* Add exercise — search with catalog dropdown */}
      <div id="tour-circuit-add" ref={searchRef} className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 text-sm px-3 py-2 rounded-xl border border-border bg-muted/30 focus:outline-none focus:border-lime/40 focus:ring-1 focus:ring-lime/20 placeholder:text-muted-foreground/40"
            placeholder={t('circuit.exerciseNamePlaceholder')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowResults(true)
            }}
            onFocus={() => setShowResults(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomExercise()
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!searchQuery.trim()}
            onClick={addCustomExercise}
          >
            {t('circuit.add')}
          </Button>
        </div>

        {/* Catalog search results dropdown */}
        {showResults && filteredCatalog.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
            {filteredCatalog.map((item) => (
              <button
                key={item.exerciseId}
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 border-b border-border/50 last:border-0 transition-colors"
                onClick={() => {
                  addExerciseFromCatalog(item)
                  setSearchQuery('')
                  setShowResults(false)
                }}
              >
                <span className="font-medium">{l(item.name)}</span>
                <span className="text-[11px] text-muted-foreground ml-2">{l(item.muscles)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Start button — sticky bottom */}
      <div id="tour-circuit-start" className="sticky bottom-0 pt-3 pb-2 -mx-1 px-1 bg-gradient-to-t from-background via-background to-transparent">
        <Button
          className="w-full"
          size="lg"
          disabled={exercises.length === 0}
          onClick={handleStart}
        >
          <span className="mr-2">▶</span>
          {t('circuit.start')}
        </Button>
        <p className="text-xs text-center text-muted-foreground mt-1.5">{summaryText()}</p>
      </div>
    </div>
  )
}
