/**
 * QualityBreakdownPanel (mobile) — port of
 * apps/web/src/components/nutrition/QualityBreakdownPanel.tsx.
 *
 * The full AI meal-quality feedback surface: score + one-line summary,
 * positives/negatives, the coach message, and an actionable suggestion with
 * alternatives. Takes the quality fields directly (not a NutritionEntry) so the
 * same component renders for a saved meal (dashboard) AND the in-flight analyze
 * result (logger review step).
 *
 * Spec-sheet idiom: hairlines + mono kickers, no nested shadowed cards.
 */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { QualityScore, QualityBreakdown, QualitySuggestion } from '@calistenia/core/types'

const SCORE_BG: Record<QualityScore, string> = {
  A: 'bg-green-500',
  B: 'bg-lime-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  E: 'bg-red-500',
}

const SCORE_TEXT: Record<QualityScore, string> = {
  A: 'text-white',
  B: 'text-white',
  C: 'text-black',
  D: 'text-white',
  E: 'text-white',
}

// Spanish-first verdict words (parity with web QualityScoreBadge SCORE_LABELS);
// the nutrition.criteria{A-E}.label i18n keys exist and localize these.
const SCORE_LABEL: Record<QualityScore, string> = {
  A: 'Excelente',
  B: 'Bueno',
  C: 'Aceptable',
  D: 'Pobre',
  E: 'Malo',
}

export function QualityScoreBadge({
  score,
  size = 'md',
}: {
  score: QualityScore
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = size === 'lg' ? 'h-10 w-10' : size === 'md' ? 'h-7 w-7' : 'h-5 w-5'
  const txt = size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-[10px]'
  return (
    <View
      className={cn('items-center justify-center rounded-full', dims, SCORE_BG[score])}
      accessibilityLabel={`Calidad ${score} — ${SCORE_LABEL[score]}`}
    >
      <Text className={cn('font-bebas leading-none', txt, SCORE_TEXT[score])}>{score}</Text>
    </View>
  )
}

interface QualityBreakdownPanelProps {
  score: QualityScore
  breakdown?: QualityBreakdown
  message?: string | null
  suggestion?: QualitySuggestion | null
  /**
   * Compact = score + summary + suggestion only (drops the positives/negatives
   * lists and coach message). Used in the logger review step, where the full
   * breakdown is too heavy mid-logging; the dashboard meal card shows the full
   * panel.
   */
  compact?: boolean
}

export default function QualityBreakdownPanel({
  score,
  breakdown,
  message,
  suggestion,
  compact = false,
}: QualityBreakdownPanelProps) {
  const { t } = useTranslation()

  if (!breakdown) return null

  const positives = breakdown.positives ?? []
  const negatives = breakdown.negatives ?? []
  const alternatives = suggestion?.alternatives ?? []

  return (
    <View className="gap-4">
      {/* Score + summary */}
      <View className="flex-row items-start gap-2.5">
        <QualityScoreBadge score={score} size="md" />
        <View className="flex-1 gap-1">
          <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
            {t(`nutrition.criteria${score}.label`, SCORE_LABEL[score])}
          </Text>
          {!!breakdown.summary && (
            <Text className="font-sans text-sm leading-snug text-foreground/80">
              {breakdown.summary}
            </Text>
          )}
        </View>
      </View>

      {/* Positives & negatives — string lists, not bars (full panel only) */}
      {!compact && (positives.length > 0 || negatives.length > 0) && (
        <View className="gap-1.5">
          {positives.map((p, i) => (
            <View key={`p-${i}`} className="flex-row gap-2">
              <Text className="font-sans-medium text-xs text-green-400">+</Text>
              <Text className="flex-1 font-sans text-xs leading-relaxed text-foreground/70">{p}</Text>
            </View>
          ))}
          {negatives.map((n, i) => (
            <View key={`n-${i}`} className="flex-row gap-2">
              <Text className="font-sans-medium text-xs text-red-400">−</Text>
              <Text className="flex-1 font-sans text-xs leading-relaxed text-foreground/70">{n}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Coach message (full panel only) */}
      {!compact && !!message && (
        <Text className="font-sans text-xs leading-relaxed text-muted-foreground">{message}</Text>
      )}

      {/* Suggestion (only emitted by the AI when score < B). Flattened: a lime
          hairline strip instead of a nested bordered box, so it doesn't read as
          a card-in-card against the host meal-card / review surface. */}
      {suggestion && (
        <View className="flex-row gap-2.5">
          <View className="w-0.5 shrink-0 rounded-full bg-lime/40" />
          <View className="flex-1 gap-2">
            <Text className="font-mono text-[9px] uppercase tracking-[2px] text-lime">
              {t('nutrition.logger.suggestion', { defaultValue: 'Sugerencia' })}
            </Text>
            <Text className="font-sans-medium text-xs leading-snug text-foreground">
              {suggestion.text}
            </Text>
            {alternatives.length > 0 && (
              <View className="gap-2 pt-0.5">
                {alternatives.map((alt, i) => (
                  <View key={i} className="gap-1">
                    <View className="self-start rounded border border-blue-500/20 bg-blue-500/15 px-1.5 py-0.5">
                      <Text className="font-mono text-[10px] text-blue-400">{alt.name}</Text>
                    </View>
                    {!!alt.portionNote && (
                      <Text className="font-sans text-[11px] leading-snug text-foreground/50">
                        {alt.portionNote}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
