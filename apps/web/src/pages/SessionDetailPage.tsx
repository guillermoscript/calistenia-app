import { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { WORKOUTS } from '../data/workouts'
import { useSessionDetail } from '../hooks/useSessionDetail'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import type { SessionExercise } from '../hooks/useSessionDetail'
import type { TranslatableField } from '../lib/i18n-db'
import { localize } from '../lib/i18n-db'
import { useLocalize } from '../hooks/useLocalize'

// ── Build exercise catalog from static workout data ──────────────────────────

function buildExerciseCatalog(): Record<string, { name: TranslatableField; muscles: TranslatableField }> {
  const catalog: Record<string, { name: TranslatableField; muscles: TranslatableField }> = {}
  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!catalog[ex.id]) {
        catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
      }
    })
  })
  return catalog
}

const STATIC_CATALOG = buildExerciseCatalog()

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseWorkoutKey(key: string, t: TFunction): string {
  if (key.startsWith('free_') || key.startsWith('manual_')) return t('progress.freeSession')
  const [phaseStr, day] = key.split('_')
  const phase = phaseStr.replace('p', '')
  const dayKeys: Record<string, string> = {
    lun: 'common.days.mon', mar: 'common.days.tue', mie: 'common.days.wed',
    jue: 'common.days.thu', vie: 'common.days.fri', sab: 'common.days.sat', dom: 'common.days.sun',
  }
  const dayName = dayKeys[day] ? t(dayKeys[day]) : day
  return `${t('session.phase', { phase })} — ${dayName}`
}

function formatDate(dateStr: string, language: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ── Exercise Section ─────────────────────────────────────────────────────────

function ExerciseSection({ exercise, t }: { exercise: SessionExercise; t: TFunction }) {
  const l = useLocalize()
  return (
    <div className="py-4">
      <div className="mb-3">
        <div className="text-sm font-medium text-foreground">{l(exercise.name)}</div>
        {exercise.muscles && (
          <div className="text-[11px] text-muted-foreground">{l(exercise.muscles)}</div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-muted-foreground tracking-widest uppercase">
              <th className="text-left pb-2 pr-4 font-normal">{t('session.set')}</th>
              <th className="text-left pb-2 pr-4 font-normal">{t('common.reps')}</th>
              {exercise.hasWeight && <th className="text-left pb-2 pr-4 font-normal">{t('session.weight')}</th>}
              {exercise.hasRpe && <th className="text-left pb-2 pr-4 font-normal">{t('session.rpe')}</th>}
              {exercise.hasNotes && <th className="text-left pb-2 font-normal">{t('session.note')}</th>}
            </tr>
          </thead>
          <tbody>
            {exercise.sets.map(set => {
              const isBest = exercise.bestSet?.setNumber === set.setNumber
              return (
                <tr
                  key={set.setNumber}
                  className={cn(
                    'border-t border-border/50',
                    isBest && 'text-lime',
                  )}
                >
                  <td className="py-2 pr-4 text-muted-foreground">{set.setNumber}</td>
                  <td className={cn('py-2 pr-4', isBest ? 'font-medium' : 'text-foreground')}>{set.reps}</td>
                  {exercise.hasWeight && (
                    <td className="py-2 pr-4">
                      {set.weight ? `${set.weight}kg` : '—'}
                    </td>
                  )}
                  {exercise.hasRpe && (
                    <td className="py-2 pr-4">
                      {set.rpe ? set.rpe : '—'}
                    </td>
                  )}
                  {exercise.hasNotes && (
                    <td className="py-2 text-muted-foreground text-xs italic">
                      {set.note || '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Session Detail Page ──────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const { t, i18n } = useTranslation()
  const l = useLocalize()
  const { progress } = useWorkoutState()
  const { date, workoutKey } = useParams<{ date: string; workoutKey: string }>()
  const navigate = useNavigate()

  // Enrich catalog with PB exercises_catalog for free sessions
  const [catalog, setCatalog] = useState(STATIC_CATALOG)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (!(await isPocketBaseAvailable())) return
        const res = await pb.collection('exercises_catalog').getList(1, 200, { $autoCancel: false })
        if (cancelled) return
        const merged = { ...STATIC_CATALOG }
        res.items.forEach((item: any) => {
          if (!merged[item.id]) {
            merged[item.id] = { name: item.name ?? '', muscles: item.muscles ?? '' }
          }
        })
        setCatalog(merged)
      } catch { /* static catalog fallback */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const { session, exercises } = useSessionDetail(
    progress,
    date || '',
    workoutKey || '',
    catalog,
  )

  const totalSets = useMemo(
    () => exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
    [exercises],
  )

  if (!date || !workoutKey) return null

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1"
        >
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
          {t('common.back')}
        </button>
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm">{t('session.notFound')}</div>
        </div>
      </div>
    )
  }

  const isFreeSession = session.workoutKey.startsWith('free_')
  const workoutTitle = parseWorkoutKey(session.workoutKey, t)
  const workout = isFreeSession ? null : WORKOUTS[session.workoutKey]
  const displayTitle = isFreeSession ? t('progress.freeSession') : (workout?.title || workoutTitle)

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
      >
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
        {t('common.back')}
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase mb-1">
          {formatDate(date, i18n.language)}
        </div>
        <h1 className="font-bebas text-3xl md:text-4xl leading-none mb-2">{displayTitle}</h1>
        <div className="text-sm text-muted-foreground">
          {!isFreeSession && workoutTitle}
          {exercises.length > 0 && (
            <span>{!isFreeSession && ' · '}{t('progress.exerciseCount', { count: exercises.length })} · {t('common.sets', { count: totalSets })}</span>
          )}
        </div>
      </div>

      {/* Warmup/Cooldown indicators */}
      {session && (session.warmupCompleted || session.warmupSkipped || session.cooldownCompleted || session.cooldownSkipped) && (
        <div className="mb-6 flex flex-wrap gap-3">
          {(session.warmupCompleted || session.warmupSkipped) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 rounded-full', session.warmupCompleted ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              <span>{t('warmupCooldown.sections.warmup')}</span>
              <span className="text-[11px]">
                {session.warmupCompleted
                  ? `${t('warmupCooldown.history.completed')} · ${t('warmupCooldown.history.duration', { minutes: Math.round((session.warmupDurationSeconds || 0) / 60) })}`
                  : t('warmupCooldown.history.skipped')}
              </span>
            </div>
          )}
          {(session.cooldownCompleted || session.cooldownSkipped) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 rounded-full', session.cooldownCompleted ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              <span>{t('warmupCooldown.sections.cooldown')}</span>
              <span className="text-[11px]">
                {session.cooldownCompleted
                  ? `${t('warmupCooldown.history.completed')} · ${t('warmupCooldown.history.duration', { minutes: Math.round((session.cooldownDurationSeconds || 0) / 60) })}`
                  : t('warmupCooldown.history.skipped')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Exercise list or empty state */}
      {exercises.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-muted-foreground text-sm">{t('session.noSetsRecorded')}</div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {exercises.map(exercise => (
            <ExerciseSection key={exercise.exerciseId} exercise={exercise} t={t} />
          ))}
        </div>
      )}

      {/* Session notes */}
      {session.note && (
        <div className="mt-6 px-4 py-3 bg-muted/30 rounded-lg border border-border">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">{t('session.notes')}</div>
          <div className="text-sm text-muted-foreground italic">{session.note}</div>
        </div>
      )}
    </div>
  )
}
