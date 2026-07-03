/** Cross-metric weekly insight card — collapsible "Tu semana" on Home (épica #128 Fase 2, issue #133). */
import React, { useCallback, useEffect, useState } from 'react'
import { View, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
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
import { op } from '@calistenia/core/lib/analytics'
import {
  useCrossInsights,
  MIN_INSIGHT_DAYS,
  type CrossInsightCorrelation,
  type CrossInsightAction,
  type CrossInsightActionType,
  type CrossInsightPayload,
} from '@calistenia/core/hooks/useCrossInsights'

const STRENGTH_DOTS: Record<CrossInsightCorrelation['strength'], string> = {
  weak: '●',
  moderate: '●●',
  strong: '●●●',
}

// El backend aún no declara `lag` en el tipo compartido — se lee de forma
// opcional y defensiva (issue #133, punto opcional 6).
export type Correlation = CrossInsightCorrelation & { lag?: string }

// Fuerte primero: rankeo para ordenar de la señal más clara a la más tenue.
const STRENGTH_RANK: Record<CrossInsightCorrelation['strength'], number> = {
  strong: 0,
  moderate: 1,
  weak: 2,
}

/** Copia ordenada por fuerza (desc), estable — nunca muta el payload original. */
export function sortByStrength(list: CrossInsightCorrelation[]): Correlation[] {
  return list
    .map((c, index) => ({ c, index }))
    .sort((a, b) => STRENGTH_RANK[a.c.strength] - STRENGTH_RANK[b.c.strength] || a.index - b.index)
    .map(({ c }) => c)
}

/** "hace 2h" / "ayer" / "hace 3d" — sin deps nuevas, granularidad de horas/días. */
export function relativeTime(iso?: string): string {
  if (!iso) return ''
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60))
  if (hours < 1) return 'ahora'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'ayer' : `hace ${days}d`
}

// #136 — badge de tendencia junto al headline. Sutil (spec-sheet, no ruidoso):
// solo flecha + palabra corta en Mono, sin fondo ni borde.
const TREND_META: Record<
  NonNullable<CrossInsightPayload['trend']>,
  { arrow: string; className: string; key: string; fallback: string }
> = {
  improving: { arrow: '↑', className: 'text-lime', key: 'insights.card.trend.improving', fallback: 'Mejorando' },
  steady: { arrow: '→', className: 'text-muted-foreground', key: 'insights.card.trend.steady', fallback: 'Estable' },
  declining: { arrow: '↓', className: 'text-amber-400', key: 'insights.card.trend.declining', fallback: 'Bajando' },
}

function TrendBadge({ trend }: { trend: NonNullable<CrossInsightPayload['trend']> }) {
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

// #135 — a dónde navega el CTA de la sugerencia según el tipo de acción sugerida.
// `none` (y cualquier tipo futuro no mapeado) no navega.
function actionRoute(type: CrossInsightActionType): '/reminders' | '/nutrition' | '/free-session' | null {
  switch (type) {
    case 'reminder_sleep':
    case 'reminder_water':
      return '/reminders'
    case 'log_nutrition':
      return '/nutrition'
    case 'start_free_session':
      return '/free-session'
    default:
      return null
  }
}

function GenerateButton({ isGenerating, onGenerate }: { isGenerating: boolean; onGenerate: () => void }) {
  const { t } = useTranslation()
  return (
    <Button variant="lime" size="sm" onPress={onGenerate} disabled={isGenerating} className="self-start">
      {isGenerating && <ActivityIndicator size="small" color="#a3e635" />}
      <Text>
        {isGenerating ? t('insights.card.generating', 'Generando…') : t('insights.card.generate', 'Generar resumen')}
      </Text>
    </Button>
  )
}

/** Disclaimer siempre visible (colapsado y expandido) — correlación ≠ causa. */
export function Disclaimer() {
  const { t } = useTranslation()
  return (
    <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
      {t('insights.card.disclaimer', 'Patrones observados, no causas ni consejo médico.')}
    </Text>
  )
}

/** Una fila de correlación. Las `weak` se atenúan — nunca se presentan como una certeza. */
export function CorrelationRow({ c }: { c: Correlation }) {
  const { t } = useTranslation()
  const isWeak = c.strength === 'weak'
  return (
    <View className="gap-1.5">
      <Text className={cn('font-sans text-sm', isWeak ? 'text-muted-foreground opacity-70' : 'text-foreground')}>
        {c.observation}
      </Text>
      <View className="flex-row flex-wrap items-center gap-1">
        {c.metrics.map((m, j) => (
          <View key={j} className="rounded-full bg-muted px-2 py-0.5">
            <Text className="font-mono text-[8px] uppercase text-muted-foreground">{m}</Text>
          </View>
        ))}
        <Text className="font-mono text-[8px] text-muted-foreground">{STRENGTH_DOTS[c.strength]}</Text>
        {c.lag === 'next_day' && (
          <View className="rounded-full bg-muted px-2 py-0.5">
            <Text className="font-mono text-[8px] uppercase text-muted-foreground">
              {t('insights.card.nextDay', 'día sig.')}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

interface InsightsCardProps {
  userId: string | null
}

function InsightsCard({ userId }: InsightsCardProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [genError, setGenError] = useState(false)
  const { insight, isLoading, isGenerating, generate, needsMoreData, notSaved } = useCrossInsights(userId, 'weekly')

  // Rotación del caret (▼ → ▲ visual al girar 180°) — honra "reducir movimiento"
  // con una transición casi instantánea en vez de saltarse el efecto por completo,
  // mismo idioma que el flash de FeedCard.
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

  // #135 — tap en el botón de acción de la sugerencia: trackea y navega.
  const onActionPress = useCallback(
    (action: CrossInsightAction) => {
      op.track('insight_action_tap', { type: action.type, platform: 'mobile' })
      const route = actionRoute(action.type)
      if (route) router.push(route)
    },
    [router],
  )

  if (!userId) return null

  const sortedCorrelations = insight ? sortByStrength(insight.payload.correlations) : []
  const strongest = sortedCorrelations[0]
  const primaryCorrelations = sortedCorrelations.filter((c) => c.strength !== 'weak')
  const weakCorrelations = sortedCorrelations.filter((c) => c.strength === 'weak')
  const hasMore =
    !!insight &&
    (sortedCorrelations.length > 0 ||
      insight.payload.wins.length > 0 ||
      insight.payload.watchouts.length > 0 ||
      !!insight.payload.suggestion)
  const canToggle = !isLoading && !!insight && hasMore

  return (
    <View className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <Pressable
        onPress={canToggle ? () => setExpanded((v) => !v) : undefined}
        className={cn('flex-row items-center justify-between px-4 py-3', canToggle && 'active:bg-muted/30')}
      >
        <Text className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t('insights.card.kicker', 'TU SEMANA')}
        </Text>
        <View className="flex-row items-center gap-3">
          {/* #132 — entrada al historial "Tus semanas", visible siempre que haya un insight */}
          {!!insight && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.()
                router.push('/insights')
              }}
              hitSlop={8}
            >
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground active:opacity-60">
                {t('insights.card.history', 'Ver historial')}
              </Text>
            </Pressable>
          )}
          {canToggle && (
            <Animated.View style={caretStyle}>
              <Text className="font-mono text-[11px] text-muted-foreground">▼</Text>
            </Animated.View>
          )}
        </View>
      </Pressable>

      {/* Cuerpo persistente — encabezado del insight + estados sin insight todavía */}
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
          <View className="gap-1">
            <View className="flex-row items-center gap-2">
              <Text className="font-bebas text-2xl leading-none text-foreground">{insight.payload.headline}</Text>
              {!!insight.payload.trend && <TrendBadge trend={insight.payload.trend} />}
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
        ) : needsMoreData ? (
          <View className="gap-3">
            <Text className="font-sans text-sm text-muted-foreground">
              {t('insights.card.needMore', 'Sigue registrando — necesitas al menos {{n}} días con datos.', {
                n: MIN_INSIGHT_DAYS,
              })}
            </Text>
            <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
          </View>
        ) : genError ? (
          <View className="gap-3">
            <Text className="font-sans text-sm text-destructive">
              {t('insights.card.error', 'No se pudo generar. Reintenta.')}
            </Text>
            <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
          </View>
        ) : (
          <View className="gap-3">
            <Text className="font-bebas text-2xl leading-none text-foreground">
              {t('insights.card.emptyTitle', 'Descubre tus patrones')}
            </Text>
            <Text className="font-sans text-sm text-muted-foreground">
              {t('insights.card.emptyBody', 'Cruza sueño, entrenos, nutrición y más de tu semana.')}
            </Text>
            <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
          </View>
        )}

        {/* Colapsado: solo la correlación más fuerte + disclaimer + "ver más" */}
        {insight && !expanded && hasMore && (
          <View className="gap-2 border-t border-border pt-3">
            {strongest && <CorrelationRow c={strongest} />}
            <Disclaimer />
            <Pressable onPress={() => setExpanded(true)} className="items-center py-1 active:opacity-70">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('insights.card.seeMore', 'Ver más')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Expandido: todas las correlaciones (atenuando las débiles) + logros + a vigilar + sugerencia */}
      {expanded && insight && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          className="gap-3 border-t border-border px-4 pb-4 pt-3"
        >
          {primaryCorrelations.length > 0 && (
            <View className="gap-3">
              {primaryCorrelations.map((c, i) => (
                <CorrelationRow key={i} c={c} />
              ))}
            </View>
          )}

          {weakCorrelations.length > 0 && (
            <View className="gap-2">
              <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {t('insights.card.maybe', 'POSIBLES PATRONES')}
              </Text>
              <View className="gap-3">
                {weakCorrelations.map((c, i) => (
                  <CorrelationRow key={i} c={c} />
                ))}
              </View>
            </View>
          )}

          {hasMore && <Disclaimer />}

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
            <View className="gap-2 border-t border-border pt-3">
              <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {t('insights.card.tip', 'SUGERENCIA')}
              </Text>
              <Text className="font-sans-medium text-sm text-foreground">{insight.payload.suggestion}</Text>
              {/* #135 — CTA accionable cuando el backend sugiere una acción concreta */}
              {!!insight.payload.suggestedAction && insight.payload.suggestedAction.type !== 'none' && (
                <Button
                  variant="lime"
                  size="sm"
                  onPress={() => onActionPress(insight.payload.suggestedAction!)}
                  className="self-start"
                >
                  <Text>{insight.payload.suggestedAction.label}</Text>
                </Button>
              )}
            </View>
          )}

          <View className="flex-row items-center justify-between border-t border-border pt-3">
            <Pressable onPress={() => setExpanded(false)} className="py-1 active:opacity-70">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('insights.card.seeLess', 'Ver menos')}
              </Text>
            </Pressable>
            <Pressable onPress={onGenerate} disabled={isGenerating} className="py-1 active:opacity-70">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {isGenerating ? t('insights.card.generating', 'Generando…') : t('insights.card.refresh', 'Actualizar')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  )
}

export default React.memo(InsightsCard)
