/**
 * Pantalla de detalle de una sesión de entreno (fuerza/yoga/libre) ya completada.
 * Reconstruye los ejercicios + series/reps/peso/rpe/notas desde el ProgressMap ya
 * cargado (sin llamadas extra a PocketBase), espejo de la web SessionDetailPage.
 *
 * Ruta: /session-detail?date=YYYY-MM-DD&workoutKey=p1_lun&title=...
 */
import { useMemo } from 'react'
import { View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ArrowLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { WORKOUTS } from '@calistenia/core/data/workouts'
import { useSessionDetail } from '@calistenia/core/hooks/useSessionDetail'
import { useExerciseCatalog } from '@calistenia/core/hooks/useExerciseCatalog'
import { useSessionHrMetrics } from '@calistenia/core/hooks/useSessionHrMetrics'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { localize } from '@calistenia/core/lib/i18n-db'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'
import type { Exercise, ExerciseTiming } from '@calistenia/core/types'
import WorkoutShareButton from '@/components/share/WorkoutShareButton'
import SessionDetailBody from '@/components/session/SessionDetailBody'

const MUTED = 'hsl(0 0% 55%)'

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
  const { getWorkout } = useWorkoutActions()
  const me = useAuthUser()

  // Los ejercicios de un programa se registran con claves de slot (p.ej.
  // "lun_1_2"), no con ids de catálogo — sus nombres legibles sólo viven en el
  // propio programa (PB program_exercises). Resuélvelos desde el WorkoutsMap ya
  // cargado del programa activo para esta workoutKey ("p1_lun" → fase 1, día lun).
  const programCatalog = useMemo(() => {
    const m = /^p(\d+)_(.+)$/.exec(workoutKey)
    if (!m) return {} as Record<string, { name: TranslatableField; muscles: TranslatableField }>
    const workout = getWorkout(parseInt(m[1], 10), m[2])
    if (!workout) return {} as Record<string, { name: TranslatableField; muscles: TranslatableField }>
    const out: Record<string, { name: TranslatableField; muscles: TranslatableField }> = {}
    workout.exercises.forEach(ex => { out[ex.id] = { name: ex.name, muscles: ex.muscles } })
    return out
  }, [workoutKey, getWorkout])

  // Catálogo de ejercicios (bundle + `exercises_catalog` de PB) desde core
  // (#473): las sesiones libres pueden incluir ejercicios que sólo viven en PB.
  const catalog = useExerciseCatalog()
  // Nombres del programa tienen prioridad sobre el catálogo estático/PB para las
  // claves de slot que sólo el programa conoce.
  const mergedCatalog = useMemo(() => ({ ...catalog, ...programCatalog }), [catalog, programCatalog])
  const { session, exercises } = useSessionDetail(progress, date, workoutKey, mergedCatalog)

  const totalSets = useMemo(
    () => exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
    [exercises],
  )

  // FC/calorías reales del reloj (Health Connect) para esta sesión. Viven en el
  // record PB `sessions` (no en el ProgressMap en memoria) → consulta aparte en
  // core (#473).
  const hrMetrics = useSessionHrMetrics(date ?? null, workoutKey ?? null, me?.id ?? null)

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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header router={router} backLabel={t('common.back')} />

      <SessionDetailBody
        session={session}
        exercises={exercises}
        dateLabel={formatSessionDate(date, locale)}
        title={resolvedTitle}
        locale={locale}
        t={t}
        hrMetrics={hrMetrics}
        onOpenExercise={(id) => router.push({ pathname: '/exercise/[id]', params: { id } })}
        shareSlot={exercises.length > 0 ? (
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
        ) : null}
      />
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
