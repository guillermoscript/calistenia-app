/**
 * Últimas sesiones de cardio dentro de la pantalla de Cardio.
 *
 * Es un resumen, no el historial: enseña las `limit` más recientes y manda a
 * `/cardio/history` para el resto. Los filtros por actividad y la lista
 * completa viven allí — sobre tres filas no significan nada, y la pantalla de
 * Cardio ya carga con el tracker, las competencias y las estadísticas.
 */
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MapPin, WifiOff, ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { EmptyState } from '@/components/ui/empty-state'
import CardioSessionRow from '@/components/cardio/CardioSessionRow'
import type { CardioSession } from '@calistenia/core/types'

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
  /** Cuántas sesiones se enseñan aquí. */
  limit?: number
  /** Abre la lista completa. Sin esto no se pinta el enlace. */
  onSeeAll?: () => void
}

export default function CardioHistory({
  sessions, loading, onDelete, onStart, error, onRetry, limit = 3, onSeeAll,
}: Props) {
  const { t } = useTranslation()

  const header = (
    <View className="flex-row items-center justify-between">
      <Kicker>{t('cardio.history')}</Kicker>
      {onSeeAll && sessions.length > 0 && (
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          className="-mr-1 flex-row items-center gap-0.5 py-1 pl-3 pr-1 active:opacity-60"
        >
          <Kicker>{t('cardio.seeAll')}</Kicker>
          <ChevronRight size={13} color="#888899" />
        </Pressable>
      )}
    </View>
  )

  if (loading) {
    return (
      <View className="gap-3">
        {header}
        <View className="items-center rounded-xl border border-border bg-card py-8">
          <Text className="text-sm text-muted-foreground">{t('common.loading')}</Text>
        </View>
      </View>
    )
  }

  // Antes que el vacío: no sabemos si hay sesiones, sólo que no pudimos leerlas.
  if (error) {
    return (
      <View className="gap-3">
        {header}
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
      </View>
    )
  }

  if (sessions.length === 0) {
    return (
      <View className="gap-3">
        {header}
        <EmptyState
          icon={MapPin}
          title={t('cardio.noSessions')}
          body={t('cardio.emptyBody')}
          ctaLabel={onStart ? t('cardio.emptyCta') : undefined}
          onCtaPress={onStart}
        />
      </View>
    )
  }

  return (
    <View className="gap-3">
      {header}
      <View className="gap-2">
        {sessions.slice(0, limit).map((s) => (
          <CardioSessionRow key={s.id} session={s} onDelete={onDelete} />
        ))}
      </View>
    </View>
  )
}
