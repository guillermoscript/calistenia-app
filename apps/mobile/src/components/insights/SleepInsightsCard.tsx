/** Sleep-only pattern summary card — collapsible "Tu sueño" on the sleep screen (issue #244, Fase 5). */
import React, { useCallback, useEffect, useState } from 'react'
import { View, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
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
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useSleepInsight,
  MIN_SLEEP_INSIGHT_DAYS,
  type SleepInsightPayload,
} from '@calistenia/core/hooks/useSleepInsight'

type Trend = SleepInsightPayload['trend']

// Mismo idioma que InsightsCard cross-métrica: flecha + palabra corta en Mono.
const TREND_META: Record<Trend, { arrow: string; className: string; key: string; fallback: string }> = {
  improving: { arrow: '↑', className: 'text-lime', key: 'sleep.insight.trend.improving', fallback: 'Mejorando' },
  stable: { arrow: '→', className: 'text-muted-foreground', key: 'sleep.insight.trend.stable', fallback: 'Estable' },
  declining: { arrow: '↓', className: 'text-amber-400', key: 'sleep.insight.trend.declining', fallback: 'Bajando' },
}

const CONSISTENCY_META: Record<
  SleepInsightPayload['bedtimeConsistency'],
  { className: string; key: string; fallback: string }
> = {
  consistent: { className: 'text-lime', key: 'sleep.insight.bedtimeConsistency.consistent', fallback: 'Consistente' },
  variable: { className: 'text-amber-400', key: 'sleep.insight.bedtimeConsistency.variable', fallback: 'Variable' },
  irregular: { className: 'text-destructive', key: 'sleep.insight.bedtimeConsistency.irregular', fallback: 'Irregular' },
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

/** "hace 2h" / "ayer" / "hace 3d" — mismo idioma que InsightsCard cross-métrica. */
function relativeTime(iso?: string): string {
  if (!iso) return ''
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60))
  if (hours < 1) return 'ahora'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'ayer' : `hace ${days}d`
}

function TrendBadge({ trend }: { trend: Trend }) {
  const { t } = useTranslation()
  const meta = TREND_META[trend]
  return (
    <View className="flex-row items-center gap-1">
      <Text className={cn('font-mono text-xs', meta.className)}>{meta.arrow}</Text>
      <Text className={cn('font-mono text-[9px] uppercase tracking-widest', meta.className)}>
        {t(meta.key, meta.fallback)}
      </Text>
    </View>
  )
}

function GenerateButton({ isGenerating, onGenerate }: { isGenerating: boolean; onGenerate: () => void }) {
  const { t } = useTranslation()
  return (
    <Button variant="lime" size="sm" onPress={onGenerate} disabled={isGenerating} className="self-start">
      {isGenerating && <ActivityIndicator size="small" color="#a3e635" />}
      <Text>
        {isGenerating ? t('sleep.insight.generating', 'Generando…') : t('sleep.insight.generate', 'Generar resumen')}
      </Text>
    </Button>
  )
}

/** Disclaimer siempre visible — correlación ≠ causa. */
function Disclaimer() {
  const { t } = useTranslation()
  return (
    <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
      {t('sleep.insight.disclaimer', 'Patrones observados, no causas ni consejo médico.')}
    </Text>
  )
}

interface SleepInsightsCardProps {
  userId: string | null
}

function SleepInsightsCard({ userId }: SleepInsightsCardProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [genError, setGenError] = useState(false)
  const { insight, isLoading, isGenerating, generate, needsMoreData, notSaved } = useSleepInsight(userId, 'weekly')

  // Rotación del caret (▼ → ▲ visual al girar 180°) — honra "reducir movimiento"
  // con una transición casi instantánea, mismo idioma que InsightsCard.
  const reduceMotion = useReducedMotion()
  const caretRotation = useSharedValue(0)
  useEffect(() => {
    caretRotation.set(
      withTiming(expanded ? 180 : 0, { duration: reduceMotion ? 1 : 180, easing: Easing.out(Easing.quad) }),
    )
  }, [expanded, reduceMotion, caretRotation])
  const caretStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${caretRotation.get()}deg` }] }))

  const onGenerate = useCallback(async () => {
    setGenError(false)
    const r = await generate()
    if (!r && !needsMoreData) setGenError(true)
  }, [generate, needsMoreData])

  if (!userId) return null

  const hasMore = !!insight && (insight.payload.patterns.length > 0 || !!insight.payload.suggestion)
  const canToggle = !isLoading && !!insight && hasMore

  return (
    <View className="rounded-xl border border-border bg-card overflow-hidden">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          onPress={canToggle ? () => setExpanded((v) => !v) : undefined}
          className={cn('flex-1 flex-row items-center', canToggle && 'active:opacity-70')}
          hitSlop={8}
        >
          <Text className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t('sleep.insight.kicker', 'TU SUEÑO')}
          </Text>
        </Pressable>
        {canToggle && (
          <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
            <Animated.View style={caretStyle}>
              <Text className="font-mono text-[11px] text-muted-foreground">▼</Text>
            </Animated.View>
          </Pressable>
        )}
      </View>

      <View className="gap-3 px-4 pb-4">
        {isLoading ? (
          <View className="gap-2">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                className="h-3 rounded bg-muted"
                style={{ width: `${70 - i * 15}%`, opacity: 1 - i * 0.2 }}
              />
            ))}
          </View>
        ) : insight ? (
          <View className="gap-3">
            <View className="gap-1">
              <View className="flex-row items-center gap-2">
                <Text className="font-bebas text-2xl leading-none text-foreground">{insight.payload.headline}</Text>
                <TrendBadge trend={insight.payload.trend} />
              </View>
              {!!insight.generatedAt && (
                <Text className="font-mono text-[9px] text-muted-foreground">{relativeTime(insight.generatedAt)}</Text>
              )}
              {notSaved && (
                <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {t('insights.card.notSaved', 'No se guardó — se regenerará la próxima vez')}
                </Text>
              )}
            </View>

            {/* Stats: duración/calidad/consistencia */}
            <View className="flex-row gap-2 border-t border-border pt-3">
              <View className="flex-1 items-center">
                <Text className="font-bebas text-lg leading-none text-foreground">
                  {formatDuration(insight.payload.avgDurationMin)}
                </Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground text-center">
                  {t('sleep.insight.avgDuration', 'Duración media')}
                </Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="font-bebas text-lg leading-none text-foreground">
                  {insight.payload.avgQuality.toFixed(1)} / 5
                </Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground text-center">
                  {t('sleep.insight.avgQuality', 'Calidad media')}
                </Text>
              </View>
              <View className="flex-1 items-center">
                <Text className={cn('font-bebas text-lg leading-none', CONSISTENCY_META[insight.payload.bedtimeConsistency].className)}>
                  {t(
                    CONSISTENCY_META[insight.payload.bedtimeConsistency].key,
                    CONSISTENCY_META[insight.payload.bedtimeConsistency].fallback,
                  )}
                </Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground text-center">
                  {t('sleep.insight.bedtimeConsistencyLabel', 'Consistencia horario')}
                </Text>
              </View>
            </View>
          </View>
        ) : needsMoreData ? (
          <View className="gap-3">
            <Text className="font-sans text-sm text-muted-foreground">
              {t('sleep.insight.needsMoreData', 'Sigue registrando — necesitas al menos {{n}} noches con datos.', {
                n: MIN_SLEEP_INSIGHT_DAYS,
              })}
            </Text>
            <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
          </View>
        ) : genError ? (
          <View className="gap-3">
            <Text className="font-sans text-sm text-destructive">
              {t('sleep.insight.failed', 'No se pudo generar. Reintenta.')}
            </Text>
            <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
          </View>
        ) : (
          <View className="gap-3">
            <Text className="font-bebas text-2xl leading-none text-foreground">
              {t('sleep.insight.empty', 'Descubre tus patrones de sueño')}
            </Text>
            <Text className="font-sans text-sm text-muted-foreground">
              {t('sleep.insight.emptyBody', 'Duración, calidad, consistencia y más de tu semana.')}
            </Text>
            <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
          </View>
        )}

        {/* Colapsado: disclaimer + "ver más" */}
        {insight && !expanded && hasMore && (
          <View className="gap-2 border-t border-border pt-3">
            <Disclaimer />
            <Pressable onPress={() => setExpanded(true)} className="items-center py-1 active:opacity-70">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('sleep.insight.seeMore', 'Ver más')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Expandido: patrones + sugerencia */}
      {expanded && insight && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          className="gap-3 border-t border-border px-4 pb-4 pt-3"
        >
          {insight.payload.patterns.length > 0 && (
            <View className="gap-1">
              <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {t('sleep.insight.patterns', 'PATRONES')}
              </Text>
              {insight.payload.patterns.map((p, i) => (
                <Text key={i} className="font-sans text-sm text-foreground">• {p}</Text>
              ))}
            </View>
          )}

          {hasMore && <Disclaimer />}

          {!!insight.payload.suggestion && (
            <View className="gap-1 border-t border-border pt-3">
              <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {t('sleep.insight.suggestion', 'SUGERENCIA')}
              </Text>
              <Text className="font-sans-medium text-sm text-foreground">{insight.payload.suggestion}</Text>
            </View>
          )}

          <View className="flex-row items-center justify-between border-t border-border pt-3">
            <Pressable onPress={() => setExpanded(false)} className="py-1 active:opacity-70">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('sleep.insight.seeLess', 'Ver menos')}
              </Text>
            </Pressable>
            <Pressable onPress={onGenerate} disabled={isGenerating} className="py-1 active:opacity-70">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {isGenerating ? t('sleep.insight.generating', 'Generando…') : t('sleep.insight.refresh', 'Actualizar')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  )
}

export default React.memo(SleepInsightsCard)
