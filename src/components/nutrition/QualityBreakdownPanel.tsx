import type { NutritionEntry } from '../../types'
import { QualityScoreBadge } from './QualityScoreBadge'

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
            className="text-[9px] tracking-wider bg-green-500/15 text-green-400 border border-green-500/20 px-1.5 py-px rounded"
          >
            {p}
          </span>
        ))}
        {qualityBreakdown.negatives.map((n, i) => (
          <span
            key={`n-${i}`}
            className="text-[9px] tracking-wider bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 py-px rounded"
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
                  className="text-[9px] tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/20 px-1.5 py-px rounded"
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
