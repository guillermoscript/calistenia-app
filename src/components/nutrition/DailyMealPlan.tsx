import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { pb } from '../../lib/pocketbase'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { AI_API_URL } from '../../lib/ai-api'
import { MEAL_TYPE_COLORS } from '../../lib/style-tokens'
import { submitMealPlanJob } from '../../lib/ai-jobs-api'
import { useBackgroundJobs } from '../../hooks/useBackgroundJobs'

interface MacroTarget {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface PlannedMeal {
  meal_type: 'desayuno' | 'almuerzo' | 'cena' | 'snack'
  label: string
  description: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface DailyMealPlanProps {
  remaining: MacroTarget
  goals: MacroTarget
  loggedMealTypes: string[]
  onSaveMeal?: (meal: PlannedMeal) => Promise<void>
}


export default function DailyMealPlan({ remaining, goals, loggedMealTypes, onSaveMeal }: DailyMealPlanProps) {
  const [plan, setPlan] = useState<PlannedMeal[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set())
  const [showBgOption, setShowBgOption] = useState(false)
  const bgTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { addJob, canSubmit } = useBackgroundJobs()

  const handleSendToBackground = useCallback(() => {
    if (!canSubmit) return
    setShowBgOption(false)
    clearTimeout(bgTimerRef.current)
    submitMealPlanJob({
      remaining_calories: Math.round(remaining.calories),
      remaining_protein: Math.round(remaining.protein),
      remaining_carbs: Math.round(remaining.carbs),
      remaining_fat: Math.round(remaining.fat),
      logged_meal_types: loggedMealTypes,
    }).then(id => {
      if (!addJob(id, 'generate-meal-plan')) return
      setLoading(false)
      toast.info('Generando plan en segundo plano', { description: 'Recibiras una notificacion cuando termine', duration: 4000 })
    }).catch(() => {
      toast.error('Error al iniciar la generacion', { description: 'Revisa tu conexion e intenta de nuevo' })
    })
  }, [remaining, loggedMealTypes, addJob, canSubmit])

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    setOpen(true)
    setSavedIndices(new Set())
    setShowBgOption(false)
    bgTimerRef.current = setTimeout(() => setShowBgOption(canSubmit), 20_000)
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
      setShowBgOption(false)
      clearTimeout(bgTimerRef.current)
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
                <span className="size-1.5 rounded-full bg-foreground animate-bounce [animation-delay:0ms]" />
                <span className="size-1.5 rounded-full bg-foreground animate-bounce [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-foreground animate-bounce [animation-delay:300ms]" />
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
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Te quedan <span className="text-lime-400 font-medium tabular-nums">{Math.round(remaining.calories)} kcal</span>
              <span className="hidden sm:inline"> · </span><br className="sm:hidden" />
              <span className="tabular-nums">{Math.round(remaining.protein)}g prot · {Math.round(remaining.carbs)}g carbs · {Math.round(remaining.fat)}g grasa</span>
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
            {showBgOption && (
              <button
                onClick={handleSendToBackground}
                className="w-full text-center text-xs text-lime-400 hover:text-lime-300 font-medium transition-colors py-2 mt-3"
              >
                No esperar — avisame cuando termine
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {plan && !loading && plan.length > 0 && (
        <div className="space-y-3">
          {plan.map((meal, i) => {
            const colors = MEAL_TYPE_COLORS[meal.meal_type] || MEAL_TYPE_COLORS.snack
            const isSaved = savedIndices.has(i)
            const isSaving = savingIndex === i
            return (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn('text-[9px] tracking-widest px-2 py-0.5 rounded border', colors.bg, colors.color)}>
                      {meal.label || colors.label}
                    </span>
                    <span className="font-bebas text-lg text-foreground">{meal.calories} kcal</span>
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
                    {onSaveMeal && (
                      <Button
                        size="sm"
                        variant={isSaved ? 'ghost' : 'outline'}
                        disabled={isSaving || isSaved}
                        onClick={async () => {
                          setSavingIndex(i)
                          try {
                            await onSaveMeal(meal)
                            setSavedIndices(prev => new Set(prev).add(i))
                          } finally {
                            setSavingIndex(null)
                          }
                        }}
                        className={cn(
                          'h-8 px-3 text-[10px] font-mono tracking-widest shrink-0',
                          isSaved
                            ? 'text-emerald-400'
                            : 'border-lime-400/30 text-lime-400 hover:bg-lime-400/10',
                        )}
                      >
                        {isSaving ? '...' : isSaved ? '✓' : 'GUARDAR'}
                      </Button>
                    )}
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
