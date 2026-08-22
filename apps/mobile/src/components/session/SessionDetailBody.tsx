/**
 * Cuerpo de la pantalla de detalle de una sesión de fuerza/yoga/libre.
 *
 * Lo comparten `app/session-detail.tsx` (sesión propia, desde el ProgressMap ya
 * cargado) y `app/s/[id].tsx` (sesión de cualquier usuario, reconstruida desde
 * PocketBase) para que ambas se vean idénticas.
 */
import type { ReactNode } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import type { TFunction } from 'i18next'
import { Clock, ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { getCatalogExercise } from '@/lib/catalog'
import type { SessionDetailResult, SessionExercise } from '@calistenia/core/hooks/useSessionDetail'
import { formatTimingClock } from '@calistenia/core/lib/exerciseTiming'
import { localize } from '@calistenia/core/lib/i18n-db'

const MUTED = 'hsl(0 0% 55%)'

export interface HrMetrics {
  hr_avg?: number
  hr_max?: number
  calories_actual?: number
}

interface SessionDetailBodyProps {
  session: NonNullable<SessionDetailResult['session']>
  exercises: SessionExercise[]
  /** Fecha local YYYY-MM-DD, ya formateada por el llamador en `dateLabel`. */
  dateLabel: string
  title: string
  locale: string
  t: TFunction
  hrMetrics?: HrMetrics | null
  /** Cabecera opcional (autor + acceso al perfil) en sesiones ajenas. */
  authorHeader?: ReactNode
  /** Botón de compartir; solo en la sesión propia. */
  shareSlot?: ReactNode
  onOpenExercise?: (exerciseId: string) => void
}

export default function SessionDetailBody({
  session,
  exercises,
  dateLabel,
  title,
  locale,
  t,
  hrMetrics,
  authorHeader,
  shareSlot,
  onOpenExercise,
}: SessionDetailBodyProps) {
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const hasDuration = session.durationSeconds != null && session.durationSeconds > 0
  const showWarmup = session.warmupCompleted || session.warmupSkipped
  const showCooldown = session.cooldownCompleted || session.cooldownSkipped

  return (
    <ScrollView contentContainerClassName="px-4 pb-12 gap-5" showsVerticalScrollIndicator={false}>
      {authorHeader}

      {/* Title block */}
      <View className="pt-1">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {dateLabel}
        </Text>
        <Text className="mt-1.5 font-bebas text-4xl leading-[0.95] text-foreground">{title}</Text>
      </View>

      {/* Stat strip */}
      <View className="flex-row gap-3">
        <StatBox value={String(exercises.length)} label={t('nav.exercises')} accent="text-lime" />
        <StatBox value={String(totalSets)} label={t('common.sets')} accent="text-foreground" />
        {hasDuration && (
          <StatBox value={formatTimingClock(session.durationSeconds!)} label={t('cardio.duration')} accent="text-sky-500" />
        )}
      </View>

      {/* FC / calorías reales del reloj (Health Connect) */}
      {hrMetrics && (
        <View className="flex-row gap-3">
          <StatBox value={hrMetrics.hr_avg ? String(hrMetrics.hr_avg) : '—'} label="FC MEDIA" accent="text-red-500" />
          <StatBox value={hrMetrics.hr_max ? String(hrMetrics.hr_max) : '—'} label="FC MÁX" accent="text-red-500" />
          <StatBox value={hrMetrics.calories_actual ? String(hrMetrics.calories_actual) : '—'} label="KCAL RELOJ" accent="text-red-500" />
        </View>
      )}

      {/* Warmup / cooldown */}
      {(showWarmup || showCooldown) && (
        <View className="flex-row flex-wrap gap-x-5 gap-y-2">
          {showWarmup && (
            <PhaseChip
              done={!!session.warmupCompleted}
              label={t('warmupCooldown.sections.warmup')}
              detail={session.warmupCompleted
                ? t('warmupCooldown.history.duration', { minutes: Math.round((session.warmupDurationSeconds || 0) / 60) })
                : t('warmupCooldown.history.skipped')}
            />
          )}
          {showCooldown && (
            <PhaseChip
              done={!!session.cooldownCompleted}
              label={t('warmupCooldown.sections.cooldown')}
              detail={session.cooldownCompleted
                ? t('warmupCooldown.history.duration', { minutes: Math.round((session.cooldownDurationSeconds || 0) / 60) })
                : t('warmupCooldown.history.skipped')}
            />
          )}
        </View>
      )}

      {/* Exercises */}
      {exercises.length === 0 ? (
        <TimedOnlySession session={session} t={t} />
      ) : (
        <View className="gap-3">
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.exerciseId}
              index={i + 1}
              exercise={ex}
              locale={locale}
              t={t}
              onOpen={
                onOpenExercise && getCatalogExercise(ex.exerciseId)
                  ? () => onOpenExercise(ex.exerciseId)
                  : undefined
              }
            />
          ))}
        </View>
      )}

      {/* Session note */}
      {Boolean(session.note) && (
        <View className="rounded-xl border-l-2 border-lime/50 bg-muted/20 px-4 py-3">
          <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('session.notes')}
          </Text>
          <Text className="font-sans-italic text-sm leading-5 text-muted-foreground">{`"${session.note}"`}</Text>
        </View>
      )}

      {shareSlot}
    </ScrollView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <View className="flex-1 items-center rounded-xl bg-muted/60 py-3.5">
      <Text className={`font-bebas text-3xl leading-none ${accent}`}>{value}</Text>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function PhaseChip({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('size-2 rounded-full', done ? 'bg-lime' : 'bg-muted-foreground/40')} />
      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">{label}</Text>
      <Text className="text-[11px] text-muted-foreground/70">{detail}</Text>
    </View>
  )
}

function ExerciseCard({
  index,
  exercise,
  locale,
  t,
  onOpen,
}: {
  index: number
  exercise: SessionExercise
  locale: string
  t: TFunction
  onOpen?: () => void
}) {
  const idx = String(index).padStart(2, '0')
  return (
    <View className="rounded-xl border border-border bg-card px-4 py-3.5">
      {/* Title row — tappable when the exercise exists in the catalog */}
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        className={cn('flex-row items-center gap-2.5', onOpen && 'active:opacity-60')}
      >
        <Text className="font-mono text-[11px] tracking-[1px] text-muted-foreground/50">{idx}</Text>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="flex-shrink font-sans-medium text-[15px] text-foreground" numberOfLines={1}>
              {localize(exercise.name, locale)}
            </Text>
            {exercise.seconds != null && exercise.seconds > 0 && (
              <View className="flex-row items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5">
                <Clock size={10} color={MUTED} />
                <Text className="font-mono text-[10px] text-muted-foreground/70">{formatTimingClock(exercise.seconds)}</Text>
              </View>
            )}
          </View>
          {exercise.muscles ? (
            <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground" numberOfLines={1}>
              {localize(exercise.muscles, locale)}
            </Text>
          ) : null}
        </View>
        {onOpen && <ChevronRight size={15} color="hsl(0 0% 40%)" />}
      </Pressable>

      {/* Column headers */}
      <View className="mt-3 flex-row border-b border-border/60 pb-1.5">
        <Text className="w-9 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{t('session.set')}</Text>
        <Text className="flex-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{t('common.reps')}</Text>
        {exercise.hasWeight && (
          <Text className="w-16 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{t('session.weight')}</Text>
        )}
        {exercise.hasRpe && (
          <Text className="w-12 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{t('session.rpe')}</Text>
        )}
      </View>

      {/* Set rows */}
      {exercise.sets.map((set, i) => {
        const isBest = exercise.bestSet?.setNumber === set.setNumber
        const isLast = i === exercise.sets.length - 1 && !set.note
        return (
          <View key={set.setNumber}>
            <View className={cn('flex-row items-center py-2', !isLast && 'border-b border-border/30')}>
              <Text className="w-9 font-mono text-xs text-muted-foreground/70">{set.setNumber}</Text>
              <Text className={cn('flex-1 text-sm', isBest ? 'font-sans-medium text-lime' : 'text-foreground')}>
                {set.reps}
              </Text>
              {exercise.hasWeight && (
                <Text className={cn('w-16 text-right text-sm', isBest ? 'text-lime' : 'text-foreground')}>
                  {set.weight ? `${set.weight}kg` : '—'}
                </Text>
              )}
              {exercise.hasRpe && (
                <Text className={cn('w-12 text-right text-sm', isBest ? 'text-lime' : 'text-foreground')}>{set.rpe ?? '—'}</Text>
              )}
            </View>
            {set.note ? (
              <Text className={cn('pb-2 pl-9 font-sans-italic text-xs text-muted-foreground', i !== exercise.sets.length - 1 && 'border-b border-border/30')}>
                {set.note}
              </Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Sesión sin series registradas.
//
// Decía solo "Sesión completada sin series registradas", que es justo lo que le
// pasa a una sesión libre de trabajo isométrico: cronometra los ejercicios pero
// no registra repeticiones, así que el detalle no contaba NADA de lo que se
// entrenó. `exercise_timings` sí lo sabe. Espeja `SessionDetailView` de la web.
// ---------------------------------------------------------------------------
function TimedOnlySession({
  session,
  t,
}: {
  session: SessionDetailBodyProps['session']
  t: TFunction
}) {
  const timings = session.exerciseTimings ?? []

  if (timings.length === 0) {
    return (
      <View className="items-center gap-1 py-12">
        <Text className="text-2xl">🧘</Text>
        <Text className="text-center text-sm text-muted-foreground">{t('session.noSetsRecorded')}</Text>
      </View>
    )
  }

  return (
    <View className="gap-1">
      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
        {t('session.timedExercises')}
      </Text>
      {timings.map((timing, i) => (
        <View
          key={`${timing.exerciseId}-${i}`}
          className="flex-row items-center justify-between gap-4 border-b border-border/50 py-3"
        >
          <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
            {timing.exerciseName || timing.exerciseId}
          </Text>
          {timing.seconds > 0 && (
            <View className="shrink-0 flex-row items-center gap-1">
              <Clock size={12} color={MUTED} />
              <Text className="font-mono text-[11px] text-muted-foreground">
                {formatTimingClock(timing.seconds)}
              </Text>
            </View>
          )}
        </View>
      ))}
      <Text className="mt-3 text-xs text-muted-foreground">{t('session.noSetsRecorded')}</Text>
    </View>
  )
}
