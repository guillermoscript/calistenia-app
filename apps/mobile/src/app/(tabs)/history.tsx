import { useMemo } from 'react'
import { useCountUp } from '@/lib/use-count-up'
import { View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, Activity, ChevronRight, Camera } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { MenuButton } from '@/components/QuickMenu'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { relativeDate, todayStr } from '@calistenia/core/lib/dateUtils'
import { formatDuration } from '@calistenia/core/lib/geo'
import type { SessionDone, CardioSession } from '@calistenia/core/types'

// Fila unificada del historial: entreno (fuerza/yoga) o sesión de cardio GPS.
type HistoryRow =
  | { kind: 'strength'; ts: number; session: SessionDone }
  | { kind: 'cardio'; ts: number; session: CardioSession }

export default function HistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { progress, settings } = useWorkoutState()
  const { getWorkout, getTotalSessions, getLongestStreak, getWeeklyDoneCount, getMonthActivity } = useWorkoutActions()
  const { sessions: cardioSessions } = useCardioSessions(user?.id ?? null)

  // Combina entrenos (progress) y cardio (cardio_sessions) en una sola lista
  // ordenada por fecha/hora. Las stats de cabecera siguen contando solo entrenos.
  const rows = useMemo<HistoryRow[]>(() => {
    const strength: HistoryRow[] = Object.entries(progress)
      // Excluye días de cardio de programa (cardioSessionId): ya se pintan como fila de cardio.
      .filter(([k, v]) => k.startsWith('done_') && (v as SessionDone).done && !(v as SessionDone).cardioSessionId)
      .map(([, v]) => {
        const s = v as SessionDone
        return { kind: 'strength' as const, ts: s.completedAt ?? Date.parse(`${s.date}T12:00:00`), session: s }
      })
    const cardio: HistoryRow[] = cardioSessions.map(c => ({
      kind: 'cardio' as const,
      ts: Date.parse(c.started_at),
      session: c,
    }))
    return [...strength, ...cardio]
      .filter(r => Number.isFinite(r.ts))
      .sort((a, b) => b.ts - a.ts)
  }, [progress, cardioSessions])

  const monthActivity = useMemo(() => getMonthActivity(), [getMonthActivity])
  const today = todayStr()

  const titleFor = (s: SessionDone): string => {
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
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => r.kind === 'cardio' ? `c_${r.session.id}_${i}` : `s_${r.session.date}_${r.session.workoutKey}_${i}`}
        contentContainerClassName="px-4 pb-8 gap-2"
        ListHeaderComponent={
          <View className="gap-4 pb-3 pt-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-bebas text-4xl leading-none text-foreground">{t('progress.title')}</Text>
              <MenuButton />
            </View>

            {/* Stats */}
            <View className="flex-row gap-3">
              <StatCard label={t('progress.recentSessions')} value={getTotalSessions()} />
              <StatCard label={t('common.week')} value={`${getWeeklyDoneCount()}/${settings.weeklyGoal || 5}`} />
              <StatCard label="Racha" value={getLongestStreak()} />
            </View>

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
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('progress.recentSessions')}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-1 py-8">
            <Text className="font-semibold text-foreground">{t('progress.noData')}</Text>
            <Text className="text-center text-sm text-muted-foreground">{t('progress.noDataDesc')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'cardio') {
            const c = item.session
            const dist = (c.distance_km ?? 0).toFixed(2)
            return (
              <Pressable
                onPress={() => router.push(`/cardio/${c.id}`)}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
              >
                <View className="size-8 items-center justify-center rounded-full bg-sky-500/15">
                  <Activity size={15} color="#0ea5e9" />
                </View>
                <View className="flex-1">
                  <Text className="font-sans-medium text-foreground" numberOfLines={1}>
                    {t(`cardio.${c.activity_type}`, { defaultValue: c.activity_type })} · {dist} km
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    <Text className="font-mono text-[11px] text-muted-foreground/70">{relativeDate(c.started_at.slice(0, 10))}</Text>
                    {` · ${formatDuration(c.duration_seconds ?? 0)}`}
                    {c.note ? ` · ${c.note}` : ''}
                  </Text>
                </View>
                <ChevronRight size={16} color="hsl(0 0% 45%)" />
              </Pressable>
            )
          }
          const s = item.session
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/session-detail', params: { date: s.date, workoutKey: s.workoutKey, title: titleFor(s) } })}
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
            >
              <View className="size-8 items-center justify-center rounded-full bg-lime/15">
                <Check size={15} color="hsl(74 90% 45%)" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground" numberOfLines={1}>{titleFor(s)}</Text>
                <Text className="text-xs text-muted-foreground">
                  <Text className="font-mono text-[11px] text-muted-foreground/70">{relativeDate(s.date)}</Text>
                  {s.note ? ` · ${s.note}` : ''}
                </Text>
              </View>
              <ChevronRight size={16} color="hsl(0 0% 45%)" />
            </Pressable>
          )
        }}
      />
    </SafeAreaView>
  )
}

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
