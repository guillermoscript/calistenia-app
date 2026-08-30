/** Historial de sesiones de cardio — port móvil del CardioHistory web. */
import { useMemo, useState } from 'react'
import { View, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Trash2, ChevronRight, MapPin, WifiOff } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { formatPace, formatSpeed, formatDuration } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { CardioActivityType, CardioSession } from '@calistenia/core/types'

/** Pestañas del historial: «todas» + un filtro por cada tipo de actividad. */
type HistoryFilter = 'all' | CardioActivityType
const FILTERS: HistoryFilter[] = ['all', 'running', 'walking', 'cycling']

interface Props {
  sessions: CardioSession[]
  loading: boolean
  onDelete: (id: string) => void
  /** CTA del empty state («Empezar cardio») — el padre decide (p. ej. subir al tracker). */
  onStart?: () => void
  /** La carga falló. Manda sobre la lista vacía: sin esto un 504 se pintaba
      como «no tienes sesiones», que es mentira (#559, CALISTENIA-APP-S). */
  error?: boolean
  onRetry?: () => void
}

export default function CardioHistory({ sessions, loading, onDelete, onStart, error, onRetry }: Props) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const visible = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.activity_type === filter)),
    [sessions, filter],
  )

  if (loading) {
    return (
      <View className="items-center rounded-xl border border-border bg-card py-8">
        <Text className="text-sm text-muted-foreground">{t('common.loading')}</Text>
      </View>
    )
  }

  // Antes que el vacío: no sabemos si hay sesiones, sólo que no pudimos leerlas.
  if (error) {
    return (
      <View className="items-center gap-2 rounded-xl border border-border bg-card px-4 py-8">
        <WifiOff size={22} color="#888899" />
        <Text className="text-center font-bebas text-lg text-foreground">{t('cardio.historyError')}</Text>
        <Text className="text-center text-xs text-muted-foreground">{t('cardio.historyErrorBody')}</Text>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            className="mt-2 rounded-lg border border-border px-4 py-2 active:opacity-70"
          >
            <Text className="font-mono text-[11px] uppercase tracking-widest text-foreground">{t('cardio.retry')}</Text>
          </Pressable>
        )}
      </View>
    )
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title={t('cardio.noSessions')}
        body={t('cardio.emptyBody')}
        ctaLabel={onStart ? t('cardio.emptyCta') : undefined}
        onCtaPress={onStart}
      />
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
    <View className="gap-3">
      {/* Pestañas de filtro */}
      <View className="flex-row gap-1 rounded-xl bg-muted/50 p-1">
        {FILTERS.map((f) => {
          const active = filter === f
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={f === 'all' ? t('cardio.filterAll') : t(`cardio.${f}`)}
              className={cn(
                'flex-1 shrink flex-row items-center justify-center gap-1 rounded-lg py-2',
                active && 'border border-lime/30 bg-background',
              )}
            >
              {/* Solo el icono para las actividades: cuatro etiquetas completas no
                  caben en una pantalla estrecha (el nombre va en accessibilityLabel). */}
              <Text
                className={cn('font-mono text-[10px] uppercase tracking-widest', active ? 'text-foreground' : 'text-muted-foreground')}
                numberOfLines={1}
              >
                {f === 'all' ? t('cardio.filterAll') : CARDIO_ACTIVITY[f]?.icon}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {visible.length === 0 ? (
        <View className="items-center rounded-xl border border-border bg-card py-8">
          <Text className="text-sm text-muted-foreground">{t('cardio.noSessionsOfType')}</Text>
        </View>
      ) : (
        <View className="gap-2">
          {visible.map((s) => {
            const isCycling = s.activity_type === 'cycling'
            const date = new Date(s.started_at)
            return (
              <View key={s.id} className="flex-row items-center overflow-hidden rounded-xl border border-border bg-card">
                {/* La fila abre el detalle (/cardio/[id]): mapa, elevación, splits
                    y compartir viven allí y no se duplican aquí. */}
                <Pressable
                  onPress={() => { if (s.id) router.push(`/cardio/${s.id}`) }}
                  disabled={!s.id}
                  accessibilityRole="button"
                  className="flex-1 shrink flex-row items-center gap-3 px-3.5 py-3 active:opacity-70"
                >
                  <Text className="text-xl">{CARDIO_ACTIVITY[s.activity_type]?.icon ?? '🏃'}</Text>
                  <View className="flex-1 shrink">
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
                  <ChevronRight size={16} color="#888899" />
                </Pressable>

                <Pressable
                  onPress={() => confirmDelete(s)}
                  accessibilityRole="button"
                  accessibilityLabel={t('cardio.deleteSession')}
                  /* `self-stretch`, NO `h-full`: el padre tiene alto automático, así que
                     un height:100% no tiene de qué calcular el porcentaje y Yoga acababa
                     dando filas de millones de dp (historial en blanco). */
                  className="shrink-0 self-stretch justify-center border-l border-border px-3.5 py-3 active:bg-red-500/10"
                >
                  <Trash2 size={15} color="#f87171" />
                </Pressable>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
