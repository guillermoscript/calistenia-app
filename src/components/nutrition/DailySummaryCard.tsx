import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import type { DailyTotals, NutritionGoal } from '../../types'

interface DailySummaryCardProps {
  date: string
  totals: DailyTotals
  goals: NutritionGoal | null
  waterMl: number
  waterGoal: number
}

/** Draw a rounded rect path */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/** Draw a filled rounded rect */
function fillRRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  rrect(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

/** Draw a circular arc gauge */
function drawGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, pct: number, trackColor: string, fillColor: string, lineWidth: number) {
  // Track
  ctx.beginPath()
  ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5)
  ctx.strokeStyle = trackColor
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.stroke()
  // Fill
  if (pct > 0) {
    const endAngle = -Math.PI / 2 + Math.PI * 2 * Math.min(pct, 1)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle)
    ctx.strokeStyle = fillColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.stroke()
  }
}

export default function DailySummaryCard({ date, totals, goals, waterMl, waterGoal }: DailySummaryCardProps) {
  const { t } = useTranslation()
  const handleShare = useCallback(async () => {
    try {
      const scale = 2
      const w = 1080 / scale
      const h = 1920 / scale
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1920
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(scale, scale)
      const pad = 36
      const logo = await loadLogo()

      // ── Background gradient ──
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#0a0a0a')
      grad.addColorStop(0.5, '#0f0f0f')
      grad.addColorStop(1, '#0a0a0a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // ── Header with logo ──
      const logoSize = 44
      const headerY = 40
      if (logo) {
        ctx.drawImage(logo, pad, headerY, logoSize, logoSize)
      }
      const textX = logo ? pad + logoSize + 12 : pad

      ctx.fillStyle = '#fafafa'
      ctx.font = '700 16px system-ui, -apple-system, sans-serif'
      ctx.fillText('CALISTENIA APP', textX, headerY + 20)

      ctx.fillStyle = '#525252'
      ctx.font = '400 12px system-ui, -apple-system, sans-serif'
      ctx.fillText(formatDate(date), textX, headerY + 38)

      // ── Section label ──
      ctx.fillStyle = '#404040'
      ctx.font = '600 11px system-ui, -apple-system, sans-serif'
      ctx.fillText(t('nutrition.summary.sectionLabel'), pad, 120)

      // ── Calorie gauge ──
      const calVal = Math.round(totals.calories)
      const calGoal = goals?.dailyCalories ?? 0
      const calPct = calGoal > 0 ? calVal / calGoal : 0
      const gaugeR = 80
      const gaugeCx = w / 2
      const gaugeCy = 240

      drawGauge(ctx, gaugeCx, gaugeCy, gaugeR, calPct, '#1a1a1a', calVal > calGoal ? '#ef4444' : '#a3e635', 10)

      // Calorie number inside gauge
      ctx.fillStyle = '#fafafa'
      ctx.font = '700 48px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${calVal}`, gaugeCx, gaugeCy + 8)

      ctx.fillStyle = '#525252'
      ctx.font = '400 14px system-ui, -apple-system, sans-serif'
      ctx.fillText('kcal', gaugeCx, gaugeCy + 28)

      if (calGoal > 0) {
        ctx.fillStyle = '#404040'
        ctx.font = '400 13px system-ui, -apple-system, sans-serif'
        ctx.fillText(`de ${calGoal} kcal`, gaugeCx, gaugeCy + gaugeR + 28)
      }

      ctx.textAlign = 'left'

      // ── Percentage chip ──
      if (calGoal > 0) {
        const pctText = `${Math.round(calPct * 100)}%`
        const chipW = ctx.measureText(pctText).width + 20
        const chipColor = calVal > calGoal ? '#ef4444' : calPct >= 0.8 ? '#a3e635' : '#525252'
        fillRRect(ctx, gaugeCx - chipW / 2, gaugeCy + gaugeR + 40, chipW, 26, 13, chipColor + '20')
        ctx.fillStyle = chipColor
        ctx.font = '600 12px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(pctText, gaugeCx, gaugeCy + gaugeR + 57)
        ctx.textAlign = 'left'
      }

      // ── Macro cards ──
      const macros = [
        { label: t('nutrition.protein'), val: Math.round(totals.protein), goal: goals?.dailyProtein, unit: 'g', color: '#38bdf8', emoji: '' },
        { label: t('nutrition.carbs'), val: Math.round(totals.carbs), goal: goals?.dailyCarbs, unit: 'g', color: '#fbbf24', emoji: '' },
        { label: t('nutrition.fat'), val: Math.round(totals.fat), goal: goals?.dailyFat, unit: 'g', color: '#f472b6', emoji: '' },
      ]

      const cardStartY = gaugeCy + gaugeR + 90
      const cardH = 80
      const cardGap = 12
      const barW = w - pad * 2

      macros.forEach((m, i) => {
        const y = cardStartY + i * (cardH + cardGap)
        const pct = m.goal ? Math.min(m.val / m.goal, 1) : 0

        // Card background
        fillRRect(ctx, pad, y, barW, cardH, 14, '#141414')

        // Value
        ctx.fillStyle = m.color
        ctx.font = '700 28px system-ui, -apple-system, sans-serif'
        ctx.fillText(`${m.val}${m.unit}`, pad + 20, y + 36)

        // Label + goal
        ctx.fillStyle = '#737373'
        ctx.font = '400 13px system-ui, -apple-system, sans-serif'
        const goalStr = m.goal ? ` / ${m.goal}${m.unit}` : ''
        ctx.fillText(`${m.label}${goalStr}`, pad + 20, y + 56)

        // Progress bar
        const pbX = pad + 20
        const pbY = y + 66
        const pbW = barW - 40
        fillRRect(ctx, pbX, pbY, pbW, 4, 2, '#1f1f1f')
        if (pct > 0) {
          fillRRect(ctx, pbX, pbY, pbW * pct, 4, 2, m.color)
        }
      })

      // ── Water card ──
      const waterY = cardStartY + macros.length * (cardH + cardGap)
      const waterPct = waterGoal > 0 ? Math.min(waterMl / waterGoal, 1) : 0
      fillRRect(ctx, pad, waterY, barW, cardH, 14, '#141414')

      ctx.fillStyle = '#38bdf8'
      ctx.font = '700 28px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${waterMl}ml`, pad + 20, waterY + 36)

      ctx.fillStyle = '#737373'
      ctx.font = '400 13px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${t('nutrition.summary.water')} / ${waterGoal}ml`, pad + 20, waterY + 56)

      const wpbX = pad + 20
      const wpbY = waterY + 66
      const wpbW = barW - 40
      fillRRect(ctx, wpbX, wpbY, wpbW, 4, 2, '#1f1f1f')
      if (waterPct > 0) {
        fillRRect(ctx, wpbX, wpbY, wpbW * waterPct, 4, 2, '#38bdf8')
      }

      // ── Footer ──
      const footerY = h - 60
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(pad, footerY, barW, 1)

      const footerLogoSize = 22
      if (logo) {
        ctx.drawImage(logo, pad, footerY + 12, footerLogoSize, footerLogoSize)
      }
      ctx.fillStyle = '#404040'
      ctx.font = '400 12px system-ui, -apple-system, sans-serif'
      ctx.fillText('calistenia-app.com', pad + (logo ? footerLogoSize + 8 : 0), footerY + 28)

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      await shareImage(blob, `nutricion_${date}.png`, `Mi nutricion ${formatDate(date)}`)
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [date, totals, goals, waterMl, waterGoal, t])

  const calPct = goals ? Math.round((totals.calories / goals.dailyCalories) * 100) : 0
  const waterPct = Math.round((waterMl / waterGoal) * 100)

  return (
    <div>
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

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}
