import { useState, useCallback } from 'react'
import { pb } from '../../lib/pocketbase'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { AI_API_URL } from '../../lib/ai-api'

interface MacroTarget {
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface PlannedFood {
  name: string
  portion: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface PlannedMeal {
  meal_type: 'desayuno' | 'almuerzo' | 'cena' | 'snack'
  label: string
  foods: PlannedFood[]
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
}

interface DailyMealPlanProps {
  remaining: MacroTarget
  goals: MacroTarget
  loggedMealTypes: string[]
}

const MEAL_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  desayuno: { label: 'Desayuno', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  almuerzo: { label: 'Almuerzo', color: 'text-sky-500', bg: 'bg-sky-500/10 border-sky-500/30' },
  cena:     { label: 'Cena',     color: 'text-pink-500', bg: 'bg-pink-500/10 border-pink-500/30' },
  snack:    { label: 'Snack',    color: 'text-lime-400', bg: 'bg-lime-400/10 border-lime-400/30' },
}

export default function DailyMealPlan({ remaining, goals, loggedMealTypes }: DailyMealPlanProps) {
  const [plan, setPlan] = useState<PlannedMeal[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    setOpen(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`

      const res = await fetch(`${AI_API_URL}/api/generate-meal-plan`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          remaining_calories: Math.round(remaining.calories),
          remaining_protein: Math.round(remaining.protein),
          remaining_carbs: Math.round(remaining.carbs),
          remaining_fat: Math.round(remaining.fat),
          logged_meal_types: loggedMealTypes,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Error ${res.status}`)
      }
      const data = await res.json()
      setPlan(data.meals || [])
    } catch (e: any) {
      setError(e.message || 'Error al generar el plan. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [remaining, loggedMealTypes])

  const nothingRemaining = remaining.calories <= 50

  if (nothingRemaining) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">IA</div>
          <div className="font-bebas text-2xl mt-0.5">PLAN DEL DÍA</div>
        </div>
        <Button
          onClick={generate}
          disabled={loading}
          size="sm"
          className="bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas tracking-widest h-9 px-4"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="flex gap-0.5">
                <span className="size-1.5 rounded-full bg-zinc-900 animate-bounce [animation-delay:0ms]" />
                <span className="size-1.5 rounded-full bg-zinc-900 animate-bounce [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-zinc-900 animate-bounce [animation-delay:300ms]" />
              </span>
              GENERANDO
            </span>
          ) : plan ? 'REGENERAR' : 'GENERAR PLAN'}
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/20">
          <CardContent className="p-4 text-sm text-red-400">{error}</CardContent>
        </Card>
      )}

      {!open && !plan && !loading && (
        <Card className="border-dashed border-lime-400/20">
          <CardContent className="p-5 text-center">
            <div className="text-2xl mb-2">🍽️</div>
            <div className="text-sm text-foreground font-medium">¿Qué comer el resto del día?</div>
            <div className="text-xs text-muted-foreground mt-1">
              Te quedan <span className="text-lime-400 font-medium">{Math.round(remaining.calories)} kcal</span> ·{' '}
              {Math.round(remaining.protein)}g prot · {Math.round(remaining.carbs)}g carbs · {Math.round(remaining.fat)}g grasa
            </div>
            <Button
              onClick={generate}
              variant="outline"
              size="sm"
              className="mt-3 border-lime-400/30 text-lime-400 hover:bg-lime-400/10 font-bebas tracking-widest"
            >
              GENERAR PLAN CON IA
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-3">Calculando el mejor plan para tus macros restantes...</div>
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {plan && !loading && plan.length > 0 && (
        <div className="space-y-3">
          {plan.map((meal, i) => {
            const colors = MEAL_COLORS[meal.meal_type] || MEAL_COLORS.snack
            return (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className={cn('text-[9px] tracking-widest px-2 py-0.5 rounded border', colors.bg, colors.color)}>
                      {meal.label || colors.label}
                    </span>
                    <span className="font-bebas text-lg text-foreground">{meal.total_calories} kcal</span>
                  </div>
                  <div className="space-y-1.5">
                    {meal.foods.map((food, fi) => (
                      <div key={fi} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-foreground">{food.name}</span>
                        <span className="text-muted-foreground shrink-0">{food.portion}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-3 pt-2.5 border-t border-border text-[11px]">
                    <span className="text-sky-500">{meal.total_protein}g P</span>
                    <span className="text-amber-400">{meal.total_carbs}g C</span>
                    <span className="text-pink-500">{meal.total_fat}g G</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
