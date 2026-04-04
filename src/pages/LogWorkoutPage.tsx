import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { WORKOUTS, PHASES as FALLBACK_PHASES, WEEK_DAYS as FALLBACK_WEEK_DAYS } from '../data/workouts'
import { SUPPLEMENTARY_EXERCISES } from '../data/supplementary-exercises'
import catalogData from '../data/exercise-catalog.json'
import { todayStr } from '../lib/dateUtils'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { localize } from '../lib/i18n-db'
import { useLocalize } from '../hooks/useLocalize'
import { toast } from 'sonner'
import type { DayId } from '../types'
import type { TranslatableField } from '../lib/i18n-db'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string
  name: TranslatableField
  muscles: TranslatableField
}

interface LogSet {
  reps: string
  weight: string
  rpe: string
}

interface LogExercise {
  id: string
  name: string
  sets: LogSet[]
}

// ── Catalog helpers (same pattern as FreeSessionPage) ─────────────────────────

function extractCatalog(): CatalogItem[] {
  const seen = new Map<string, CatalogItem>()

  for (const workout of Object.values(WORKOUTS)) {
    for (const ex of workout.exercises) {
      if (!seen.has(ex.id)) seen.set(ex.id, { id: ex.id, name: ex.name, muscles: ex.muscles })
    }
  }

  for (const ex of SUPPLEMENTARY_EXERCISES) {
    if (!seen.has(ex.id)) seen.set(ex.id, { id: ex.id, name: ex.name, muscles: ex.muscles })
  }

  const catalogCategories = (catalogData as any).categories || {}
  for (const catData of Object.values(catalogCategories) as any[]) {
    for (const ex of (catData as any).exercises || []) {
      if (!seen.has(ex.id)) seen.set(ex.id, { id: ex.id, name: ex.name ?? '', muscles: ex.muscles ?? '' })
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    localize(a.name, 'es').localeCompare(localize(b.name, 'es'))
  )
}

function mapPBCatalog(rec: any): CatalogItem {
  return { id: rec.id ?? '', name: rec.name ?? '', muscles: rec.muscles ?? '' }
}

function makeCustomId(name: string): string {
  return `custom_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LogWorkoutPage() {
  const { t, i18n } = useTranslation()
  const l = useLocalize()
  const navigate = useNavigate()
  const { settings, phases: phasesProp, weekDays: weekDaysProp } = useWorkoutState()
  const { logSet, markWorkoutDone, isWorkoutDone } = useWorkoutActions()

  const PHASES = phasesProp || FALLBACK_PHASES
  const WEEK_DAYS = weekDaysProp || FALLBACK_WEEK_DAYS

  // ── Form state ───────────────────────────────────────────────────────────
  const [date, setDate] = useState(todayStr())
  const [sessionType, setSessionType] = useState<'program' | 'free'>('free')
  const [selectedPhase, setSelectedPhase] = useState(settings?.phase || 1)
  const [selectedDay, setSelectedDay] = useState<DayId | null>(null)
  const [note, setNote] = useState('')
  const [exercises, setExercises] = useState<LogExercise[]>([])
  const [saving, setSaving] = useState(false)

  // ── Catalog loading ──────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const available = await isPocketBaseAvailable()
        if (available && !cancelled) {
          try {
            const res = await pb.collection('exercises_catalog').getList(1, 200, { sort: 'name' })
            if (!cancelled && res.items.length > 0) {
              setCatalog(res.items.map(mapPBCatalog))
              return
            }
          } catch { /* fall through */ }
        }
      } catch { /* PB not available */ }
      if (!cancelled) setCatalog(extractCatalog())
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return catalog
      .filter(ex => {
        const name = l(ex.name).toLowerCase()
        const muscles = l(ex.muscles).toLowerCase()
        return name.includes(q) || muscles.includes(q)
      })
      .slice(0, 8)
  }, [catalog, search, i18n.language])

  // ── Exercise management ──────────────────────────────────────────────────

  const addExerciseFromCatalog = useCallback((item: CatalogItem) => {
    setExercises(prev => [...prev, {
      id: item.id,
      name: l(item.name),
      sets: [{ reps: '', weight: '', rpe: '' }],
    }])
    setSearch('')
    setShowDropdown(false)
  }, [l])

  const addCustomExercise = useCallback(() => {
    const name = search.trim()
    if (!name) return
    setExercises(prev => [...prev, {
      id: makeCustomId(name),
      name,
      sets: [{ reps: '', weight: '', rpe: '' }],
    }])
    setSearch('')
    setShowDropdown(false)
  }, [search])

  const removeExercise = (i: number) => {
    setExercises(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateSet = (exIdx: number, setIdx: number, field: keyof LogSet, value: string) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: value }),
      }
    ))
  }

  const addSet = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : { ...ex, sets: [...ex.sets, { reps: '', weight: '', rpe: '' }] }
    ))
  }

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex
      const newSets = ex.sets.filter((_, j) => j !== setIdx)
      return { ...ex, sets: newSets.length > 0 ? newSets : [{ reps: '', weight: '', rpe: '' }] }
    }))
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (exercises.length === 0) {
      toast.error(t('logWorkout.noExercises'))
      return
    }

    const workoutKey = sessionType === 'program' && selectedDay
      ? `p${selectedPhase}_${selectedDay}`
      : `manual_${Date.now()}`

    if (isWorkoutDone(workoutKey, date)) {
      if (!window.confirm(t('logWorkout.alreadyLogged'))) return
    }

    setSaving(true)
    try {
      await markWorkoutDone(workoutKey, note, undefined, undefined, date)

      const baseTs = new Date(date + 'T12:00:00').getTime()
      for (const ex of exercises) {
        for (const set of ex.sets) {
          if (!set.reps.trim()) continue
          await logSet(ex.id, workoutKey, {
            reps: set.reps,
            weight: set.weight ? parseFloat(set.weight) : undefined,
            rpe: set.rpe ? parseFloat(set.rpe) : undefined,
            timestamp: baseTs,
          }, date)
        }
      }

      toast.success(t('logWorkout.successToast', { date }))
      navigate(-1)
    } catch (e) {
      console.error(e)
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  // ── Day labels ───────────────────────────────────────────────────────────
  const dayKeys: Record<string, string> = {
    lun: 'common.days.mon', mar: 'common.days.tue', mie: 'common.days.wed',
    jue: 'common.days.thu', vie: 'common.days.fri', sab: 'common.days.sat', dom: 'common.days.sun',
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[700px] mx-auto px-4 py-6 md:px-6 md:py-8 space-y-5">

      {/* Date + Type */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Date */}
          <div>
            <label className="text-[10px] text-muted-foreground tracking-[3px] uppercase block mb-2">
              {t('logWorkout.dateLabel')}
            </label>
            <input
              type="date"
              max={todayStr()}
              value={date}
              onChange={e => setDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Session Type */}
          <div>
            <label className="text-[10px] text-muted-foreground tracking-[3px] uppercase block mb-2">
              {t('logWorkout.typeLabel')}
            </label>
            <div className="flex gap-2">
              {(['free', 'program'] as const).map(type => (
                <Button
                  key={type}
                  variant={sessionType === type ? 'outline' : 'ghost'}
                  size="sm"
                  onClick={() => { setSessionType(type); setSelectedDay(null) }}
                  className={cn(
                    'text-[11px] tracking-wide transition-all duration-200',
                    sessionType === type ? 'border-teal-400 text-teal-400 bg-accent/50' : 'text-muted-foreground'
                  )}
                >
                  {type === 'free' ? t('logWorkout.typeFree') : t('logWorkout.typeProgram')}
                </Button>
              ))}
            </div>
          </div>

          {/* Phase + Day (program only) */}
          {sessionType === 'program' && (
            <>
              <div>
                <label className="text-[10px] text-muted-foreground tracking-[3px] uppercase block mb-2">
                  {t('logWorkout.phaseLabel')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PHASES.map(p => {
                    const isSelected = selectedPhase === p.id
                    const pa = ({ 1: 'border-lime text-lime', 2: 'border-sky-500 text-sky-500', 3: 'border-pink-500 text-pink-500', 4: 'border-amber-400 text-amber-400' } as Record<number, string>)[p.id] || ''
                    return (
                      <Button
                        key={p.id}
                        variant={isSelected ? 'outline' : 'ghost'}
                        size="sm"
                        onClick={() => { setSelectedPhase(p.id); setSelectedDay(null) }}
                        className={cn(
                          'text-[11px] tracking-wide transition-all duration-200 shrink-0',
                          isSelected ? cn(pa, 'bg-accent/50') : 'text-muted-foreground'
                        )}
                      >
                        F{p.id}{p.nameKey ? ` — ${t(p.nameKey)}` : p.name ? ` — ${p.name}` : ''}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground tracking-[3px] uppercase block mb-2">
                  {t('logWorkout.dayLabel')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEK_DAYS.map(d => {
                    const isSelected = selectedDay === d.id
                    return (
                      <Button
                        key={d.id}
                        variant={isSelected ? 'outline' : 'ghost'}
                        size="sm"
                        onClick={() => setSelectedDay(d.id as DayId)}
                        className={cn(
                          'text-[11px] tracking-wide transition-all duration-200 shrink-0',
                          isSelected ? 'border-teal-400 text-teal-400 bg-accent/50' : 'text-muted-foreground'
                        )}
                      >
                        {dayKeys[d.id] ? t(dayKeys[d.id]) : d.id}
                      </Button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Exercises */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">
            {t('logWorkout.exercisesSection')}
          </div>

          {/* Search / Add */}
          <div className="relative">
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder={t('logWorkout.exercisePlaceholder')}
              className="text-sm"
            />
            {showDropdown && (filteredCatalog.length > 0 || search.trim()) && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                {filteredCatalog.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={() => addExerciseFromCatalog(item)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <div className="font-medium">{l(item.name)}</div>
                    <div className="text-[11px] text-muted-foreground">{l(item.muscles)}</div>
                  </button>
                ))}
                {search.trim() && filteredCatalog.length === 0 && (
                  <button
                    type="button"
                    onMouseDown={addCustomExercise}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-teal-400"
                  >
                    + {t('logWorkout.addExercise')}: &quot;{search.trim()}&quot;
                  </button>
                )}
                {search.trim() && filteredCatalog.length > 0 && (
                  <button
                    type="button"
                    onMouseDown={addCustomExercise}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-t border-border text-muted-foreground"
                  >
                    + {t('logWorkout.addExercise')}: &quot;{search.trim()}&quot;
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Exercise list */}
          {exercises.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('logWorkout.noExercisesHint')}
            </p>
          )}

          {exercises.map((ex, exIdx) => (
            <div key={exIdx} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{ex.name}</span>
                <button
                  type="button"
                  onClick={() => removeExercise(exIdx)}
                  className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  {t('logWorkout.removeExercise')}
                </button>
              </div>

              {/* Sets */}
              <div className="space-y-1.5">
                {ex.sets.map((set, setIdx) => (
                  <div key={setIdx} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground w-5 text-right shrink-0">{setIdx + 1}</span>
                    <Input
                      value={set.reps}
                      onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                      placeholder={t('logWorkout.repsPlaceholder')}
                      className="text-xs h-8 w-20 min-w-0"
                      inputMode="decimal"
                    />
                    <Input
                      value={set.weight}
                      onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                      placeholder={t('logWorkout.weightPlaceholder')}
                      className="text-xs h-8 w-24 min-w-0"
                      inputMode="decimal"
                    />
                    <Input
                      value={set.rpe}
                      onChange={e => updateSet(exIdx, setIdx, 'rpe', e.target.value)}
                      placeholder={t('logWorkout.rpePlaceholder')}
                      className="text-xs h-8 w-24 min-w-0"
                      inputMode="decimal"
                    />
                    {ex.sets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSet(exIdx, setIdx)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-base leading-none"
                        aria-label="Remove set"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(exIdx)}
                className="text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
              >
                + {t('logWorkout.addSet')}
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Note */}
      <Card>
        <CardContent className="pt-5">
          <label className="text-[10px] text-muted-foreground tracking-[3px] uppercase block mb-2">
            {t('logWorkout.noteLabel')}
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('logWorkout.notePlaceholder')}
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full"
      >
        {saving ? t('logWorkout.submitting') : t('logWorkout.submit')}
      </Button>

    </div>
  )
}
