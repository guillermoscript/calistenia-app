import { memo, useCallback, useEffect, useMemo } from 'react'
import { useCountUp } from '@/lib/use-count-up'
import { View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, Activity, ChevronRight, Camera, Dumbbell, CalendarDays, Swords } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { OneShotHint } from '@/components/ui/one-shot-hint'
import { MenuButton } from '@/components/QuickMenu'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { useBattleHistory } from '@calistenia/core/hooks/useBattleHistory'
import { relativeDate, todayStr } from '@calistenia/core/lib/dateUtils'
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

export default function HistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { progress, settings } = useWorkoutState()
  const { getWorkout, getTotalSessions, getLongestStreak, getWeeklyDoneCount, getMonthActivity } = useWorkoutActions()
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
  // ordenada por fecha/hora. Las stats de cabecera siguen contando solo entrenos.
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

  // Cada uno de estos barre `progress` entero. Sin memo se repetían los cuatro
  // barridos en cada render de la pantalla (y la cabecera se reconstruía entera).
  const totalSessions = useMemo(() => getTotalSessions(), [getTotalSessions])
  const weeklyDone = useMemo(() => getWeeklyDoneCount(), [getWeeklyDoneCount])
  const longestStreak = useMemo(() => getLongestStreak(), [getLongestStreak])

  // #636 §4: el historial no emitía nada, así que no se sabía si la gente
  // vuelve a mirar lo que ha hecho.
  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.historyViewed, {
      surface: 'history', source: 'history_tab',
      total_sessions: totalSessions,
      streak: longestStreak,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- una vista por visita

  const openCardio = useCallback((id: string) => router.push(`/cardio/${id}`), [router])
  const openStrength = useCallback(
    (date: string, workoutKey: string, title: string) =>
      router.push({ pathname: '/session-detail', params: { date, workoutKey, title } }),
    [router],
  )

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
      <View className="gap-4 pb-3 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('progress.title')}</Text>
          <MenuButton />
        </View>

        {/* Stats */}
        <View className="flex-row gap-3">
          <StatCard label={t('progress.recentSessions')} value={totalSessions} />
          <StatCard label={t('common.week')} value={`${weeklyDone}/${settings.weeklyGoal || 5}`} />
          <StatCard label="Racha" value={longestStreak} />
        </View>

        {/* Hint one-shot: calendario unificado (#235) */}
        <OneShotHint
          id="calendar_metrics"
          userId={user?.id ?? null}
          icon={CalendarDays}
          text={t('hints.calendarMetrics')}
          onPress={() => router.push('/calendar')}
          visible={totalSessions >= 3}
        />

        {/* Actividad del mes */}
        <Card>
          <CardContent className="py-4">
            <Text className="mb-2.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('common.month')}
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {Object.entries(monthActivity).map(([date, active]) => (
                <View
                  key={date}
                  className={cn(
                    'size-6 items-center justify-center rounded',
                    active ? 'bg-lime/80' : 'bg-muted',
                    date === today && 'border border-lime',
                  )}
                >
                  <Text className={cn('text-[8px]', active ? 'text-lime-foreground' : 'text-muted-foreground/60')}>
                    {parseInt(date.slice(8))}
                  </Text>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Batallas (#398): el historial es lo que convierte una batalla en
            entrenamiento y no en una anécdota que se ve una vez y desaparece. */}
        {battleRecord.fought > 0 && (
          <Pressable onPress={() => router.push('/battle-history')}>
            <Card>
              <CardContent className="flex-row items-center gap-3 py-4">
                <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                  <Swords size={18} color="hsl(74 90% 57%)" />
                </View>
                <View className="flex-1">
                  <Text className="font-sans-medium text-foreground">{t('battle.historyTitle')}</Text>
                  <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                    {battleRecord.won}/{battleRecord.fought} {t('battle.recordWon').toLowerCase()}
                  </Text>
                </View>
                <ChevronRight size={18} color="hsl(0 0% 45%)" />
              </CardContent>
            </Card>
          </Pressable>
        )}

        {/* Fotos de progreso */}
        <Pressable onPress={() => router.push('/progress-photos')}>
          <Card>
            <CardContent className="flex-row items-center gap-3 py-4">
              <View className="size-10 items-center justify-center rounded-full bg-lime/10">
                <Camera size={18} color="hsl(74 90% 57%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t('progress.bodyPhotos.title')}</Text>
                <Text className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                  {t('progress.bodyPhotos.rowDesc')}
                </Text>
              </View>
              <ChevronRight size={18} color="hsl(0 0% 45%)" />
            </CardContent>
          </Card>
        </Pressable>

        {rows.length > 0 && (
          <Kicker>
            {t('progress.recentSessions')}
          </Kicker>
        )}
      </View>
    ),
    [
      t,
      totalSessions,
      weeklyDone,
      longestStreak,
      settings.weeklyGoal,
      user?.id,
      monthActivity,
      today,
      battleRecord,
      rows.length,
      router,
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
          onCtaPress={() => router.push('/')}
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
          <Text className="font-mono text-[11px] text-muted-foreground/70">{relativeDate(session.started_at.slice(0, 10))}</Text>
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

function StatCard({ label, value }: { label: string; value: number | string }) {
  const numeric = typeof value === 'number' ? value : null
  const count = useCountUp(numeric ?? 0)
  const display = numeric !== null ? String(count) : value
  return (
    <Card className="flex-1">
      <CardContent className="items-center py-3.5">
        <Text className="font-bebas text-2xl leading-none text-foreground">{display}</Text>
        <Text className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground" numberOfLines={1}>{label}</Text>
      </CardContent>
    </Card>
  )
}
