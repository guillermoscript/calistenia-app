import { useCallback, useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { shareImage, canvasToBlob } from '../../lib/share'
import { renderShareCard, formatDate, type ShareCardVariant } from '../../lib/nutrition-share-card'
import { trackShareCardShared } from '@calistenia/core/lib/analytics'
import { buildShareMeals } from '@calistenia/core/lib/share-meals'
import type { DailyTotals, NutritionGoal, NutritionEntry, QualityScore } from '@calistenia/core/types'

interface DailySummaryCardProps {
  date: string
  totals: DailyTotals
  goals: NutritionGoal | null
  waterMl: number
  waterGoal: number
  entries?: NutritionEntry[]
  dailyQualityScore?: QualityScore
}

export default function DailySummaryCard({
  date,
  totals,
  goals,
  waterMl,
  waterGoal,
  entries = [],
  dailyQualityScore,
}: DailySummaryCardProps) {
  const { t } = useTranslation()
  const [variant, setVariant] = useState<ShareCardVariant>('summary')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Memoize the share-meals result so we don't recompute on every render
  const { meals, overflow } = useMemo(() => buildShareMeals(entries, 4), [entries])

  const cardOpts = useMemo(
    () => ({ variant, date, totals, goals, waterMl, waterGoal, meals, overflow, dailyQualityScore, t }),
    [variant, date, totals, goals, waterMl, waterGoal, meals, overflow, dailyQualityScore, t],
  )

  // ── Live preview: redraw whenever variant or data changes ──
  useEffect(() => {
    let cancelled = false

    renderShareCard(cardOpts)
      .then(canvas => {
        if (!cancelled) setPreviewUrl(canvas.toDataURL('image/png'))
      })
      .catch(console.warn)

    return () => { cancelled = true }
  }, [cardOpts])

  // ── Share handler ──────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      const canvas = await renderShareCard(cardOpts)
      const blob = await canvasToBlob(canvas)
      if (!blob) return
      const outcome = await shareImage(blob, `nutricion_${date}.png`, `Mi nutricion ${formatDate(date)}`)
      trackShareCardShared({
        surface: 'nutrition', source: 'daily_summary', share_type: 'nutrition',
        platform: 'web', result: outcome, share_confirmed: outcome === 'shared',
        card_type: variant === 'rich' ? 'nutrition_rich' : 'nutrition',
      })
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [cardOpts, date, variant])

  const calPct  = goals ? Math.round((totals.calories / goals.dailyCalories) * 100) : 0
  const waterPct = Math.round((waterMl / waterGoal) * 100)

  return (
    <div>
      {/* Summary mini-widget (unchanged DOM widget) */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-[9px] text-muted-foreground tracking-widest uppercase">{t('nutrition.summary.title')}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{date}</div>
          </div>
          <div className="text-right">
            <div className={cn('font-bebas text-2xl leading-none', calPct >= 90 ? 'text-emerald-500' : 'text-foreground')}>
              {Math.round(totals.calories)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {goals ? `/ ${goals.dailyCalories} kcal` : 'kcal'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-[13px] font-mono text-sky-400">{Math.round(totals.protein)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.protein')}</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-amber-400">{Math.round(totals.carbs)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.carbs')}</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-pink-400">{Math.round(totals.fat)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.fat')}</div>
          </div>
          <div>
            <div className={cn('text-[13px] font-mono', waterPct >= 100 ? 'text-sky-400' : 'text-sky-600')}>{waterMl}ml</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.summary.water')}</div>
          </div>
        </div>
      </div>

      {/* Variant toggle */}
      <div className="flex gap-1 mt-3 bg-card border border-border rounded-lg p-1">
        <button
          onClick={() => setVariant('summary')}
          className={cn(
            'flex-1 py-1.5 rounded-md text-[10px] font-mono tracking-widest transition-colors uppercase',
            variant === 'summary'
              ? 'bg-lime-400/15 text-lime-400 border border-lime-400/30'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('nutrition.summary.variantSummary')}
        </button>
        <button
          onClick={() => setVariant('rich')}
          className={cn(
            'flex-1 py-1.5 rounded-md text-[10px] font-mono tracking-widest transition-colors uppercase',
            variant === 'rich'
              ? 'bg-lime-400/15 text-lime-400 border border-lime-400/30'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('nutrition.summary.variantMeals')}
        </button>
      </div>

      {/* Live canvas preview */}
      {previewUrl && (
        <div className="mt-3 rounded-xl overflow-hidden border border-border">
          <img
            src={previewUrl}
            alt="Share card preview"
            className="w-full h-auto block"
          />
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        className="mt-2 text-[10px] tracking-widest hover:border-lime hover:text-lime w-full"
      >
        {t('nutrition.summary.share')}
      </Button>
    </div>
  )
}
