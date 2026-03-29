import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { MEAL_TYPE_COLORS } from '../../lib/style-tokens'
import type { WeeklyPlannedMeal } from '../../types'

interface Props {
  meal: WeeklyPlannedMeal
  onLog: () => Promise<void>
  onDelete: () => Promise<void>
}

export default function WeeklyPlanMealCard({ meal, onLog, onDelete }: Props) {
  const { t } = useTranslation()
  const [logging, setLogging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const colors = MEAL_TYPE_COLORS[meal.meal_type] || MEAL_TYPE_COLORS.snack

  return (
    <Card className={cn(meal.logged && 'opacity-60')}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className={cn('text-[9px] tracking-widest px-2 py-0.5 rounded border', colors.bg, colors.color)}>
            {meal.label || t(`meal.${meal.meal_type}`)}
          </span>
          <span className="font-bebas text-lg text-foreground">
            {meal.logged && <span className="text-emerald-400 mr-1.5">✓</span>}
            {meal.calories} kcal
          </span>
        </div>

        <div className="text-xs text-muted-foreground leading-relaxed">
          {meal.description}
        </div>

        <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border">
          <div className="flex gap-3 sm:gap-4 text-[11px] min-w-0">
            <span className="text-sky-500 tabular-nums">{meal.protein}g P</span>
            <span className="text-amber-400 tabular-nums">{meal.carbs}g C</span>
            <span className="text-pink-500 tabular-nums">{meal.fat}g G</span>
          </div>

          <div className="flex gap-1.5 shrink-0">
            {!meal.logged && (
              <Button
                size="sm"
                variant="outline"
                disabled={logging}
                onClick={async () => {
                  setLogging(true)
                  try { await onLog() } finally { setLogging(false) }
                }}
                className="h-8 px-3 text-[10px] font-mono tracking-widest border-lime-400/30 text-lime-400 hover:bg-lime-400/10"
              >
                {logging ? '...' : t('nutrition.weeklyPlan.iAteThis')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true)
                try { await onDelete() } finally { setDeleting(false) }
              }}
              className="h-8 px-2 text-[10px] text-muted-foreground hover:text-red-400"
            >
              ✕
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
