import { useEffect, useMemo } from 'react'
import { QualityScoreBadge } from './QualityScoreBadge'
import { BADGE_DEFINITIONS } from '../../lib/badge-definitions'
import { MEAL_TYPE_COLORS } from '../../lib/style-tokens'
import { cn } from '../../lib/utils'
import type { NutritionEntry, NutritionCoachInsight, NutritionBadge, QualityScore } from '../../types'

const SCORE_BAR_COLORS: Record<QualityScore, string> = {
  A: 'bg-green-500',
  B: 'bg-lime-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  E: 'bg-red-500',
}

const SCORE_HEIGHT: Record<QualityScore, string> = {
  A: 'h-10',
  B: 'h-8',
  C: 'h-6',
  D: 'h-4',
  E: 'h-2',
}

interface CoachPanelProps {
  entries: NutritionEntry[]
  dailyInsight: NutritionCoachInsight | null
  weeklyInsight: NutritionCoachInsight | null
  badges: NutritionBadge[]
  generatingWeekly: boolean
  activeTab: 'daily' | 'weekly'
  weeklyDayScores?: { date: string; dayLabel: string; score?: QualityScore }[]
}

export function CoachPanel({
  entries,
  dailyInsight,
  weeklyInsight,
  badges,
  generatingWeekly,
  activeTab,
  weeklyDayScores,
}: CoachPanelProps) {
  // Coach messages from scored entries
  const coachMessages = useMemo(() => {
    return entries
      .filter(e => e.qualityMessage)
      .map(e => ({
        id: e.id,
        mealType: e.mealType,
        score: e.qualityScore!,
        message: e.qualityMessage!,
        time: e.loggedAt,
      }))
  }, [entries])

  if (activeTab === 'weekly') {
    return <WeeklyCoachView insight={weeklyInsight} generating={generatingWeekly} dayScores={weeklyDayScores} />
  }

  return (
    <div className="space-y-4">
      {/* Daily score */}
      {dailyInsight?.overallScore && (
        <div className="flex items-center gap-3">
          <QualityScoreBadge score={dailyInsight.overallScore} size="lg" />
          <div>
            <div className="text-sm font-medium">Score del dia</div>
            {dailyInsight.streaks && dailyInsight.streaks.currentGood > 1 && (
              <div className="text-xs text-green-400">
                Racha: {dailyInsight.streaks.currentGood} dias seguidos
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coach message feed */}
      {coachMessages.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">
            Feedback
          </div>
          {coachMessages.map(msg => {
            const mealInfo = MEAL_TYPE_COLORS[msg.mealType] || MEAL_TYPE_COLORS.snack
            return (
              <div key={msg.id} className="flex gap-3">
                <div className={cn('w-1 shrink-0 rounded-full', mealInfo.color.replace('text-', 'bg-'))} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <QualityScoreBadge score={msg.score} size="sm" />
                    <span className={cn('text-[9px] tracking-widest', mealInfo.color)}>
                      {msg.mealType.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{msg.message}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent badges */}
      {badges.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">
            Logros recientes
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.slice(0, 4).map((badge, i) => {
              const def = BADGE_DEFINITIONS[badge.badgeType]
              return (
                <span
                  key={i}
                  className="text-[9px] tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-1 rounded flex items-center gap-1"
                >
                  <span>{def.icon}</span>
                  <span>{def.label}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function WeeklyCoachView({
  insight,
  generating,
  dayScores,
}: {
  insight: NutritionCoachInsight | null
  generating: boolean
  dayScores?: { date: string; dayLabel: string; score?: QualityScore }[]
}) {
  if (generating) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-10 bg-muted rounded-lg" />
        <div className="h-20 bg-muted rounded-lg" />
        <div className="h-16 bg-muted rounded-lg" />
      </div>
    )
  }

  if (!insight) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        No hay suficientes datos para el resumen semanal
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Weekly score */}
      {insight.overallScore && (
        <div className="flex items-center gap-3">
          <QualityScoreBadge score={insight.overallScore} size="lg" />
          <div className="text-sm font-medium">Score de la semana</div>
        </div>
      )}

      {/* Day score chart */}
      {dayScores && dayScores.length > 0 && (
        <div className="flex items-end gap-1.5 h-14">
          {dayScores.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={cn(
                'w-full rounded-t',
                day.score ? SCORE_BAR_COLORS[day.score] : 'bg-muted',
                day.score ? SCORE_HEIGHT[day.score] : 'h-1',
              )} />
              <span className="text-[8px] text-muted-foreground">{day.dayLabel}</span>
            </div>
          ))}
        </div>
      )}

      {/* Coach message */}
      {insight.coachMessage && (
        <p className="text-xs text-muted-foreground leading-relaxed bg-card border border-border rounded-lg p-3">
          {insight.coachMessage}
        </p>
      )}

      {/* Highlights & Concerns */}
      {insight.insights && (
        <div className="space-y-2">
          {insight.insights.highlights.map((h, i) => (
            <div key={`h-${i}`} className="flex gap-2 text-xs">
              <span className="text-green-400 shrink-0">+</span>
              <span className="text-muted-foreground">{h}</span>
            </div>
          ))}
          {insight.insights.concerns.map((c, i) => (
            <div key={`c-${i}`} className="flex gap-2 text-xs">
              <span className="text-red-400 shrink-0">-</span>
              <span className="text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
