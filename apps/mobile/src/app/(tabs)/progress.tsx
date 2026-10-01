/**
 * Pestaña Progreso (#859, épica #852). Antes era el historial (`/history`,
 * que ahora redirige aquí).
 *
 * De arriba abajo: la racha semanal con las últimas 10 semanas, tres cifras
 * (entrenos, esta semana, mejor racha), el mapa del mes, las filas a lo que
 * antes estaba repartido (resumen semanal, estadísticas, cardio, calendario,
 * sueño, fotos, peso y medidas) y la lista de sesiones.
 *
 * La racha es la SEMANAL de #853 (`computeWeeklyStreak`): semanas seguidas
 * cumpliendo el objetivo efectivo, con la misma semana de calendario que Hoy
 * y Entrenar. Cuenta cualquier entreno, cardio libre incluido.
 */
import { memo, useCallback, useEffect, useMemo } from 'react'
import { useCountUp } from '@/lib/use-count-up'
import { View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { Check, Activity, ChevronRight, Dumbbell } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { EmptyState } from '@/components/ui/empty-state'
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { useAccountSessionCount } from '@calistenia/core/hooks/useAccountSessionCount'
import { useBattleHistory } from '@calistenia/core/hooks/useBattleHistory'
import { relativeDate, todayStr, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { getEffectiveWeeklyGoal } from '@calistenia/core/lib/weeklyGoal'
import { activityDaysFromProgress } from '@calistenia/core/lib/weekSummary'
import { computeWeeklyStreak, weeklyStreakHistory, type WeekHistoryEntry } from '@calistenia/core/lib/weeklyStreak'
import { mondayOf } from '@calistenia/core/lib/calendarWeek'
import { formatDuration } from '@calistenia/core/lib/geo'
import type { SessionDone, CardioSession } from '@calistenia/core/types'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

// Fila unificada del historial: entreno (fuerza/yoga) o sesión de cardio GPS.
// `title` se resuelve al construir la fila (una sola vez), no al pintarla: antes
// `titleFor` se llamaba dos veces por fila en cada render.
type HistoryRow =
  | { kind: 'strength'; ts: number; session: SessionDone; title: string }
  | { kind: 'cardio'; ts: number; session: CardioSession }

// Clave estable: sin el índice, insertar un entreno nuevo arriba (el caso
// normal) renumeraba todas las claves y tiraba el reciclado de FlatList.
function rowKey(r: HistoryRow): string {
  // `id` es opcional en el tipo; `started_at` identifica igual de bien la sesión
  // y no reintroduce el índice.
  return r.kind === 'cardio'
    ? `c_${r.session.id ?? r.session.started_at}`
    : `s_${r.session.date}_${r.session.workoutKey}`
}

/** Semanas que enseña la tira de la racha. */
const STREAK_WEEKS = 10

export default function ProgressScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { colorScheme } = useColorScheme()
  const dark = colorScheme === 'dark'
  const { progress, settings, activeProgram, weekDays } = useWorkoutState()
  const { getWorkout, getTotalSessions, getMonthActivity } = useWorkoutActions()
  const { sessions: cardioSessions } = useCardioSessions(user?.id ?? null)
  const { record: battleRecord } = useBattleHistory(user?.id ?? null)

  const titleFor = useCallback(
    (s: SessionDone): string => {
      // workoutKey "p1_lun" → título del workout; sesiones libres → etiqueta genérica
      if (s.workoutKey.startsWith('free_') || s.workoutKey.startsWith('manual_')) {
        return t('progress.freeSession')
      }
      const m = /^p(\d+)_(\w+)$/.exec(s.workoutKey)
      if (m) {
        const w = getWorkout(parseInt(m[1]), m[2])
        if (w?.title) return w.title
        return `${t('workout.phaseLabel', { phase: m[1] })} · ${t(`day.${m[2]}`, { defaultValue: m[2] })}`
      }
      return s.workoutKey
    },
    [t, getWorkout],
  )

  // Combina entrenos (progress) y cardio (cardio_sessions) en una sola lista
  // ordenada por fecha/hora.
  const rows = useMemo<HistoryRow[]>(() => {
    const strength: HistoryRow[] = Object.entries(progress)
      // Excluye días de cardio de programa (cardioSessionId): ya se pintan como fila de cardio.
      .filter(([k, v]) => k.startsWith('done_') && (v as SessionDone).done && !(v as SessionDone).cardioSessionId)
      .map(([, v]) => {
        const s = v as SessionDone
        return {
          kind: 'strength' as const,
          ts: s.completedAt ?? Date.parse(`${s.date}T12:00:00`),
          session: s,
          title: titleFor(s),
        }
      })
    const cardio: HistoryRow[] = cardioSessions.map(c => ({
      kind: 'cardio' as const,
      ts: Date.parse(c.started_at),
      session: c,
    }))
    return [...strength, ...cardio]
      .filter(r => Number.isFinite(r.ts))
      .sort((a, b) => b.ts - a.ts)
  }, [progress, cardioSessions, titleFor])

  const monthActivity = useMemo(() => getMonthActivity(), [getMonthActivity])
  const today = todayStr()

  // Entrenos de la CUENTA (#869/#881), no solo los del programa activo. El evento
  // de analítica conserva la cifra del programa: es la que ya medía.
  const programSessions = useMemo(() => getTotalSessions(), [getTotalSessions])
  const totalSessions = useAccountSessionCount(user?.id ?? null, progress)
  const weeklyGoal = getEffectiveWeeklyGoal(settings, activeProgram ? { weekDays } : null)

  // Días con cualquier entreno: marcadores del programa (fuerza, yoga, cardio y
  // circuito del programa) más el cardio libre, que ya está cargado.
  const activityDays = useMemo(
    () => [...activityDaysFromProgress(progress), ...cardioSessions.map(c => utcToLocalDateStr(c.started_at))],
    [progress, cardioSessions],
  )
  // El objetivo es el efectivo de hoy para todas las semanas: el cliente no
  // guarda el historial de cambios de objetivo (eso lo hace el servidor, #801).
  const streak = useMemo(() => computeWeeklyStreak(activityDays, weeklyGoal, today), [activityDays, weeklyGoal, today])
  const weeks = useMemo(() => weeklyStreakHistory(activityDays, weeklyGoal, today, STREAK_WEEKS), [activityDays, weeklyGoal, today])

  // Cardio de esta semana de calendario, para el subtítulo de su fila.
  const cardioWeek = useMemo(() => {
    const monday = mondayOf(today)
    const inWeek = cardioSessions.filter(c => {
      const day = utcToLocalDateStr(c.started_at)
      return day >= monday && day <= today
    })
    return { count: inWeek.length, km: inWeek.reduce((sum, c) => sum + (c.distance_km ?? 0), 0) }
  }, [cardioSessions, today])

  const monthDaysTrained = useMemo(() => Object.values(monthActivity).filter(Boolean).length, [monthActivity])
  const monthName = new Date().toLocaleDateString(i18n.language, { month: 'long' })

  // #636 §4: el historial no emitía nada, así que no se sabía si la gente
  // vuelve a mirar lo que ha hecho.
  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.historyViewed, {
      surface: 'history', source: 'history_tab',
      total_sessions: programSessions,
      streak: streak.current,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- una vista por visita

  const openCardio = useCallback((id: string) => router.push(`/cardio/${id}`), [router])
  const openStrength = useCallback(
    (date: string, workoutKey: string, title: string) =>
      router.push({ pathname: '/session-detail', params: { date, workoutKey, title } }),
    [router],
  )
  const go = useCallback((href: Href) => {
    haptics.light()
    router.push(href)
  }, [router])

  const renderItem = useCallback(
    ({ item }: { item: HistoryRow }) =>
      item.kind === 'cardio' ? (
        <CardioRow session={item.session} onPress={openCardio} />
      ) : (
        <StrengthRow session={item.session} title={item.title} onPress={openStrength} />
      ),
    [openCardio, openStrength],
  )

  const header = useMemo(
    () => (
      <View className="gap-6 pb-3 pt-2">
        <View className="flex-row items-end justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Kicker>{t('progressTab.kicker')}</Kicker>
            <Text className="font-bebas text-[34px] leading-none text-foreground">{t('nav.progress')}</Text>
          </View>
          <ProfileAvatarButton />
        </View>

        {/* Racha semanal: semanas seguidas cumpliendo el objetivo (#853). */}
        <View className="gap-3.5 rounded-xl border border-border bg-card p-[18px]">
          <View className="flex-row items-center justify-between gap-3">
            <Kicker tone="lime">{t('progressTab.weeklyStreak')}</Kicker>
            <Pressable
              onPress={() => go({ pathname: '/profile', params: { section: 'goal' } })}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Text className="text-xs text-muted-foreground underline">
                {t('progressTab.goalLink', { count: weeklyGoal })}
              </Text>
            </Pressable>
          </View>
          <View className="gap-1">
            <Text className="font-bebas text-[56px] leading-[52px] text-foreground">
              {t('progressTab.weeks', { count: streak.current })}
            </Text>
            <Text className="text-[13px] text-muted-foreground">
              {streak.current > 0
                ? t('progressTab.streakBody', { done: streak.thisWeek.done, goal: streak.thisWeek.goal })
                : t('progressTab.streakStart', { done: streak.thisWeek.done, goal: streak.thisWeek.goal })}
            </Text>
          </View>
          <View className="gap-1.5">
            <View className="flex-row gap-[5px]">
              {weeks.map((w, i) => <WeekSquare key={w.weekStart} week={w} current={i === weeks.length - 1} dark={dark} />)}
            </View>
            <View className="flex-row justify-between">
              <Kicker className="text-[9px] tracking-[1px]">{t('progressTab.weeksAgo', { count: STREAK_WEEKS })}</Kicker>
              <Kicker className="text-[9px] tracking-[1px]">{t('progressTab.thisWeekShort')}</Kicker>
            </View>
          </View>
        </View>

        {/* Tres cifras, separadas por filetes. */}
        <View className="flex-row border-y border-border">
          <StatCell label={t('progressTab.workouts')} value={totalSessions ?? '–'} />
          <StatCell label={t('common.week')} value={`${streak.thisWeek.done} / ${streak.thisWeek.goal}`} bordered />
          <StatCell label={t('progressTab.bestStreak')} value={t('progressTab.weeksShort', { count: streak.best })} bordered />
        </View>

        {/* Mapa del mes */}
        <View className="gap-2.5">
          <View className="flex-row justify-between">
            <Kicker>{monthName}</Kicker>
            <Kicker className="tracking-[1px]">{t('progressTab.daysTrained', { count: monthDaysTrained })}</Kicker>
          </View>
          <MonthGrid activity={monthActivity} today={today} />
        </View>

        {/* Lo que antes estaba repartido entre el inicio, el perfil y la pestaña Calendario. */}
        <View className="gap-2">
          <Kicker>{t('progressTab.moreKicker')}</Kicker>
          <View className="border-t border-border">
            <LinkRow title={t('progressTab.insightsTitle')} sub={t('progressTab.insightsSub')} onPress={() => go('/insights')} />
            <LinkRow title={t('stats.title')} sub={t('stats.rowDesc')} onPress={() => go('/stats')} />
            <LinkRow
              title={t('nav.cardio')}
              sub={cardioWeek.count > 0
                ? t('progressTab.cardioWeek', { km: cardioWeek.km.toFixed(1), count: cardioWeek.count })
                : t('progressTab.cardioNone')}
              onPress={() => go('/cardio/history')}
            />
            <LinkRow title={t('nav.calendar')} sub={t('progressTab.calendarSub')} onPress={() => go('/calendar')} />
            <LinkRow title={t('nav.sleep')} sub={t('progressTab.sleepSub')} onPress={() => go('/sleep')} />
            <LinkRow title={t('progress.bodyPhotos.title')} sub={t('progress.bodyPhotos.rowDesc')} onPress={() => go('/progress-photos')} />
            <LinkRow title={t('progressTab.bodyTitle')} sub={t('progressTab.bodySub')} onPress={() => go('/body-measurements')} />
            {/* Batallas (#398): el historial es lo que convierte una batalla en
                entrenamiento y no en una anécdota que se ve una vez y desaparece. */}
            {battleRecord.fought > 0 && (
              <LinkRow
                title={t('battle.historyTitle')}
                sub={`${battleRecord.won}/${battleRecord.fought} ${t('battle.recordWon').toLowerCase()}`}
                onPress={() => go('/battle-history')}
              />
            )}
          </View>
        </View>

        {rows.length > 0 && (
          <Kicker>
            {t('progress.recentSessions')}
          </Kicker>
        )}
      </View>
    ),
    [
      t,
      go,
      dark,
      weeklyGoal,
      streak,
      weeks,
      totalSessions,
      monthName,
      monthDaysTrained,
      monthActivity,
      today,
      cardioWeek,
      battleRecord,
      rows.length,
    ],
  )

  const empty = useMemo(
    () => (
      <View className="py-4">
        <EmptyState
          icon={Dumbbell}
          title={t('progress.noData')}
          body={t('progress.noDataDesc')}
          ctaLabel={t('progress.noDataCta')}
          onCtaPress={() => router.navigate('/(tabs)')}
        />
      </View>
    ),
    [t, router],
  )

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={rowKey}
        contentContainerClassName="px-4 pb-8 gap-2"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={renderItem}
      />
    </SafeAreaView>
  )
}

/** Un cuadro de la tira: cumplida en lima, fallada con filete, la en curso recuadrada. */
function WeekSquare({ week, current, dark }: { week: WeekHistoryEntry; current: boolean; dark: boolean }) {
  const { t } = useTranslation()
  // La semana en curso es la última de la tira; sale `met` si ya se cumplió.
  const met = week.state === 'met'
  const label = current
    ? t('progressTab.weekCurrentA11y', { done: week.done, goal: week.goal })
    : t(met ? 'progressTab.weekMetA11y' : 'progressTab.weekMissedA11y', { done: week.done, goal: week.goal })
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cn(
        'h-7 flex-1 rounded-[5px]',
        met ? 'bg-lime' : current ? 'bg-lime/20' : 'border border-border',
        current && 'border-2',
      )}
      style={current ? { borderColor: dark ? '#fafafa' : '#0a0a0a' } : undefined}
    />
  )
}

/** Mapa del mes en filas de 7: los días entrenados en lima, hoy recuadrado. */
function MonthGrid({ activity, today }: { activity: Record<string, boolean>; today: string }) {
  const days = Object.entries(activity)
  const rows: [string, boolean][][] = []
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))
  return (
    <View className="gap-1.5">
      {rows.map((row, r) => (
        <View key={r} className="flex-row gap-1.5">
          {row.map(([date, active]) => (
            <View
              key={date}
              className={cn(
                'aspect-square flex-1 items-center justify-center rounded-md',
                active ? 'bg-lime/75' : 'bg-muted',
                date === today && 'border-2 border-foreground',
              )}
            >
              <Text className={cn('text-[9px]', active ? 'text-lime-foreground' : 'text-muted-foreground/60')}>
                {parseInt(date.slice(8))}
              </Text>
            </View>
          ))}
          {/* Relleno de la última fila: las celdas no se estiran. */}
          {Array.from({ length: 7 - row.length }, (_, i) => <View key={`pad${i}`} className="flex-1" />)}
        </View>
      ))}
    </View>
  )
}

function LinkRow({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 border-b border-border py-2 active:bg-muted/40"
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="flex-1 gap-0.5">
        <Text className="font-sans-medium text-sm text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>{sub}</Text>
      </View>
      <ChevronRight size={16} color="hsl(0 0% 55%)" />
    </Pressable>
  )
}

const CardioRow = memo(function CardioRow({
  session,
  onPress,
}: {
  session: CardioSession
  onPress: (id: string) => void
}) {
  const { t } = useTranslation()
  const handlePress = useCallback(() => {
    if (session.id) onPress(session.id)
  }, [onPress, session.id])
  const dist = (session.distance_km ?? 0).toFixed(2)
  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
    >
      <View className="size-8 items-center justify-center rounded-full bg-sky-500/15">
        <Activity size={15} color="#0ea5e9" />
      </View>
      <View className="flex-1">
        <Text className="font-sans-medium text-foreground" numberOfLines={1}>
          {t(`cardio.${session.activity_type}`, { defaultValue: session.activity_type })} · {dist} km
        </Text>
        <Text className="text-xs text-muted-foreground">
          <Text className="font-mono text-[11px] text-muted-foreground/70">{relativeDate(utcToLocalDateStr(session.started_at))}</Text>
          {` · ${formatDuration(session.duration_seconds ?? 0)}`}
          {session.note ? ` · ${session.note}` : ''}
        </Text>
      </View>
      <ChevronRight size={16} color="hsl(0 0% 45%)" />
    </Pressable>
  )
})

const StrengthRow = memo(function StrengthRow({
  session,
  title,
  onPress,
}: {
  session: SessionDone
  title: string
  onPress: (date: string, workoutKey: string, title: string) => void
}) {
  const handlePress = useCallback(
    () => onPress(session.date, session.workoutKey, title),
    [onPress, session.date, session.workoutKey, title],
  )
  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
    >
      <View className="size-8 items-center justify-center rounded-full bg-lime/15">
        <Check size={15} color="hsl(74 90% 45%)" />
      </View>
      <View className="flex-1">
        <Text className="font-sans-medium text-foreground" numberOfLines={1}>{title}</Text>
        <Text className="text-xs text-muted-foreground">
          <Text className="font-mono text-[11px] text-muted-foreground/70">{relativeDate(session.date)}</Text>
          {session.note ? ` · ${session.note}` : ''}
        </Text>
      </View>
      <ChevronRight size={16} color="hsl(0 0% 45%)" />
    </Pressable>
  )
})

/** Cifra grande + etiqueta mono; `bordered` pone el filete de la izquierda. */
function StatCell({ label, value, bordered }: { label: string; value: number | string; bordered?: boolean }) {
  const numeric = typeof value === 'number' ? value : null
  const count = useCountUp(numeric ?? 0)
  const display = numeric !== null ? String(count) : value
  return (
    <View className={cn('flex-1 gap-0.5 py-3', bordered && 'border-l border-border pl-3.5')}>
      <Text className="font-bebas text-[30px] leading-none text-foreground" numberOfLines={1}>{display}</Text>
      <Kicker className="tracking-[1px]" numberOfLines={1}>{label}</Kicker>
    </View>
  )
}
