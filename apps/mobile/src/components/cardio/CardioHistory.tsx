/** Historial de sesiones de cardio — port móvil del CardioHistory web. */
import { useState } from 'react'
import { View, Pressable, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { formatPace, formatSpeed, formatDuration } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import RouteMap from './RouteMap'
import SplitsTable from './SplitsTable'
import type { CardioSession } from '@calistenia/core/types'

interface Props {
  sessions: CardioSession[]
  loading: boolean
  onDelete: (id: string) => void
}

export default function CardioHistory({ sessions, loading, onDelete }: Props) {
  const { t, i18n } = useTranslation()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (loading) {
    return (
      <View className="items-center rounded-xl border border-border bg-card py-8">
        <Text className="text-sm text-muted-foreground">{t('common.loading')}</Text>
      </View>
    )
  }

  if (sessions.length === 0) {
    return (
      <View className="items-center rounded-xl border border-dashed border-border py-8">
        <Text className="text-sm text-muted-foreground">{t('cardio.noSessions')}</Text>
        <Text className="mt-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/60">
          {t('cardio.startFirstSession')}
        </Text>
      </View>
    )
  }

  const confirmDelete = (session: CardioSession) => {
    Alert.alert(
      t('cardio.deleteSession'),
      t('cardio.deleteSessionConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => session.id && onDelete(session.id) },
      ],
    )
  }

  return (
    <View className="gap-2">
      {sessions.map((s) => {
        const expanded = expandedId === s.id
        const isCycling = s.activity_type === 'cycling'
        const date = new Date(s.started_at)
        return (
          <View key={s.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <Pressable
              onPress={() => setExpandedId(expanded ? null : (s.id ?? null))}
              className="flex-row items-center gap-3 px-3.5 py-3 active:opacity-70"
            >
              <Text className="text-xl">{CARDIO_ACTIVITY[s.activity_type]?.icon ?? '🏃'}</Text>
              <View className="flex-1">
                <View className="flex-row items-baseline gap-2">
                  <Text className="font-bebas text-lg leading-none text-foreground">
                    {s.distance_km.toFixed(2)} km
                  </Text>
                  <Text className="font-mono text-[11px] text-muted-foreground">
                    {formatDuration(s.duration_seconds)}
                  </Text>
                  <Text className="font-mono text-[11px] text-sky-500">
                    {isCycling ? `${formatSpeed(s.avg_speed_kmh ?? 0)} km/h` : `${formatPace(s.avg_pace)} /km`}
                  </Text>
                </View>
                <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {date.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}
                  {date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {expanded ? <ChevronUp size={16} color="#888899" /> : <ChevronDown size={16} color="#888899" />}
            </Pressable>

            {expanded && (
              <View className="gap-3 border-t border-border px-3.5 py-3">
                {s.gps_points.length > 1 && (
                  <RouteMap points={s.gps_points} pointsVersion={s.gps_points.length} height={160} activityType={s.activity_type} />
                )}
                <View className="flex-row gap-2">
                  <MiniStat value={String(s.calories_burned ?? 0)} label={t('nutrition.calories')} />
                  <MiniStat value={`${s.elevation_gain ?? 0}m`} label={t('cardio.elevation')} />
                  <MiniStat
                    value={isCycling ? formatSpeed(s.max_speed_kmh ?? 0) : formatPace(s.max_pace ?? 0)}
                    label={isCycling ? t('cardio.maxSpeed') : t('cardio.maxPace')}
                  />
                </View>
                {s.splits && s.splits.length > 0 && <SplitsTable splits={s.splits} />}
                {s.note ? <Text className="text-xs italic text-muted-foreground">{s.note}</Text> : null}
                <Pressable
                  onPress={() => confirmDelete(s)}
                  className="flex-row items-center justify-center gap-1.5 rounded-lg border border-red-500/20 py-2 active:bg-red-500/10"
                >
                  <Trash2 size={13} color="#f87171" />
                  <Text className="font-mono text-[10px] uppercase tracking-[1.5px] text-red-400">
                    {t('cardio.deleteSession')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center rounded-lg bg-muted/40 py-2">
      <Text className="font-bebas text-base leading-none text-amber-400">{value}</Text>
      <Text className="mt-0.5 font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
