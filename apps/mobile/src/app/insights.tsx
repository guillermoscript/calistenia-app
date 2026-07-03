/**
 * "Tus semanas" — historial de insights cross-métrica ya generados (épica #128
 * Fase 3, issue #132). Lista de resúmenes semanales/mensuales, más recientes
 * primero, expandibles inline. Reusa el mismo idioma visual de correlaciones/
 * logros/a vigilar/sugerencia que InsightsCard.tsx (la card de Home).
 */
import { useCallback, useEffect, useState } from 'react'
import { View, Pressable, FlatList, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ChevronLeft, ChevronDown } from 'lucide-react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import {
  useInsightHistory,
  type CrossInsight,
  type InsightPeriodType,
} from '@calistenia/core/hooks/useCrossInsights'
import { sortByStrength, CorrelationRow, Disclaimer, relativeTime } from '@/components/insights/InsightsCard'

/** "Semana del 23 jun" / "Mes de junio 2026" — a partir de period_start (YYYY-MM-DD local). */
function periodLabel(periodStart: string, periodType: InsightPeriodType, t: TFunction): string {
  const d = new Date(`${periodStart}T12:00:00`)
  if (Number.isNaN(d.getTime())) return periodStart
  if (periodType === 'monthly') {
    const month = d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
    return t('insights.history.monthOf', 'Mes de {{month}}', { month })
  }
  const date = d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  return t('insights.history.weekOf', 'Semana del {{date}}', { date })
}

interface WeekCardProps {
  insight: CrossInsight
  expanded: boolean
  onToggle: () => void
  t: TFunction
}

/** Una fila del historial — colapsada muestra headline + periodo; expandida, el payload completo. */
function WeekCard({ insight, expanded, onToggle, t }: WeekCardProps) {
  const reduceMotion = useReducedMotion()
  const rotation = useSharedValue(0)
  useEffect(() => {
    rotation.set(withTiming(expanded ? 180 : 0, { duration: reduceMotion ? 1 : 180, easing: Easing.out(Easing.quad) }))
  }, [expanded, reduceMotion, rotation])
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }))

  const sortedCorrelations = sortByStrength(insight.payload.correlations)
  const hasBody =
    sortedCorrelations.length > 0 ||
    insight.payload.wins.length > 0 ||
    insight.payload.watchouts.length > 0 ||
    !!insight.payload.suggestion

  return (
    <View className="rounded-xl border border-border bg-card overflow-hidden">
      <Pressable
        onPress={hasBody ? onToggle : undefined}
        className={cn('flex-row items-center justify-between gap-3 px-4 py-3', hasBody && 'active:bg-muted/30')}
      >
        <View className="flex-1 gap-0.5">
          <Text className="font-bebas text-xl leading-none text-foreground" numberOfLines={1}>
            {insight.payload.headline}
          </Text>
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {periodLabel(insight.periodStart, insight.periodType, t)}
            {!!insight.generatedAt && ` · ${relativeTime(insight.generatedAt)}`}
          </Text>
        </View>
        {hasBody && (
          <Animated.View style={chevronStyle}>
            <ChevronDown size={16} color="rgba(255,255,255,0.4)" />
          </Animated.View>
        )}
      </Pressable>

      {expanded && hasBody && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          className="gap-3 border-t border-border px-4 pb-4 pt-3"
        >
          {sortedCorrelations.length > 0 && (
            <View className="gap-3">
              {sortedCorrelations.map((c, i) => (
                <CorrelationRow key={i} c={c} />
              ))}
              <Disclaimer />
            </View>
          )}

          {insight.payload.wins.length > 0 && (
            <View className="gap-1">
              <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {t('insights.card.wins', 'LOGROS')}
              </Text>
              {insight.payload.wins.map((w, i) => (
                <Text key={i} className="font-sans text-sm text-foreground">✓ {w}</Text>
              ))}
            </View>
          )}

          {insight.payload.watchouts.length > 0 && (
            <View className="gap-1">
              <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {t('insights.card.watch', 'A VIGILAR')}
              </Text>
              {insight.payload.watchouts.map((w, i) => (
                <Text key={i} className="font-sans text-sm text-foreground">• {w}</Text>
              ))}
            </View>
          )}

          {!!insight.payload.suggestion && (
            <View className="gap-1 border-t border-border pt-3">
              <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {t('insights.card.tip', 'SUGERENCIA')}
              </Text>
              <Text className="font-sans-medium text-sm text-foreground">{insight.payload.suggestion}</Text>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  )
}

export default function InsightsHistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const authUser = useAuthUser()
  const userId = authUser?.id ?? null

  const [periodType, setPeriodType] = useState<InsightPeriodType>('weekly')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const { data, isLoading, isError } = useInsightHistory(userId, periodType)

  const toggle = useCallback((id: string) => {
    haptics.selection()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header — mismo patrón que reminders.tsx: back button + kicker/title */}
      <View className="px-4 pt-2 pb-2">
        <Pressable
          onPress={() => { haptics.selection(); router.back() }}
          className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Atrás' })}
        >
          <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
        </Pressable>
        <Text className="font-bebas text-4xl text-foreground">
          {t('insights.history.title', 'Tus semanas')}
        </Text>

        {/* Segmented toggle: semanal / mensual */}
        <View className="flex-row gap-2 mt-4">
          {(['weekly', 'monthly'] as const).map((pt) => {
            const active = periodType === pt
            return (
              <Pressable
                key={pt}
                onPress={() => { haptics.selection(); setPeriodType(pt) }}
                className={cn(
                  'flex-1 py-2.5 rounded-xl items-center border',
                  active ? 'bg-lime/10 border-lime/40' : 'bg-muted/20 border-transparent',
                )}
              >
                <Text
                  className={cn(
                    'font-mono text-[11px] uppercase tracking-widest',
                    active ? 'text-lime' : 'text-muted-foreground',
                  )}
                >
                  {pt === 'weekly' ? t('insights.history.weekly', 'Semanal') : t('insights.history.monthly', 'Mensual')}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Body */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color="#a3e635" />
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-destructive text-center">
            {t('insights.history.error', 'No se pudo cargar el historial.')}
          </Text>
        </View>
      ) : !data || data.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-bebas text-xl tracking-wide text-muted-foreground text-center">
            {t('insights.history.empty', 'Aún no tienes resúmenes todavía')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, idx) => item.id ?? `${item.periodStart}-${idx}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <WeekCard
              insight={item}
              expanded={!!item.id && expandedIds.has(item.id)}
              onToggle={() => item.id && toggle(item.id)}
              t={t}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}
