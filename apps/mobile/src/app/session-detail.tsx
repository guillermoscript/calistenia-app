/**
 * Pantalla de detalle de una sesión de entreno (fuerza/yoga/libre) ya completada.
 * Reconstruye los ejercicios + series/reps/peso/rpe/notas desde el ProgressMap ya
 * cargado (sin llamadas extra a PocketBase), espejo de la web SessionDetailPage.
 *
 * Ruta: /session-detail?date=YYYY-MM-DD&workoutKey=p1_lun&title=...
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ArrowLeft, Clock, ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { CATALOG, getCatalogExercise } from '@/lib/catalog'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState } from '@/contexts/WorkoutContext'
import { WORKOUTS } from '@calistenia/core/data/workouts'
import { useSessionDetail } from '@calistenia/core/hooks/useSessionDetail'
import type { SessionExercise } from '@calistenia/core/hooks/useSessionDetail'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { formatTimingClock } from '@calistenia/core/lib/exerciseTiming'
import { localize } from '@calistenia/core/lib/i18n-db'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'
import type { Exercise, ExerciseTiming } from '@calistenia/core/types'
import WorkoutShareButton from '@/components/share/WorkoutShareButton'

const MUTED = 'hsl(0 0% 55%)'

// ── Catálogo de ejercicios (nombre + músculos) ───────────────────────────────
// CATALOG cubre la biblioteca completa (incluye ejercicios de sesiones libres);
// WORKOUTS añade cualquier ejercicio que sólo viva en un programa.
function buildExerciseCatalog(): Record<string, { name: TranslatableField; muscles: TranslatableField }> {
  const catalog: Record<string, { name: TranslatableField; muscles: TranslatableField }> = {}
  for (const ex of CATALOG) {
    if (!catalog[ex.id]) catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
  }
  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!catalog[ex.id]) catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
    })
  })
  return catalog
}

const STATIC_CATALOG = buildExerciseCatalog()

function formatSessionDate(dateStr: string, locale: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

// Fallback para deep-links sin `title`: humaniza la workoutKey igual que el historial.
function humanizeKey(key: string, t: TFunction): string {
  if (key.startsWith('free_') || key.startsWith('manual_')) return t('progress.freeSession')
  const m = /^p(\d+)_(\w+)$/.exec(key)
  if (m) return `${t('session.phase', { phase: m[1] })} · ${t(`day.${m[2]}`, { defaultValue: m[2] })}`
  return key
}

export default function SessionDetailScreen() {
  const { date = '', workoutKey = '', title = '' } = useLocalSearchParams<{
    date: string; workoutKey: string; title?: string
  }>()
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const router = useRouter()
  const { progress } = useWorkoutState()
  const me = useAuthUser()

  // Las sesiones libres pueden incluir ejercicios que sólo viven en PB (custom).
  // Enriquece el catálogo una vez si algún nombre no se resolvió contra el
  // catálogo empaquetado. Espejo de la web SessionDetailPage; sin coste de red
  // en el caso normal (programa/biblioteca estándar).
  const [catalog, setCatalog] = useState(STATIC_CATALOG)
  const { session, exercises } = useSessionDetail(progress, date, workoutKey, catalog)
  const enrichedRef = useRef(false)
  useEffect(() => {
    if (enrichedRef.current) return
    if (!exercises.some(e => typeof e.name === 'string' && e.name === e.exerciseId)) return
    enrichedRef.current = true
    let cancelled = false
    void (async () => {
      try {
        if (!(await isPocketBaseAvailable())) return
        const res = await pb.collection('exercises_catalog').getList(1, 200, { $autoCancel: false })
        if (cancelled) return
        const items = res.items as unknown as { id: string; name?: TranslatableField; muscles?: TranslatableField }[]
        const merged = { ...STATIC_CATALOG }
        items.forEach(it => {
          if (!merged[it.id]) merged[it.id] = { name: it.name ?? it.id, muscles: it.muscles ?? '' }
        })
        setCatalog(merged)
      } catch { /* mantiene el catálogo empaquetado */ }
    })()
    return () => { cancelled = true }
  }, [exercises])

  const totalSets = useMemo(
    () => exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
    [exercises],
  )

  // FC/calorías reales del reloj (Health Connect) para esta sesión. Viven en el
  // record PB `sessions` (no en el ProgressMap en memoria) → fetch aislado.
  const [hrMetrics, setHrMetrics] = useState<{ hr_avg?: number; hr_max?: number; calories_actual?: number } | null>(null)
  useEffect(() => {
    if (!date || !workoutKey || !me?.id) return
    let cancelled = false
    void (async () => {
      try {
        if (!(await isPocketBaseAvailable())) return
        const rec = await pb.collection('sessions').getFirstListItem(
          pb.filter('user = {:u} && workout_key = {:w} && completed_at >= {:d1} && completed_at <= {:d2}', {
            u: me.id, w: workoutKey, d1: `${date} 00:00:00`, d2: `${date} 23:59:59`,
          }),
          { $autoCancel: false, fields: 'hr_avg,hr_max,calories_actual' },
        )
        if (cancelled) return
        if (rec && (rec.hr_avg || rec.calories_actual)) {
          setHrMetrics({ hr_avg: rec.hr_avg, hr_max: rec.hr_max, calories_actual: rec.calories_actual })
        }
      } catch { /* sesión sin métricas de reloj */ }
    })()
    return () => { cancelled = true }
  }, [date, workoutKey, me?.id])

  // Título: el que computó la pantalla de origen (programa activo) → WORKOUTS por
  // defecto → versión humanizada. Evita mostrar la clave cruda "p1_lun".
  const isFreeSession = workoutKey.startsWith('free_') || workoutKey.startsWith('manual_')
  const resolvedTitle =
    (title && title.trim()) ||
    (isFreeSession ? t('progress.freeSession') : WORKOUTS[workoutKey]?.title) ||
    humanizeKey(workoutKey, t)

  // ── Share data ──────────────────────────────────────────────────────────────
  const user = useAuthUser()
  const userName = (user?.display_name as string) || (user?.name as string) || 'Atleta'
  const avatarUrl = user ? getUserAvatarUrl(user, '200x200') : null
  const referralCode = (user?.referral_code as string) || null

  const shareExercises = useMemo<Exercise[]>(
    () =>
      exercises.map((ex) => ({
        id: ex.exerciseId,
        name: localize(ex.name, locale),
        sets: ex.sets.length,
        reps: ex.bestSet?.reps ?? ex.sets[0]?.reps ?? '',
      })) as Exercise[],
    [exercises, locale],
  )

  const shareTimings = useMemo<ExerciseTiming[]>(
    () =>
      exercises
        .filter((ex) => ex.seconds != null && ex.seconds > 0)
        .map((ex) => ({
          exerciseId: ex.exerciseId,
          exerciseName: localize(ex.name, locale),
          seconds: ex.seconds!,
        })),
    [exercises, locale],
  )

  const durationMin = session
    ? Math.round((session.durationSeconds ?? 0) / 60)
    : 0

  if (!session) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <Header router={router} backLabel={t('common.back')} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-2xl">🗂️</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">{t('session.notFound')}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const hasDuration = session.durationSeconds != null && session.durationSeconds > 0
  const showWarmup = session.warmupCompleted || session.warmupSkipped
  const showCooldown = session.cooldownCompleted || session.cooldownSkipped

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header router={router} backLabel={t('common.back')} />

      <ScrollView contentContainerClassName="px-4 pb-12 gap-5" showsVerticalScrollIndicator={false}>
        {/* Title block */}
        <View className="pt-1">
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {formatSessionDate(date, locale)}
          </Text>
          <Text className="mt-1.5 font-bebas text-4xl leading-[0.95] text-foreground">{resolvedTitle}</Text>
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
          <View className="items-center gap-1 py-12">
            <Text className="text-2xl">🧘</Text>
            <Text className="text-center text-sm text-muted-foreground">{t('session.noSetsRecorded')}</Text>
          </View>
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
                  getCatalogExercise(ex.exerciseId)
                    ? () => router.push({ pathname: '/exercise/[id]', params: { id: ex.exerciseId } })
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

        {/* Share as image — only when there are exercises to show */}
        {exercises.length > 0 && (
          <WorkoutShareButton
            workoutTitle={resolvedTitle}
            totalSets={totalSets}
            durationMin={durationMin}
            date={date}
            workoutKey={workoutKey}
            exercises={shareExercises}
            timings={shareTimings}
            userName={userName}
            avatarUrl={avatarUrl}
            referralCode={referralCode}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ router, backLabel }: { router: ReturnType<typeof useRouter>; backLabel: string }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-1">
      <Pressable onPress={() => router.back()} hitSlop={8} className="p-2" accessibilityRole="button" accessibilityLabel={backLabel}>
        <ArrowLeft size={20} color={MUTED} />
      </Pressable>
    </View>
  )
}

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
