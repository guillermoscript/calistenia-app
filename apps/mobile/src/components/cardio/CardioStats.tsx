/** Stats agregadas + PRs + tendencia semanal — port móvil del CardioStats web. */
import { useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { formatPace, formatDuration } from '@calistenia/core/lib/geo'
import type { CardioAggregateStats, PersonalRecords, WeeklyTrendPoint } from '@calistenia/core/hooks/useCardioStats'

interface Props {
  weeklyStats: CardioAggregateStats
  monthlyStats: CardioAggregateStats
  records: PersonalRecords
  weeklyTrend: WeeklyTrendPoint[]
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center rounded-xl bg-muted/60 px-2 py-3">
      <Text className="font-bebas text-2xl leading-none text-foreground">{value}</Text>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export default function CardioStats({ weeklyStats, monthlyStats, records, weeklyTrend }: Props) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const stats = period === 'week' ? weeklyStats : monthlyStats

  const hasRecords = Object.values(records).some((v) => v != null)
  const maxTrend = Math.max(...weeklyTrend.map((w) => w.distance), 0.1)

  return (
    <View className="gap-4">
      {/* Toggle semana / mes */}
      <View className="flex-row gap-1 self-start rounded-lg bg-muted/50 p-1">
        {(['week', 'month'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            className={cn('rounded-md px-3 py-1.5', period === p && 'bg-background')}
          >
            <Text className={cn('font-mono text-[10px] uppercase tracking-[1.5px]', period === p ? 'text-foreground' : 'text-muted-foreground')}>
              {t(p === 'week' ? 'cardio.thisWeek' : 'cardio.thisMonth')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row gap-2">
        <StatBox value={stats.totalDistance.toFixed(1)} label={t('cardio.totalKm')} />
        <StatBox value={String(stats.totalSessions)} label={t('cardio.sessions')} />
        <StatBox value={formatDuration(stats.totalDuration)} label={t('cardio.totalTime')} />
        <StatBox value={String(stats.totalCalories)} label={t('nutrition.calories')} />
      </View>

      {/* Tendencia: distancia por semana (últimas 8) */}
      {weeklyTrend.some((w) => w.distance > 0) && (
        <View className="rounded-xl border border-border bg-card p-3">
          <Text className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
            {t('cardio.weeklyDistance')}
          </Text>
          <View className="h-20 flex-row items-end gap-1.5">
            {weeklyTrend.map((w, i) => (
              <View key={i} className="flex-1 items-center gap-1">
                <View
                  className="w-full rounded-t bg-lime/70"
                  style={{ height: `${Math.max(4, Math.round((w.distance / maxTrend) * 100))}%` }}
                />
              </View>
            ))}
          </View>
          <View className="mt-1 flex-row">
            {weeklyTrend.map((w, i) => (
              <Text key={i} className="flex-1 text-center font-mono text-[7px] text-muted-foreground" numberOfLines={1}>
                {w.weekLabel}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* PRs */}
      {hasRecords && (
        <View className="rounded-xl border border-border bg-card p-3">
          <Text className="mb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
            {t('cardio.personalRecords')}
          </Text>
          <View className="flex-row flex-wrap">
            {records.best1km != null && <PR label={t('cardio.best1km')} value={formatPace(records.best1km)} />}
            {records.best5km != null && <PR label={t('cardio.best5km')} value={formatPace(records.best5km)} />}
            {records.best10km != null && <PR label={t('cardio.best10km')} value={formatPace(records.best10km)} />}
            {records.bestPace != null && <PR label={t('cardio.bestPace')} value={formatPace(records.bestPace)} />}
            {records.longestDistance != null && <PR label={t('cardio.longestDistance')} value={`${records.longestDistance} km`} />}
            {records.highestElevation != null && <PR label={t('cardio.highestElevation')} value={`${records.highestElevation} m`} />}
          </View>
        </View>
      )}
    </View>
  )
}

function PR({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/3 items-center py-2">
      <Text className="font-bebas text-xl leading-none text-lime">{value}</Text>
      <Text className="mt-0.5 text-center font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
