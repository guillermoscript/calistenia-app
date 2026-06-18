/** Stats agregadas + PRs + tendencia semanal — port móvil del CardioStats web. */
import { useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { formatPace, formatDuration, formatSpeed } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { CardioAggregateStats, PersonalRecords, WeeklyTrendPoint } from '@calistenia/core/hooks/useCardioStats'
import type { CardioSession } from '@calistenia/core/types'

interface Props {
  weeklyStats: CardioAggregateStats
  monthlyStats: CardioAggregateStats
  records: PersonalRecords
  weeklyTrend: WeeklyTrendPoint[]
  lastSession: CardioSession | null
}

/** Tarjeta principal: número grande con acento + unidad + etiqueta. */
function StatCard({ value, unit, label, accent }: { value: string; unit?: string; label: string; accent?: string }) {
  return (
    <View className="flex-1 rounded-xl bg-muted/60 px-3 py-3">
      <View className="flex-row items-baseline">
        <Text className={cn('font-bebas text-3xl leading-none', accent ?? 'text-foreground')} numberOfLines={1}>{value}</Text>
        {unit ? <Text className="ml-1 font-mono text-[10px] text-muted-foreground">{unit}</Text> : null}
      </View>
      <Text className="mt-1.5 font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** Métrica secundaria compacta (ritmo/velocidad/desnivel medios del periodo). */
function MiniStat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <View className="flex-1 items-center rounded-lg bg-muted/40 py-2.5">
      <Text className={cn('font-bebas text-lg leading-none', accent ?? 'text-foreground')} numberOfLines={1}>{value}</Text>
      <Text className="mt-1 font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export default function CardioStats({ weeklyStats, monthlyStats, records, weeklyTrend, lastSession }: Props) {
  const { t, i18n } = useTranslation()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const stats = period === 'week' ? weeklyStats : monthlyStats

  const hasRecords = Object.values(records).some((v) => v != null)
  const maxTrend = Math.max(...weeklyTrend.map((w) => w.distance), 0.1)

  // Filas de PRs: etiqueta ↔ valor (más legible que la rejilla centrada anterior).
  const prRows: { label: string; value: string; unit?: string }[] = []
  if (records.best1km != null) prRows.push({ label: t('cardio.best1km'), value: formatPace(records.best1km), unit: '/km' })
  if (records.best5km != null) prRows.push({ label: t('cardio.best5km'), value: formatPace(records.best5km), unit: '/km' })
  if (records.best10km != null) prRows.push({ label: t('cardio.best10km'), value: formatPace(records.best10km), unit: '/km' })
  if (records.bestPace != null) prRows.push({ label: t('cardio.bestPace'), value: formatPace(records.bestPace), unit: '/km' })
  if (records.longestDistance != null) prRows.push({ label: t('cardio.longestDistance'), value: String(records.longestDistance), unit: 'km' })
  if (records.highestElevation != null) prRows.push({ label: t('cardio.highestElevation'), value: String(records.highestElevation), unit: 'm' })

  return (
    <View className="gap-4">
      {/* Última sesión — destacada */}
      {lastSession ? <LastSessionCard session={lastSession} locale={i18n.language} t={t} /> : null}

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

      {/* Stats principales — rejilla 2×2 con acentos */}
      <View className="gap-2">
        <View className="flex-row gap-2">
          <StatCard value={stats.totalDistance.toFixed(1)} unit="km" label={t('cardio.totalKm')} accent="text-lime" />
          <StatCard value={formatDuration(stats.totalDuration)} label={t('cardio.totalTime')} accent="text-sky-500" />
        </View>
        <View className="flex-row gap-2">
          <StatCard value={String(stats.totalSessions)} label={t('cardio.sessions')} />
          <StatCard value={String(stats.totalCalories)} unit="kcal" label={t('nutrition.calories')} accent="text-amber-400" />
        </View>
      </View>

      {/* Medias del periodo */}
      {stats.totalSessions > 0 ? (
        <View className="flex-row gap-2">
          <MiniStat value={stats.avgPace > 0 ? formatPace(stats.avgPace) : '--:--'} label={t('cardio.avgPace')} accent="text-lime" />
          <MiniStat value={stats.avgSpeed > 0 ? `${formatSpeed(stats.avgSpeed)}` : '--'} label={`${t('cardio.avgSpeed')} (km/h)`} accent="text-sky-500" />
          <MiniStat value={`${stats.totalElevation}`} label={`${t('cardio.totalElevation')} (m)`} accent="text-amber-400" />
        </View>
      ) : null}

      {/* Tendencia: distancia por semana (últimas 8) */}
      {weeklyTrend.some((w) => w.distance > 0) ? (
        <View className="rounded-xl border border-border bg-card p-3">
          <Text className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
            {t('cardio.weeklyDistance')}
          </Text>
          <View className="h-24 flex-row items-end gap-1.5">
            {weeklyTrend.map((w, i) => {
              const isCurrent = i === weeklyTrend.length - 1
              return (
                <View key={i} className="flex-1 items-center justify-end gap-1">
                  {w.distance > 0 ? (
                    <Text className={cn('font-mono text-[7px]', isCurrent ? 'text-lime' : 'text-muted-foreground')} numberOfLines={1}>
                      {w.distance}
                    </Text>
                  ) : null}
                  <View
                    className={cn('w-full rounded-t', isCurrent ? 'bg-lime' : 'bg-lime/40')}
                    style={{ height: `${Math.max(4, Math.round((w.distance / maxTrend) * 100))}%` }}
                  />
                </View>
              )
            })}
          </View>
          <View className="mt-1 flex-row">
            {weeklyTrend.map((w, i) => (
              <Text
                key={i}
                className={cn(
                  'flex-1 text-center font-mono text-[7px]',
                  i === weeklyTrend.length - 1 ? 'text-lime' : 'text-muted-foreground',
                )}
                numberOfLines={1}
              >
                {w.weekLabel}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* PRs — filas etiqueta ↔ valor */}
      {hasRecords ? (
        <View className="rounded-xl border border-border bg-card px-3 py-1">
          <Text className="mb-1 mt-2.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
            {t('cardio.personalRecords')}
          </Text>
          {prRows.map((r, i) => (
            <View
              key={r.label}
              className={cn('flex-row items-center justify-between py-2.5', i < prRows.length - 1 && 'border-b border-border/40')}
            >
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
                {r.label}
              </Text>
              <View className="flex-row items-baseline gap-1">
                <Text className="font-bebas text-xl leading-none text-lime">{r.value}</Text>
                {r.unit ? <Text className="font-mono text-[9px] text-muted-foreground">{r.unit}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** Tarjeta destacada de la última sesión: icono de actividad + 3 métricas clave. */
function LastSessionCard({
  session,
  locale,
  t,
}: {
  session: CardioSession
  locale: string
  t: (k: string) => string
}) {
  const activity = CARDIO_ACTIVITY[session.activity_type] ?? CARDIO_ACTIVITY.running
  const isCycling = session.activity_type === 'cycling'
  const dateLabel = new Date(session.started_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const paceValue = isCycling
    ? (session.avg_speed_kmh ? formatSpeed(session.avg_speed_kmh) : '--')
    : (session.avg_pace ? formatPace(session.avg_pace) : '--:--')
  const paceLabel = isCycling ? `${t('cardio.speed')} (km/h)` : `${t('cardio.pace')} (/km)`

  return (
    <View className={cn('rounded-2xl border bg-card p-4', activity.bg)}>
      <View className="mb-3 flex-row items-center gap-2.5">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-background/60">
          <Text className="text-lg">{activity.icon}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
            {t('cardio.lastSession')}
          </Text>
          <Text className={cn('font-bebas text-base leading-none', activity.color)}>
            {t(`cardio.${session.activity_type}`)}
          </Text>
        </View>
        <Text className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground">{dateLabel}</Text>
      </View>
      <View className="flex-row">
        <View className="flex-1 items-center">
          <Text className="font-bebas text-2xl leading-none text-foreground">{session.distance_km.toFixed(2)}</Text>
          <Text className="mt-1 font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground">{t('cardio.distance')} (km)</Text>
        </View>
        <View className="flex-1 items-center">
          <Text className="font-bebas text-2xl leading-none text-foreground">{formatDuration(session.duration_seconds)}</Text>
          <Text className="mt-1 font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground">{t('cardio.duration')}</Text>
        </View>
        <View className="flex-1 items-center">
          <Text className="font-bebas text-2xl leading-none text-foreground">{paceValue}</Text>
          <Text className="mt-1 font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground">{paceLabel}</Text>
        </View>
      </View>
    </View>
  )
}
