/** AI-generated daily meal plan suggestions — port of web DailyMealPlan. */
import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { submitMealPlanJob, fetchJobStatus } from '@calistenia/core/lib/ai-jobs-api'
import type { MealType } from '@calistenia/core/types'

export interface PlannedMeal {
  meal_type: MealType
  label: string
  calories: number
  protein: number
  carbs: number
  fat: number
  description?: string
}

interface DailyMealPlanProps {
  remaining: { calories: number; protein: number; carbs: number; fat: number }
  goals: { calories: number; protein: number; carbs: number; fat: number }
  loggedMealTypes: string[]
  onSaveMeal: (meal: PlannedMeal) => Promise<void>
}

const MEAL_TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  desayuno: { text: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  almuerzo: { text: 'text-sky-500',   bg: 'bg-sky-500/10 border-sky-500/30' },
  cena:     { text: 'text-pink-500',  bg: 'bg-pink-500/10 border-pink-500/30' },
  snack:    { text: 'text-lime-400',  bg: 'bg-lime-400/10 border-lime-400/30' },
}

const MEAL_ICONS: Record<string, string> = {
  desayuno: '🍳',
  almuerzo: '🥗',
  cena:     '🍽️',
  snack:    '🍎',
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_SECONDS = 60

export default function DailyMealPlan({ remaining, goals, loggedMealTypes, onSaveMeal }: DailyMealPlanProps) {
  const { t } = useTranslation()
  const [plan, setPlan] = useState<PlannedMeal[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMeals, setSavedMeals] = useState<Set<number>>(new Set())
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollSecondsRef = useRef(0)

  // Clean up poll on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    pollSecondsRef.current = 0
  }, [])

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSavedMeals(new Set())
    stopPolling()

    try {
      const jobId = await submitMealPlanJob({
        remaining_calories: Math.round(remaining.calories),
        remaining_protein: Math.round(remaining.protein),
        remaining_carbs: Math.round(remaining.carbs),
        remaining_fat: Math.round(remaining.fat),
        logged_meal_types: loggedMealTypes,
      })

      // Poll for result
      pollSecondsRef.current = 0
      pollTimerRef.current = setInterval(async () => {
        pollSecondsRef.current += POLL_INTERVAL_MS / 1000
        if (pollSecondsRef.current >= MAX_POLL_SECONDS) {
          stopPolling()
          setLoading(false)
          setError(t('nutrition.dailyPlan.timeout', 'El plan tardó demasiado. Inténtalo de nuevo.'))
          return
        }
        try {
          const job = await fetchJobStatus(jobId)
          if (job.status === 'completed') {
            stopPolling()
            setPlan(job.result?.meals || [])
            setLoading(false)
          } else if (job.status === 'failed') {
            stopPolling()
            setLoading(false)
            setError(job.error || t('nutrition.dailyPlan.error', 'Error al generar el plan'))
          }
        } catch (e: any) {
          stopPolling()
          setLoading(false)
          setError(e.message || t('nutrition.dailyPlan.error', 'Error al generar el plan'))
        }
      }, POLL_INTERVAL_MS)
    } catch (e: any) {
      setLoading(false)
      setError(e.message || t('nutrition.dailyPlan.error', 'Error al generar el plan'))
    }
  }, [remaining, loggedMealTypes, stopPolling, t])

  const nothingRemaining = remaining.calories <= 50
  if (nothingRemaining) return null

  return (
    <View className="gap-3">
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View className="gap-0.5">
          <Text className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            IA
          </Text>
          <Text className="font-bebas text-2xl leading-none text-foreground">
            {t('nutrition.dailyPlan.title', 'PLAN DEL DÍA IA')}
          </Text>
        </View>

        <Pressable
          onPress={generate}
          disabled={loading}
          className={cn(
            'rounded-lg px-4 py-2 items-center justify-center',
            loading ? 'bg-lime-400/50' : 'bg-lime-400 active:bg-lime-300',
          )}
        >
          {loading ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#18181b" />
              <Text className="font-bebas text-sm tracking-widest text-zinc-900">
                {t('nutrition.dailyPlan.generating', 'Generando...')}
              </Text>
            </View>
          ) : (
            <Text className="font-bebas text-sm tracking-widest text-zinc-900">
              {plan
                ? t('nutrition.dailyPlan.regenerate', 'Regenerar')
                : t('nutrition.dailyPlan.generate', 'Generar plan del día')}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Error */}
      {error && (
        <View className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <Text className="font-sans text-sm text-red-400">{error}</Text>
        </View>
      )}

      {/* Empty state — no plan yet, not loading */}
      {!plan && !loading && !error && (
        <View className="rounded-xl border border-dashed border-lime-400/20 bg-card p-5 items-center gap-2">
          <Text className="text-2xl">🍽️</Text>
          <Text className="font-sans-medium text-sm text-foreground text-center">
            {t('nutrition.dailyPlan.whatToEat', '¿Qué comer?')}
          </Text>
          <Text className="font-mono text-[11px] text-muted-foreground text-center leading-relaxed">
            {t('nutrition.dailyPlan.remaining', 'Quedan')}{' '}
            <Text className="text-lime-400">{Math.round(remaining.calories)} kcal</Text>
            {'\n'}
            {Math.round(remaining.protein)}g prot · {Math.round(remaining.carbs)}g carbs · {Math.round(remaining.fat)}g grasa
          </Text>
        </View>
      )}

      {/* Loading skeletons */}
      {loading && (
        <View className="rounded-xl border border-border bg-card p-4 gap-2">
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            {t('nutrition.dailyPlan.calculating', 'Calculando opciones...')}
          </Text>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="h-16 rounded-lg bg-muted/60"
              style={{ opacity: 1 - i * 0.2 }}
            />
          ))}
        </View>
      )}

      {/* Meal plan list */}
      {plan && !loading && plan.length > 0 && (
        <View className="gap-2.5">
          {plan.map((meal, i) => {
            const colors = MEAL_TYPE_COLORS[meal.meal_type] || MEAL_TYPE_COLORS.snack
            const icon = MEAL_ICONS[meal.meal_type] || '🍽️'
            const isSaved = savedMeals.has(i)
            const isSaving = savingIndex === i
            const isAlreadyLogged = loggedMealTypes.includes(meal.meal_type)

            return (
              <View
                key={i}
                className={cn(
                  'rounded-xl border border-border bg-card px-4 py-3 gap-2',
                  isAlreadyLogged && 'opacity-50',
                )}
              >
                {/* Top row: type badge + calories */}
                <View className="flex-row items-center justify-between">
                  <View className={cn('flex-row items-center gap-1.5 rounded border px-2 py-0.5', colors.bg)}>
                    <Text className="text-[11px]">{icon}</Text>
                    <Text className={cn('font-mono text-[9px] uppercase tracking-widest', colors.text)}>
                      {meal.label || meal.meal_type}
                    </Text>
                  </View>
                  <Text className="font-bebas text-lg leading-none text-foreground">
                    {meal.calories} kcal
                  </Text>
                </View>

                {/* Description */}
                {!!meal.description && (
                  <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                    {meal.description}
                  </Text>
                )}

                {/* Bottom row: macros + save button */}
                <View className="flex-row items-center justify-between pt-2 border-t border-border">
                  <View className="flex-row gap-3">
                    <Text className="font-mono text-[11px] text-sky-500">{meal.protein}g P</Text>
                    <Text className="font-mono text-[11px] text-amber-400">{meal.carbs}g C</Text>
                    <Text className="font-mono text-[11px] text-pink-500">{meal.fat}g G</Text>
                  </View>

                  <Pressable
                    onPress={async () => {
                      if (isSaved || isSaving || isAlreadyLogged) return
                      setSavingIndex(i)
                      try {
                        await onSaveMeal(meal)
                        setSavedMeals(prev => new Set(prev).add(i))
                      } catch {
                        setError(t('nutrition.dailyPlan.error', 'Error al guardar la comida'))
                      } finally {
                        setSavingIndex(null)
                      }
                    }}
                    disabled={isSaving || isSaved || isAlreadyLogged}
                    className={cn(
                      'rounded-lg border px-3 py-1.5',
                      isSaved || isAlreadyLogged
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-lime-400/30 active:bg-lime-400/10',
                    )}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#a3e635" />
                    ) : (
                      <Text
                        className={cn(
                          'font-mono text-[10px] uppercase tracking-widest',
                          isSaved || isAlreadyLogged ? 'text-emerald-400' : 'text-lime-400',
                        )}
                      >
                        {isSaved || isAlreadyLogged
                          ? t('nutrition.dailyPlan.logged', 'Registrado')
                          : t('nutrition.dailyPlan.log', 'Registrar')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )
          })}
        </View>
      )}

      {/* Empty result */}
      {plan && !loading && plan.length === 0 && (
        <View className="rounded-xl border border-border bg-card p-5 items-center">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            {t('nutrition.dailyPlan.noSuggestions', 'No se generaron sugerencias. Inténtalo de nuevo.')}
          </Text>
        </View>
      )}
    </View>
  )
}
