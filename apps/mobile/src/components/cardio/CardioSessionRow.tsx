/**
 * Fila de una sesión de cardio en el historial.
 *
 * La comparten el bloque de las últimas sesiones de la pantalla de Cardio y la
 * lista completa de `/cardio/history`: las dos pintan exactamente lo mismo.
 */
import { memo } from 'react'
import { View, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Trash2, ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { formatPace, formatSpeed, formatDuration } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { CardioSession } from '@calistenia/core/types'

interface Props {
  session: CardioSession
  onDelete: (id: string) => void
}

function CardioSessionRow({ session: s, onDelete }: Props) {
  const { t, i18n } = useTranslation()
  const router = useRouter()

  const isCycling = s.activity_type === 'cycling'
  const date = new Date(s.started_at)

  const confirmDelete = () => {
    Alert.alert(
      t('cardio.deleteSession'),
      t('cardio.deleteSessionConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => s.id && onDelete(s.id) },
      ],
    )
  }

  return (
    <View className="flex-row items-center overflow-hidden rounded-xl border border-border bg-card">
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

      {/* `self-stretch`, NO `h-full`: el padre tiene alto automático, así que un
          height:100% no tiene de qué calcular el porcentaje y Yoga acababa
          dando filas de millones de dp (historial en blanco). */}
      <Pressable
        onPress={confirmDelete}
        accessibilityRole="button"
        accessibilityLabel={t('cardio.deleteSession')}
        className="shrink-0 self-stretch justify-center border-l border-border px-3.5 py-3 active:bg-red-500/10"
      >
        <Trash2 size={15} color="#f87171" />
      </Pressable>
    </View>
  )
}

export default memo(CardioSessionRow)
