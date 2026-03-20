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

export default function DailySummaryCard({ date, totals, goals, waterMl, waterGoal }: DailySummaryCardProps) {
  const handleShare = useCallback(async () => {
    try {
      const scale = 2
      const w = 400
      const h = 280
      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(scale, scale)

      // Background
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, w, h)

      // Border accent
      ctx.fillStyle = '#c8f542'
      ctx.fillRect(0, 0, 4, h)

      // App name
      ctx.fillStyle = '#c8f542'
      ctx.font = 'bold 14px system-ui'
      ctx.fillText('Calistenia App', 20, 30)

      // Date
      ctx.fillStyle = '#666'
      ctx.font = '12px system-ui'
      ctx.fillText(date, 20, 50)

      // Calories
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 36px system-ui'
      ctx.fillText(`${Math.round(totals.calories)} kcal`, 20, 100)

      if (goals) {
        ctx.fillStyle = '#666'
        ctx.font = '14px system-ui'
        ctx.fillText(`/ ${goals.dailyCalories} kcal`, 20 + ctx.measureText(`${Math.round(totals.calories)} kcal`).width + 8, 100)
      }

      // Macros
      const macros = [
        { label: 'Proteina', val: Math.round(totals.protein), goal: goals?.dailyProtein, unit: 'g', color: '#22c55e' },
        { label: 'Carbos', val: Math.round(totals.carbs), goal: goals?.dailyCarbs, unit: 'g', color: '#eab308' },
        { label: 'Grasa', val: Math.round(totals.fat), goal: goals?.dailyFat, unit: 'g', color: '#ef4444' },
      ]

      macros.forEach((m, i) => {
        const y = 135 + i * 28
        ctx.fillStyle = m.color
        ctx.font = 'bold 16px system-ui'
        ctx.fillText(`${m.val}${m.unit}`, 20, y)
        ctx.fillStyle = '#888'
        ctx.font = '13px system-ui'
        ctx.fillText(`${m.label}${m.goal ? ` / ${m.goal}${m.unit}` : ''}`, 80, y)
      })

      // Water
      ctx.fillStyle = '#38bdf8'
      ctx.font = 'bold 16px system-ui'
      ctx.fillText(`${waterMl} ml`, 20, 225)
      ctx.fillStyle = '#888'
      ctx.font = '13px system-ui'
      ctx.fillText(`Agua / ${waterGoal} ml`, 100, 225)

      // Footer
      ctx.fillStyle = '#333'
      ctx.fillRect(20, 248, w - 40, 1)
      ctx.fillStyle = '#555'
      ctx.font = '10px system-ui'
      ctx.fillText('calistenia-app.com', 20, 266)

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      await shareImage(blob, `nutricion_${date}.png`, `Nutrición ${date}`)
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
            <div className="text-[13px] font-mono text-emerald-500">{Math.round(totals.protein)}g</div>
            <div className="text-[9px] text-muted-foreground">Prot</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-amber-400">{Math.round(totals.carbs)}g</div>
            <div className="text-[9px] text-muted-foreground">Carbs</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-red-500">{Math.round(totals.fat)}g</div>
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
