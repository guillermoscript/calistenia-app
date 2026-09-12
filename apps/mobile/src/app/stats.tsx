/**
 * /stats — Estadísticas de entrenamiento: músculos, ejercicios, récords y
 * tendencia sobre el `ProgressMap` ya cargado. Todo el cálculo vive en
 * `packages/core/lib/training-stats.ts` (vía `useTrainingStats`); esta
 * pantalla y sus componentes en `components/stats/` solo pintan.
 */
import { useCallback, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, BarChart3 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { haptics } from '@/lib/haptics'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useTrainingStats } from '@calistenia/core/hooks/useTrainingStats'
import { type StatsPeriod } from '@calistenia/core/lib/training-stats'

import { PeriodSelector } from '@/components/stats/PeriodSelector'
import { MuscleBars } from '@/components/stats/MuscleBars'
import { BalanceBar } from '@/components/stats/BalanceBar'
import { ExerciseRanking } from '@/components/stats/ExerciseRanking'
import { RecordsList } from '@/components/stats/RecordsList'
import { WeeklyBars } from '@/components/stats/WeeklyBars'
import { WeekdayBars } from '@/components/stats/WeekdayBars'

/** Rejilla 2×2 — mismo markup que StatCard de CardioStats. */
function StatCard({ value, label }: { value: number | string; label: string }) {
  return (
    <View className="flex-1 rounded-xl bg-muted/60 px-3 py-3">
      <Text className="font-bebas text-3xl leading-none text-foreground" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-1.5 font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** Media compacta — mismo markup que MiniStat de CardioStats. */
function MiniStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View className="flex-1 items-center rounded-lg bg-muted/40 py-2.5">
      <Text className="font-bebas text-lg leading-none text-lime" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-1 font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export default function StatsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { progress } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const [period, setPeriod] = useState<StatsPeriod>('3m')

  const { stats, ready } = useTrainingStats(progress, getWorkout, period)
  // Barato (mismo recorrido en memoria del ProgressMap ya cargado); solo se
  // lee si el periodo actual resulta vacío, para ofrecer "ver todo".
  const { stats: allStats } = useTrainingStats(progress, getWorkout, 'all')

  const isEmpty = ready && stats.totals.sessions === 0 && stats.totals.sets === 0
  const hasDataOutsideRange =
    period !== 'all' && (allStats.totals.sessions > 0 || allStats.totals.sets > 0)

  const widenPeriod = useCallback(() => setPeriod('all'), [])
  const goHome = useCallback(() => router.push('/'), [router])
  const goBack = useCallback(() => { haptics.selection(); router.back() }, [router])

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 pt-2 pb-2">
        <Pressable
          onPress={goBack}
          className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
        </Pressable>
        <Text className="font-bebas text-4xl text-foreground">{t('stats.title')}</Text>
        <View className="mt-4">
          <PeriodSelector period={period} onChange={setPeriod} />
        </View>
      </View>

      {!ready ? (
        <View className="gap-4 px-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </View>
      ) : isEmpty ? (
        <View className="flex-1 justify-center px-4">
          <EmptyState
            icon={BarChart3}
            title={t('stats.empty.title')}
            body={hasDataOutsideRange ? t('stats.empty.bodyWiden') : t('stats.empty.body')}
            ctaLabel={hasDataOutsideRange ? t('stats.empty.ctaWiden') : t('stats.empty.cta')}
            onCtaPress={hasDataOutsideRange ? widenPeriod : goHome}
          />
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-4 px-4 pb-10" showsVerticalScrollIndicator={false}>
          {/* Totales */}
          <View className="gap-3">
            <Kicker>{t('stats.totals')}</Kicker>
            <Card>
              <CardContent className="gap-2 py-4">
                <View className="flex-row gap-2">
                  <StatCard value={stats.totals.sessions} label={t('stats.sessions')} />
                  <StatCard value={stats.totals.sets} label={t('stats.sets')} />
                </View>
                <View className="flex-row gap-2">
                  <StatCard value={stats.totals.reps} label={t('stats.reps')} />
                  <StatCard value={stats.totals.minutes} label={t('stats.minutes')} />
                </View>
                <View className="mt-1 flex-row gap-2">
                  <MiniStat value={stats.totals.avgSetsPerSession} label={t('stats.setsPerSession')} />
                  <MiniStat value={stats.totals.avgMinutesPerSession} label={t('stats.minPerSession')} />
                </View>
                {stats.totals.volumeKg > 0 ? (
                  <View className="mt-1 flex-row items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                      {t('stats.volume')}
                    </Text>
                    <Text className="font-bebas text-lg leading-none text-lime">{stats.totals.volumeKg} kg</Text>
                  </View>
                ) : null}
              </CardContent>
            </Card>
          </View>

          {/* Músculos */}
          {stats.muscles.groups.length > 0 ? (
            <View className="gap-3">
              <Kicker>{t('stats.muscles')}</Kicker>
              <Card>
                <CardContent className="gap-4 py-4">
                  <MuscleBars groups={stats.muscles.groups} />
                  <BalanceBar balance={stats.muscles.balance} />
                  {stats.muscles.unassignedSets > 0 ? (
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      {t('stats.unassigned', { count: stats.muscles.unassignedSets })}
                    </Text>
                  ) : null}
                </CardContent>
              </Card>
            </View>
          ) : null}

          {/* Ejercicios */}
          {stats.exercises.length > 0 ? (
            <View className="gap-3">
              <Kicker>{t('stats.topExercises')}</Kicker>
              <Card>
                <CardContent className="gap-1 py-3">
                  <ExerciseRanking exercises={stats.exercises} />
                  {stats.unknownExerciseSets > 0 ? (
                    <Text className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t('stats.unknownExercises', { count: stats.unknownExerciseSets })}
                    </Text>
                  ) : null}
                </CardContent>
              </Card>
            </View>
          ) : null}

          {/* Récords */}
          {stats.records.length > 0 ? (
            <View className="gap-3">
              <Kicker>{t('stats.records')}</Kicker>
              <Card>
                <CardContent className="py-1">
                  <RecordsList records={stats.records} />
                </CardContent>
              </Card>
            </View>
          ) : null}

          {/* Tendencia */}
          <View className="gap-3">
            <Kicker>{t('stats.trend')}</Kicker>
            <Card>
              <CardContent className="gap-5 py-4">
                <WeeklyBars weekly={stats.weekly} />
                <WeekdayBars weekdays={stats.weekdays} />
              </CardContent>
            </Card>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
