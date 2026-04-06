import type { NutritionEntry } from '../../types'
import { QualityScoreBadge } from './QualityScoreBadge'
import { BADGE_COLORS } from '../../lib/style-tokens'

interface QualityBreakdownPanelProps {
  entry: NutritionEntry
}

export function QualityBreakdownPanel({ entry }: QualityBreakdownPanelProps) {
  const { qualityScore, qualityBreakdown, qualityMessage, qualitySuggestion } = entry

  if (!qualityScore || !qualityBreakdown) return null

  return (
    <div className="space-y-3 px-1 pb-3">
      {/* Score + Summary */}
      <div className="flex items-center gap-2">
        <QualityScoreBadge score={qualityScore} size="md" />
        <span className="text-xs text-muted-foreground">{qualityBreakdown.summary}</span>
      </div>

      {/* Positives & Negatives */}
      <div className="flex flex-wrap gap-1.5">
        {qualityBreakdown.positives.map((p, i) => (
          <span
            key={`p-${i}`}
            className={`text-[9px] tracking-wider px-1.5 py-px rounded ${BADGE_COLORS.positive}`}
          >
            {p}
          </span>
        ))}
        {qualityBreakdown.negatives.map((n, i) => (
          <span
            key={`n-${i}`}
            className={`text-[9px] tracking-wider px-1.5 py-px rounded ${BADGE_COLORS.negative}`}
          >
            {n}
          </span>
        ))}
      </div>

      {/* Coach Message */}
      {qualityMessage && (
        <p className="text-xs text-muted-foreground leading-relaxed">{qualityMessage}</p>
      )}

      {/* Suggestion (only if score < B) */}
      {qualitySuggestion && (
        <div className="bg-muted/50 rounded-lg p-2.5 space-y-1.5">
          <p className="text-xs font-medium text-foreground">{qualitySuggestion.text}</p>
          {qualitySuggestion.alternatives.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {qualitySuggestion.alternatives.map((alt, i) => (
                <span
                  key={i}
                  className={`text-[9px] tracking-wider px-1.5 py-px rounded ${BADGE_COLORS.suggestion}`}
                >
                  {alt.name} — {alt.portionNote}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
