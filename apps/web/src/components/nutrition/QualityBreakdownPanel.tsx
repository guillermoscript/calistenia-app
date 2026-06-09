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
    <div className="space-y-4 px-1 pb-3">
      {/* Score + Summary */}
      <div className="flex items-start gap-2.5">
        <QualityScoreBadge score={qualityScore} size="md" />
        <p className="text-sm text-foreground/80 leading-snug">{qualityBreakdown.summary}</p>
      </div>

      {/* Positives & Negatives — listed, not chips */}
      <div className="space-y-1.5">
        {qualityBreakdown.positives.map((p, i) => (
          <div key={`p-${i}`} className="flex gap-2 text-xs">
            <span className="text-green-400 shrink-0">+</span>
            <span className="text-foreground/70">{p}</span>
          </div>
        ))}
        {qualityBreakdown.negatives.map((n, i) => (
          <div key={`n-${i}`} className="flex gap-2 text-xs">
            <span className="text-red-400 shrink-0">-</span>
            <span className="text-foreground/70">{n}</span>
          </div>
        ))}
      </div>

      {/* Coach Message */}
      {qualityMessage && (
        <p className="text-xs text-foreground/60 leading-relaxed">{qualityMessage}</p>
      )}

      {/* Suggestion (only if score < B) */}
      {qualitySuggestion && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">{qualitySuggestion.text}</p>
          {qualitySuggestion.alternatives.length > 0 && (
            <div className="space-y-2">
              {qualitySuggestion.alternatives.map((alt, i) => (
                <div key={i} className="space-y-1 text-xs">
                  <span className={`${BADGE_COLORS.suggestion} inline-block px-1.5 py-0.5 rounded text-[10px]`}>
                    {alt.name}
                  </span>
                  <p className="text-foreground/50 leading-snug">{alt.portionNote}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
