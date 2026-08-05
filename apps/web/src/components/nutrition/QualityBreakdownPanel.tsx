import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NutritionEntry } from '@calistenia/core/types'
import { QualityScoreBadge } from './QualityScoreBadge'
import { BADGE_COLORS } from '@calistenia/core/lib/style-tokens'
import { cn } from '@/lib/utils'

interface QualityBreakdownPanelProps {
  entry: NutritionEntry
}

export function QualityBreakdownPanel({ entry }: QualityBreakdownPanelProps) {
  const { qualityScore, qualityBreakdown, qualityMessage, qualitySuggestion } = entry
  const { t } = useTranslation()
  // Colapsada por defecto (#337): la sugerencia solo se despliega tras el
  // disclosure; estado local ⇒ vuelve a nacer plegada al reabrir la comida.
  const [showSuggestion, setShowSuggestion] = useState(false)

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

      {/* Suggestion (only if score < B) — plegada tras un disclosure (#337),
          idioma del Coach colapsable de NutritionPage */}
      {qualitySuggestion && (
        <div className="bg-muted/50 rounded-lg px-3 py-1.5">
          <button
            type="button"
            onClick={() => setShowSuggestion(v => !v)}
            aria-expanded={showSuggestion}
            className="w-full flex items-center justify-between py-1.5 text-[10px] tracking-[0.3em] text-lime-400/90 uppercase hover:text-lime-300 transition-colors"
          >
            <span>{t('nutrition.logger.suggestionToggle', 'Sugerencia de platos')}</span>
            <svg
              className={cn('size-4 text-foreground/45 transition-transform duration-200', showSuggestion && 'rotate-180')}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
          {showSuggestion && (
            <div className="space-y-2 pb-2 pt-0.5">
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
      )}
    </div>
  )
}
