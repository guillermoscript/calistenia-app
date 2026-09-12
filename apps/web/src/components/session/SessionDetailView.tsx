import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Clock } from 'lucide-react'
import { WORKOUTS } from '@calistenia/core/data/workouts'
import { formatTimingClock } from '@calistenia/core/lib/exerciseTiming'
import type { SessionDetailResult, SessionExercise } from '@calistenia/core/hooks/useSessionDetail'
import { localize } from '@calistenia/core/lib/i18n-db'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { cn } from '../../lib/utils'
import WorkoutShareCard from '../WorkoutShareCard'
import type { Exercise } from '@calistenia/core/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

export function parseWorkoutKey(key: string, t: TFunction): string {
  if (key.startsWith('free_') || key.startsWith('manual_')) return t('progress.freeSession')
  const [phaseStr, day] = key.split('_')
  const phase = phaseStr.replace('p', '')
  // Los días se traducen por su id español ("lun"), igual que en la app nativa;
  // no existe un namespace `common.days.*`.
  const dayName = t(`day.${day}`, { defaultValue: day })
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-medium text-foreground">{l(exercise.name)}</div>
          {exercise.seconds != null && exercise.seconds > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground/70 bg-muted/40 rounded px-1.5 py-0.5">
              <Clock className="size-3" />
              {formatTimingClock(exercise.seconds)}
            </span>
          )}
        </div>
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

// ── Sesión sin series registradas ────────────────────────────────────────────

/**
 * Qué enseñar cuando una sesión no tiene ni una serie.
 *
 * Decía solo "Sesión completada sin series registradas" y ahí se acababa, que
 * es justo lo que le pasa a una sesión libre de trabajo isométrico: cronometra
 * los ejercicios pero no registra repeticiones, así que el detalle no contaba
 * NADA de lo que se entrenó. `exercise_timings` sí lo sabe —y la view pública
 * ya lo publica—, así que al menos se listan los ejercicios y su tiempo.
 */
function TimedOnlySession({ session, t }: { session: NonNullable<SessionDetailResult['session']>; t: TFunction }) {
  const timings = session.exerciseTimings ?? []

  if (timings.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="text-muted-foreground text-sm">{t('session.noSetsRecorded')}</div>
      </div>
    )
  }

  return (
    <div>
      <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">
        {t('session.timedExercises')}
      </div>
      <div className="divide-y divide-border">
        {timings.map((timing, i) => (
          <div key={`${timing.exerciseId}-${i}`} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm text-foreground min-w-0 truncate">{timing.exerciseName || timing.exerciseId}</span>
            {timing.seconds > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground shrink-0">
                <Clock className="size-3" />
                {formatTimingClock(timing.seconds)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-muted-foreground">{t('session.noSetsRecorded')}</div>
    </div>
  )
}

// ── Session Detail View ──────────────────────────────────────────────────────

interface SessionDetailViewProps extends SessionDetailResult {
  date: string
  /** Cabecera opcional (autor + link al perfil) para sesiones de otra persona. */
  header?: React.ReactNode
  /** La tarjeta de compartir solo tiene sentido en la sesión propia. */
  share?: {
    userName?: string
    avatarUrl?: string | null
    referralCode?: string | null
  }
}

/**
 * Presentación del detalle de una sesión de fuerza.
 *
 * Compartida por `SessionDetailPage` (sesión propia, desde el ProgressMap) y
 * `PublicSessionDetailPage` (sesión de otro usuario, desde PocketBase) para que
 * ambas se vean idénticas.
 */
export default function SessionDetailView({
  session,
  exercises,
  date,
  header,
  share,
}: SessionDetailViewProps) {
  const { t, i18n } = useTranslation()

  const totalSets = useMemo(
    () => exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
    [exercises],
  )

  const shareExercises = useMemo(
    () => exercises.map(ex => ({
      id: ex.exerciseId,
      name: localize(ex.name, i18n.language),
      sets: ex.sets.length,
      reps: ex.bestSet?.reps ?? ex.sets[0]?.reps ?? '',
    })) as unknown as Exercise[],
    [exercises, i18n.language],
  )

  if (!session) return null

  const isFreeSession = session.workoutKey.startsWith('free_')
  const workoutTitle = parseWorkoutKey(session.workoutKey, t)
  const workout = isFreeSession ? null : WORKOUTS[session.workoutKey]
  const displayTitle = isFreeSession ? t('progress.freeSession') : (workout?.title || workoutTitle)
  // Sin entrada en WORKOUTS el título ya ES workoutTitle: no lo repitas debajo.
  const showWorkoutTitle = !isFreeSession && workoutTitle !== displayTitle

  return (
    <>
      {header}

      {/* Header */}
      <div className="mb-6">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase mb-1">
          {formatDate(date, i18n.language)}
        </div>
        <h1 className="font-bebas text-3xl md:text-4xl leading-none mb-2">{displayTitle}</h1>
        <div className="text-sm text-muted-foreground">
          {showWorkoutTitle && workoutTitle}
          {/* `common.sets` es una etiqueta suelta ("series"), no lleva {{count}}. */}
          {exercises.length > 0 && (
            <span>{showWorkoutTitle && ' · '}{t('progress.exerciseCount', { count: exercises.length })} · {totalSets} {t('common.sets')}</span>
          )}
          {session.durationSeconds != null && session.durationSeconds > 0 && (
            <span className="inline-flex items-center gap-1 ml-2 font-mono text-[12px] text-muted-foreground/70">
              <Clock className="size-3" />
              {formatTimingClock(session.durationSeconds)}
            </span>
          )}
        </div>
      </div>

      {/* Warmup/Cooldown indicators */}
      {(session.warmupCompleted || session.warmupSkipped || session.cooldownCompleted || session.cooldownSkipped) && (
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
        <TimedOnlySession session={session} t={t} />
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

      {/* Share card */}
      {share && (
        <div className="mt-8">
          <WorkoutShareCard
            workoutTitle={displayTitle}
            totalSets={totalSets}
            durationMin={session.durationSeconds ? Math.round(session.durationSeconds / 60) : 0}
            date={date}
            exercises={shareExercises}
            userName={share.userName}
            avatarUrl={share.avatarUrl}
            referralCode={share.referralCode}
          />
        </div>
      )}
    </>
  )
}
