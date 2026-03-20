import { useCallback } from 'react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { shareImage, canvasToBlob } from '../../lib/share'
import type { DailyTotals, NutritionGoal } from '../../types'

interface DailySummaryCardProps {
  date: string
  totals: DailyTotals
  goals: NutritionGoal | null
  waterMl: number
  waterGoal: number
}

/** Draw a rounded rectangle path */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export default function DailySummaryCard({ date, totals, goals, waterMl, waterGoal }: DailySummaryCardProps) {
  const handleShare = useCallback(async () => {
    try {
      const scale = 3
      const w = 400
      const h = 340
      const pad = 28
      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(scale, scale)

      // ── Background ──
      ctx.fillStyle = '#0c0c0c'
      ctx.fillRect(0, 0, w, h)

      // ── Accent bar (left) ──
      roundRect(ctx, 0, 0, 5, h, 0)
      ctx.fillStyle = '#a3e635'
      ctx.fill()

      // ── Header: app name + date ──
      ctx.fillStyle = '#a3e635'
      ctx.font = '600 13px system-ui, -apple-system, sans-serif'
      ctx.fillText('CALISTENIA APP', pad, 28)

      ctx.fillStyle = '#525252'
      ctx.font = '400 11px system-ui, -apple-system, sans-serif'
      ctx.fillText(formatDate(date), pad, 44)

      // ── Calories: big number + goal ──
      const calVal = Math.round(totals.calories)
      const calGoal = goals?.dailyCalories ?? 0
      const calPct = calGoal > 0 ? Math.min(calVal / calGoal, 1) : 0

      ctx.fillStyle = '#fafafa'
      ctx.font = '700 42px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${calVal}`, pad, 92)
      const calWidth = ctx.measureText(`${calVal}`).width

      ctx.fillStyle = '#525252'
      ctx.font = '400 16px system-ui, -apple-system, sans-serif'
      ctx.fillText('kcal', pad + calWidth + 6, 92)

      if (calGoal > 0) {
        const kcalWidth = ctx.measureText('kcal').width
        ctx.fillStyle = '#404040'
        ctx.font = '400 14px system-ui, -apple-system, sans-serif'
        ctx.fillText(`/ ${calGoal}`, pad + calWidth + 6 + kcalWidth + 6, 92)
      }

      // ── Calorie progress bar ──
      const barY = 102
      const barW = w - pad * 2
      const barH = 4
      roundRect(ctx, pad, barY, barW, barH, 2)
      ctx.fillStyle = '#1c1c1c'
      ctx.fill()
      if (calPct > 0) {
        roundRect(ctx, pad, barY, barW * calPct, barH, 2)
        ctx.fillStyle = calVal > calGoal ? '#ef4444' : '#a3e635'
        ctx.fill()
      }

      // ── Macro rows ──
      const macros = [
        { label: 'Proteina', val: Math.round(totals.protein), goal: goals?.dailyProtein, unit: 'g', color: '#38bdf8' },
        { label: 'Carbos', val: Math.round(totals.carbs), goal: goals?.dailyCarbs, unit: 'g', color: '#fbbf24' },
        { label: 'Grasa', val: Math.round(totals.fat), goal: goals?.dailyFat, unit: 'g', color: '#f472b6' },
        { label: 'Agua', val: waterMl, goal: waterGoal, unit: 'ml', color: '#38bdf8' },
      ]

      const rowStart = 130
      const rowH = 44

      macros.forEach((m, i) => {
        const y = rowStart + i * rowH
        const pct = m.goal ? Math.min(m.val / m.goal, 1) : 0

        // Value
        ctx.fillStyle = m.color
        ctx.font = '700 18px system-ui, -apple-system, sans-serif'
        ctx.fillText(`${m.val}${m.unit}`, pad, y + 4)

        // Label + goal
        ctx.fillStyle = '#737373'
        ctx.font = '400 13px system-ui, -apple-system, sans-serif'
        const goalStr = m.goal ? ` / ${m.goal}${m.unit}` : ''
        ctx.fillText(`${m.label}${goalStr}`, pad + 90, y + 4)

        // Progress bar
        const pbY = y + 12
        const pbW = barW
        roundRect(ctx, pad, pbY, pbW, 3, 1.5)
        ctx.fillStyle = '#1c1c1c'
        ctx.fill()
        if (pct > 0) {
          roundRect(ctx, pad, pbY, pbW * pct, 3, 1.5)
          ctx.fillStyle = m.color + '99' // semi-transparent
          ctx.fill()
        }
      })

      // ── Footer divider ──
      const footerY = rowStart + macros.length * rowH + 10
      ctx.fillStyle = '#1c1c1c'
      ctx.fillRect(pad, footerY, barW, 1)

      // ── Footer text ──
      ctx.fillStyle = '#404040'
      ctx.font = '400 10px system-ui, -apple-system, sans-serif'
      ctx.fillText('calistenia-app.com', pad, footerY + 18)

      // ── Lime dot accent near footer ──
      ctx.fillStyle = '#a3e635'
      ctx.beginPath()
      ctx.arc(w - pad, footerY + 14, 3, 0, Math.PI * 2)
      ctx.fill()

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      await shareImage(blob, `nutricion_${date}.png`, `Mi nutricion ${formatDate(date)}`)
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [date, totals, goals, waterMl, waterGoal])

  const calPct = goals ? Math.round((totals.calories / goals.dailyCalories) * 100) : 0
  const waterPct = Math.round((waterMl / waterGoal) * 100)

  return (
    <div>
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-[9px] text-muted-foreground tracking-widest uppercase">Resumen del dia</div>
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
            <div className="text-[9px] text-muted-foreground">Prot</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-amber-400">{Math.round(totals.carbs)}g</div>
            <div className="text-[9px] text-muted-foreground">Carbs</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-pink-400">{Math.round(totals.fat)}g</div>
            <div className="text-[9px] text-muted-foreground">Grasa</div>
          </div>
          <div>
            <div className={cn('text-[13px] font-mono', waterPct >= 100 ? 'text-sky-400' : 'text-sky-600')}>{waterMl}ml</div>
            <div className="text-[9px] text-muted-foreground">Agua</div>
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        className="mt-2 text-[10px] tracking-widest hover:border-lime hover:text-lime w-full"
      >
        COMPARTIR RESUMEN
      </Button>
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}
