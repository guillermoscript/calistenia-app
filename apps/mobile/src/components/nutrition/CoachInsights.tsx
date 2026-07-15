/** Cuerpo del coach nutricional (feedback por comida, badges, análisis semanal).
 *  El colapsable que lo contiene vive en la pantalla de nutrición; aquí solo
 *  el contenido + el toggle interno Día/Semana. */
import { useState, useMemo } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { BADGE_DEFINITIONS } from '@calistenia/core/lib/badge-definitions'
import { MEAL_TYPE_COLORS, SCORE_COLORS } from '@calistenia/core/lib/style-tokens'
import type {
  NutritionEntry,
  NutritionCoachInsight,
  NutritionBadge,
  QualityScore,
} from '@calistenia/core/types'

interface CoachInsightsProps {
  entries: NutritionEntry[]
  dailyInsight: NutritionCoachInsight | null
  weeklyInsight: NutritionCoachInsight | null
  badges: NutritionBadge[]
  generatingWeekly: boolean
  onGenerateWeekly?: () => void
}

// Inline score badge (no web QualityScoreBadge dep)
function ScoreBadge({ score, size = 'sm' }: { score: QualityScore; size?: 'sm' | 'lg' }) {
  const bgClass = SCORE_COLORS[score] ?? 'bg-muted text-foreground'
  return (
    <View
      className={cn(
        'rounded items-center justify-center',
        size === 'lg' ? 'w-10 h-10' : 'w-6 h-6',
        bgClass,
      )}
    >
      <Text
        className={cn(
          'font-bebas leading-none',
          size === 'lg' ? 'text-2xl' : 'text-sm',
        )}
      >
        {score}
      </Text>
    </View>
  )
}

// ── Weekly view ───────────────────────────────────────────────────────────────

function WeeklyView({
  insight,
  generating,
  onGenerate,
}: {
  insight: NutritionCoachInsight | null
  generating: boolean
  onGenerate?: () => void
}) {
  const { t } = useTranslation()

  if (generating) {
    return (
      <View className="gap-3">
        {[0, 1, 2].map((i) => (
          <View key={i} className="h-10 rounded-xl bg-muted/60" style={{ opacity: 1 - i * 0.2 }} />
        ))}
      </View>
    )
  }

  if (!insight) {
    return (
      <View className="items-center gap-3 py-4">
        <Text className="font-sans text-sm text-muted-foreground text-center">
          {t('nutrition.coach.noWeeklyData', 'No hay suficientes datos para el resumen semanal')}
        </Text>
        {onGenerate && (
          <Pressable
            onPress={onGenerate}
            className="rounded-lg border border-lime-400/30 px-4 py-2 active:bg-lime-400/10"
          >
            <Text className="font-bebas tracking-widest text-lime-400">
              {t('nutrition.coach.generateWeekly', 'Generar análisis semanal')}
            </Text>
          </Pressable>
        )}
      </View>
    )
  }

  return (
    <View className="gap-4">
      {/* Weekly overall score */}
      {insight.overallScore && (
        <View className="flex-row items-center gap-3">
          <ScoreBadge score={insight.overallScore} size="lg" />
          <Text className="font-sans-medium text-sm text-foreground">
            {t('nutrition.coach.weekScore', 'Score de la semana')}
          </Text>
        </View>
      )}

      {/* Coach message */}
      {!!insight.coachMessage && (
        <View className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
            {insight.coachMessage}
          </Text>
        </View>
      )}

      {/* Highlights & Concerns */}
      {insight.insights && (
        <View className="gap-1.5">
          {insight.insights.highlights.map((h, i) => (
            <View key={`h-${i}`} className="flex-row gap-2">
              <Text className="text-emerald-400 font-sans-medium text-xs">+</Text>
              <Text className="flex-1 font-sans text-xs text-muted-foreground leading-relaxed">{h}</Text>
            </View>
          ))}
          {insight.insights.concerns.map((c, i) => (
            <View key={`c-${i}`} className="flex-row gap-2">
              <Text className="text-red-400 font-sans-medium text-xs">−</Text>
              <Text className="flex-1 font-sans text-xs text-muted-foreground leading-relaxed">{c}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Regenerate weekly */}
      {onGenerate && (
        <Pressable
          onPress={onGenerate}
          className="items-center rounded-xl border border-border py-2.5 active:bg-muted/40"
        >
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t('nutrition.coach.regenerateWeekly', 'Regenerar análisis')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

// ── Daily view ────────────────────────────────────────────────────────────────

function DailyView({
  entries,
  dailyInsight,
  badges,
}: {
  entries: NutritionEntry[]
  dailyInsight: NutritionCoachInsight | null
  badges: NutritionBadge[]
}) {
  const { t } = useTranslation()

  const coachMessages = useMemo(() => {
    return entries
      .filter((e) => !!e.qualityMessage)
      .map((e) => ({
        id: e.id,
        mealType: e.mealType,
        score: e.qualityScore!,
        message: e.qualityMessage!,
      }))
  }, [entries])

  return (
    <View className="gap-4">
      {/* Daily overall score */}
      {dailyInsight?.overallScore && (
        <View className="flex-row items-center gap-3">
          <ScoreBadge score={dailyInsight.overallScore} size="lg" />
          <View className="gap-0.5">
            <Text className="font-sans-medium text-sm text-foreground">
              {t('nutrition.coach.dayScore', 'Score del día')}
            </Text>
            {dailyInsight.streaks && dailyInsight.streaks.currentGood > 1 && (
              <Text className="font-mono text-[10px] text-emerald-400">
                🔥 {t('nutrition.coach.streak', 'Racha')} {dailyInsight.streaks.currentGood}{' '}
                {t('nutrition.coach.days', 'días')}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Per-meal feedback */}
      {coachMessages.length > 0 && (
        <View className="gap-2">
          <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
            {t('nutrition.coach.feedback', 'Feedback')}
          </Text>
          {coachMessages.map((msg, i) => {
            const mealColors = MEAL_TYPE_COLORS[msg.mealType] || MEAL_TYPE_COLORS.snack
            // Convert tailwind text- class to a hex color string for the accent strip
            const accentColors: Record<string, string> = {
              'text-amber-400': '#fbbf24',
              'text-sky-500':   '#0ea5e9',
              'text-pink-500':  '#ec4899',
              'text-lime-400':  '#a3e635',
              'text-lime':      '#a3e635',
            }
            const accentHex = accentColors[mealColors.color] ?? '#71717a'

            return (
              <View key={i} className="flex-row gap-3">
                {/* Accent strip */}
                <View
                  className="w-1 rounded-full shrink-0"
                  style={{ backgroundColor: accentHex, minHeight: 40 }}
                />
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-2">
                    {msg.score && <ScoreBadge score={msg.score} size="sm" />}
                    <Text className={cn('font-mono text-[9px] uppercase tracking-widest', mealColors.color)}>
                      {msg.mealType}
                    </Text>
                  </View>
                  <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                    {msg.message}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <View className="gap-2">
          <Text className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
            {t('nutrition.coach.badges', 'Logros recientes')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {badges.slice(0, 6).map((badge, i) => {
              const def = BADGE_DEFINITIONS[badge.badgeType]
              if (!def) return null
              return (
                <View
                  key={i}
                  className="flex-row items-center gap-1 rounded border border-amber-500/20 bg-amber-500/15 px-2 py-1"
                >
                  <Text className="text-[12px]">{def.icon}</Text>
                  <Text className="font-mono text-[9px] uppercase tracking-wider text-amber-400">
                    {def.label}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* Empty state */}
      {!dailyInsight && coachMessages.length === 0 && badges.length === 0 && (
        <Text className="font-sans text-sm text-muted-foreground text-center py-2">
          {t('nutrition.coach.noData', 'Registra comidas para recibir feedback del coach.')}
        </Text>
      )}
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CoachInsights({
  entries,
  dailyInsight,
  weeklyInsight,
  badges,
  generatingWeekly,
  onGenerateWeekly,
}: CoachInsightsProps) {
  const { t } = useTranslation()
  const [view, setView] = useState<'daily' | 'weekly'>('daily')

  return (
    <View className="gap-4">
      {/* Toggle Día / Semana */}
      <View className="flex-row gap-2">
        <Chip
          label={t('nutrition.coach.tabDay', 'Día')}
          active={view === 'daily'}
          onPress={() => setView('daily')}
        />
        <Chip
          label={t('nutrition.coach.tabWeek', 'Semana')}
          active={view === 'weekly'}
          onPress={() => setView('weekly')}
        />
      </View>

      {view === 'weekly' ? (
        <WeeklyView
          insight={weeklyInsight}
          generating={generatingWeekly}
          onGenerate={onGenerateWeekly}
        />
      ) : (
        <DailyView
          entries={entries}
          dailyInsight={dailyInsight}
          badges={badges}
        />
      )}
    </View>
  )
}
