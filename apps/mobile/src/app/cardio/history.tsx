/**
 * Historial completo de cardio.
 *
 * La pantalla de Cardio sólo enseña las últimas sesiones; la lista entera vive
 * aquí, con sus filtros por actividad y carga paginada. Es una `FlatList` y no
 * un `ScrollView` a propósito: aquí no hay tope de sesiones.
 *
 * Ruta: /cardio/history
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, MapPin, WifiOff } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { EmptyState } from '@/components/ui/empty-state'
import CardioSessionRow from '@/components/cardio/CardioSessionRow'
import { cn } from '@/lib/utils'
import { useCardioSessionContext } from '@/contexts/CardioSessionContext'
import { Sentry } from '@/lib/instrument'
import {
  CARDIO_HISTORY_PAGE_SIZE,
  mergeCardioPages,
  hasMoreCardioPages,
} from '@calistenia/core/lib/cardio-history'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { CardioActivityType, CardioSession } from '@calistenia/core/types'

/** Pestañas: «todas» + un filtro por cada tipo de actividad. */
type HistoryFilter = 'all' | CardioActivityType
const FILTERS: HistoryFilter[] = ['all', 'running', 'walking', 'cycling']

export default function CardioHistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { getHistory, deleteSession } = useCardioSessionContext()

  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [sessions, setSessions] = useState<CardioSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(1)

  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.historyViewed, {
      surface: 'cardio_history', source: 'cardio_screen',
    })
  }, [])

  /** Primera página del filtro activo. Sustituye la lista, no la amplía. */
  const loadFirstPage = useCallback(async (activity: HistoryFilter) => {
    setError(false)
    try {
      const page = await getHistory(
        CARDIO_HISTORY_PAGE_SIZE, 1, activity === 'all' ? undefined : activity,
      )
      pageRef.current = 1
      setSessions(page)
      setHasMore(hasMoreCardioPages(CARDIO_HISTORY_PAGE_SIZE, page.length))
    } catch (e) {
      // Marcar el error, no sólo reportarlo: si no, la lista vacía mentiría
      // diciendo que no hay sesiones (#559, CALISTENIA-APP-S).
      setError(true)
      Sentry.captureException(e, { tags: { feature: 'cardio', op: 'load_history_full' } })
    }
  }, [getHistory])

  // Cambiar de pestaña recarga desde el servidor: el filtro es del `filter` de
  // PocketBase, no un `Array.filter` sobre lo que ya estaba cargado.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSessions([])
    void loadFirstPage(filter).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filter, loadFirstPage])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || refreshing || !hasMore || error) return
    setLoadingMore(true)
    try {
      const next = pageRef.current + 1
      const page = await getHistory(
        CARDIO_HISTORY_PAGE_SIZE, next, filter === 'all' ? undefined : filter,
      )
      pageRef.current = next
      setSessions((prev) => mergeCardioPages(prev, page))
      setHasMore(hasMoreCardioPages(CARDIO_HISTORY_PAGE_SIZE, page.length))
    } catch (e) {
      // Un fallo paginando no vacía lo ya cargado: se corta la paginación y se
      // deja lo que el usuario ya está leyendo.
      setHasMore(false)
      Sentry.captureException(e, { tags: { feature: 'cardio', op: 'load_history_page' } })
    } finally {
      setLoadingMore(false)
    }
  }, [getHistory, filter, loading, loadingMore, refreshing, hasMore, error])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadFirstPage(filter)
    setRefreshing(false)
  }, [loadFirstPage, filter])

  const handleDelete = useCallback(async (id: string) => {
    await deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [deleteSession])

  const renderItem = useCallback(
    ({ item }: { item: CardioSession }) => <CardioSessionRow session={item} onDelete={handleDelete} />,
    [handleDelete],
  )

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <FlatList
        data={error ? [] : sessions}
        keyExtractor={(s, i) => s.id ?? `local-${i}`}
        renderItem={renderItem}
        contentContainerClassName="px-4 pb-8 gap-2"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#888899" />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View className="gap-4 pb-3 pt-2">
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="-ml-2 p-2 active:opacity-60">
                <ChevronLeft size={22} color="#888899" />
              </Pressable>
              <View className="flex-1">
                <Kicker>{t('nav.cardio')}</Kicker>
                <Text className="font-bebas text-4xl leading-none text-foreground">
                  {t('cardio.history')}
                </Text>
              </View>
            </View>

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
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center rounded-xl border border-border bg-card py-10">
              <Text className="text-sm text-muted-foreground">{t('common.loading')}</Text>
            </View>
          ) : error ? (
            <View className="items-center gap-2 rounded-xl border border-border bg-card px-4 py-8">
              <WifiOff size={22} color="#888899" />
              <Text className="text-center font-bebas text-lg text-foreground">{t('cardio.historyError')}</Text>
              <Text className="text-center text-xs text-muted-foreground">{t('cardio.historyErrorBody')}</Text>
              <Pressable
                onPress={() => { setLoading(true); void loadFirstPage(filter).finally(() => setLoading(false)) }}
                accessibilityRole="button"
                className="mt-2 rounded-lg border border-border px-4 py-2 active:opacity-70"
              >
                <Text className="font-mono text-[11px] uppercase tracking-widest text-foreground">{t('cardio.retry')}</Text>
              </Pressable>
            </View>
          ) : filter === 'all' ? (
            <EmptyState icon={MapPin} title={t('cardio.noSessions')} body={t('cardio.emptyBody')} />
          ) : (
            <View className="items-center rounded-xl border border-border bg-card py-8">
              <Text className="text-sm text-muted-foreground">{t('cardio.noSessionsOfType')}</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="py-6">
              <ActivityIndicator color="#888899" />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}
