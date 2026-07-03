/** Cross-metric weekly insight card — collapsible "Tu semana" on Home (épica #128 Fase 2). */
import React, { useCallback, useState } from 'react'
import { View, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useCrossInsights,
  MIN_INSIGHT_DAYS,
  type CrossInsightCorrelation,
} from '@calistenia/core/hooks/useCrossInsights'

const STRENGTH_DOTS: Record<CrossInsightCorrelation['strength'], string> = {
  weak: '●',
  moderate: '●●',
  strong: '●●●',
}

/** "hace 2h" / "ayer" / "hace 3d" — sin deps nuevas, granularidad de horas/días. */
function relativeTime(iso?: string): string {
  if (!iso) return ''
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60))
  if (hours < 1) return 'ahora'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'ayer' : `hace ${days}d`
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

interface InsightsCardProps {
  userId: string | null
}

function InsightsCard({ userId }: InsightsCardProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [genError, setGenError] = useState(false)
  const { insight, isLoading, isGenerating, generate, needsMoreData } = useCrossInsights(userId, 'weekly')

  const onGenerate = useCallback(async () => {
    setGenError(false)
    const r = await generate()
    if (!r && !needsMoreData) setGenError(true)
  }, [generate, needsMoreData])

  if (!userId) return null

  const canToggle = !isLoading && !!insight

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
        {canToggle && (
          <Text className="font-mono text-[11px] text-muted-foreground">{expanded ? '▲' : '▼'}</Text>
        )}
      </Pressable>

      {/* Collapsed body — depends on state */}
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
            <Text className="font-bebas text-2xl leading-none text-foreground">{insight.payload.headline}</Text>
            {!!insight.generatedAt && (
              <Text className="font-mono text-[9px] text-muted-foreground">{relativeTime(insight.generatedAt)}</Text>
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
      </View>

      {/* Expanded body — solo cuando hay insight */}
      {expanded && insight && (
        <View className="gap-3 border-t border-border px-4 pb-4 pt-3">
          {insight.payload.correlations.map((c, i) => (
            <View key={i} className="gap-1.5">
              <Text className="font-sans text-sm text-foreground">{c.observation}</Text>
              <View className="flex-row flex-wrap items-center gap-1">
                {c.metrics.map((m, j) => (
                  <View key={j} className="rounded-full bg-muted px-2 py-0.5">
                    <Text className="font-mono text-[8px] uppercase text-muted-foreground">{m}</Text>
                  </View>
                ))}
                <Text className="font-mono text-[8px] text-muted-foreground">{STRENGTH_DOTS[c.strength]}</Text>
              </View>
            </View>
          ))}

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

          <Pressable onPress={onGenerate} disabled={isGenerating} className="items-center py-1 active:opacity-70">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {isGenerating ? t('insights.card.generating', 'Generando…') : t('insights.card.refresh', 'Actualizar')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

export default React.memo(InsightsCard)
