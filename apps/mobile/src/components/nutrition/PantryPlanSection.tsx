import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Chip } from '@/components/ui/chip'
import { RecipeDetailSheet } from '@/components/pantry/RecipeDetailSheet'
import { usePantryPlan } from '@calistenia/core/hooks/usePantryPlan'
import { todayStr, addDays } from '@calistenia/core/lib/dateUtils'
import type { PantryPlanGoals } from '@calistenia/core/lib/pantry-api'
import type { HowManyMealsResult, PantryDayPlanResult, PantryPlannedMeal } from '@calistenia/core/types'

const MEAL_TYPE_COLORS: Record<string, string> = {
  desayuno: 'bg-amber-400',
  almuerzo: 'bg-sky-400',
  cena: 'bg-pink-400',
  snack: 'bg-lime-400',
}

// tz-aware — new Date().toISOString() corre el día en la tarde para tz al oeste de UTC.
function isoDate(offsetDays: number): string {
  return addDays(todayStr(), offsetDays)
}

// "2026-07-06" → "dom, 6 jul" (misma convención que formatWeekRange en WeeklyMealPlan)
function formatDayLabel(dateStr: string, lang: string): string {
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr
  }
}

interface PantryPlanSectionProps {
  userId: string | null
  goals: PantryPlanGoals
}

export function PantryPlanSection({ userId, goals }: PantryPlanSectionProps) {
  const { t, i18n } = useTranslation()
  const { hasPantry, pantryCount, generateDay, howManyMeals } = usePantryPlan(userId)
  const [target, setTarget] = useState<'today' | 'tomorrow'>('tomorrow') // default Mañana (caso de uso: qué cocino mañana)
  const [loading, setLoading] = useState<'day' | 'howmany' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dayPlan, setDayPlan] = useState<PantryDayPlanResult | null>(null)
  const [howMany, setHowMany] = useState<HowManyMealsResult | null>(null)
  const [recipeMeal, setRecipeMeal] = useState<PantryPlannedMeal | null>(null)

  if (!hasPantry) return null

  const onGenerateDay = async () => {
    setLoading('day'); setError(null); setHowMany(null)
    try {
      const plan = await generateDay(isoDate(target === 'tomorrow' ? 1 : 0), goals)
      // LLM degenerado sin comidas = fallo, no un plan vacío con TOTAL 0.
      if (!plan.meals?.length) throw new Error('empty plan')
      setDayPlan(plan)
    } catch {
      setError(t('pantryPlan.error'))
    } finally {
      setLoading(null)
    }
  }

  const onHowMany = async () => {
    setLoading('howmany'); setError(null); setDayPlan(null)
    try {
      setHowMany(await howManyMeals(goals))
    } catch {
      setError(t('pantryPlan.error'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <View className="mt-6 border-t border-border pt-5">
      <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
        {t('pantryPlan.kicker')} · {t('pantryPlan.itemCount', { count: pantryCount })}
      </Text>

      {/* Controles: Hoy/Mañana + CTAs */}
      <View className="flex-row items-center gap-2 mb-3">
        <Chip label={t('pantryPlan.tomorrow')} active={target === 'tomorrow'} onPress={() => loading === null && setTarget('tomorrow')} />
        <Chip label={t('pantryPlan.today')} active={target === 'today'} onPress={() => loading === null && setTarget('today')} />
      </View>
      <Pressable
        onPress={onGenerateDay}
        disabled={loading !== null}
        className={loading ? 'rounded-lg bg-lime-400/50 py-2.5 items-center' : 'rounded-lg bg-lime-400 py-2.5 items-center'}
      >
        {loading === 'day' ? (
          <ActivityIndicator size="small" color="#18181b" />
        ) : (
          <Text className="font-bebas text-base tracking-wide text-zinc-900">{t('pantryPlan.generateDay')}</Text>
        )}
      </Pressable>
      <Pressable onPress={onHowMany} disabled={loading !== null} className="py-2.5 items-center">
        {loading === 'howmany' ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text className="font-mono text-xs uppercase tracking-wide text-lime-400">{t('pantryPlan.howMany')}</Text>
        )}
      </Pressable>

      {error && (
        <View className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 mt-2">
          <Text className="font-sans text-sm text-red-400">{error}</Text>
        </View>
      )}

      {/* Resultado: plan del día */}
      {dayPlan && (
        <View className="mt-3">
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {t('pantryPlan.planFor', {
              date: formatDayLabel(dayPlan.target_date ?? isoDate(target === 'tomorrow' ? 1 : 0), i18n.language),
            })}
          </Text>
          {dayPlan.meals.map((meal, i) => (
            <Pressable
              key={`${meal.meal_type}-${i}`}
              onPress={() => meal.recipe && setRecipeMeal(meal)}
              disabled={!meal.recipe}
              className="border-b border-border py-3"
            >
              <View className="flex-row items-center gap-2">
                <View className={`h-2 w-2 rounded-full ${MEAL_TYPE_COLORS[meal.meal_type] ?? 'bg-muted'}`} />
                <Text className="font-sans-medium text-sm text-foreground flex-1" numberOfLines={1}>
                  {meal.label}
                </Text>
                <Text className="font-mono text-xs text-muted-foreground">{meal.calories} kcal</Text>
              </View>
              <View className="flex-row items-center justify-between mt-1 pl-4">
                <Text className="font-mono text-[10px] text-muted-foreground">
                  P{meal.protein} · C{meal.carbs} · G{meal.fat}
                </Text>
                {meal.recipe && (
                  <Text className="font-mono text-[10px] uppercase tracking-wide text-lime-400">
                    {t('pantryPlan.viewRecipe')} →
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
          {(() => {
            const total = dayPlan.meals.reduce(
              (a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
              { calories: 0, protein: 0, carbs: 0, fat: 0 },
            )
            return (
              <View className="py-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t('pantryPlan.total')}
                  </Text>
                  <Text className="font-bebas text-lg leading-none text-foreground">
                    {total.calories}
                    <Text className="font-mono text-[10px] text-muted-foreground"> / {goals.calories} kcal</Text>
                  </Text>
                </View>
                <View className="flex-row justify-end mt-1">
                  <Text className="font-mono text-[10px] text-muted-foreground">
                    P{total.protein} · C{total.carbs} · G{total.fat}
                  </Text>
                </View>
              </View>
            )
          })()}
          {dayPlan.notes ? <Text className="font-sans text-xs text-muted-foreground mt-2">{dayPlan.notes}</Text> : null}
        </View>
      )}

      {/* Resultado: cuántas comidas — hairline, no card (idioma spec-sheet) */}
      {howMany && (
        <View className="mt-4 border-t border-border pt-3">
          <View className="flex-row items-baseline gap-2">
            <Text className="font-bebas text-4xl text-lime-400">{howMany.total_meals}</Text>
            <Text className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {t('pantryPlan.mealsUnit')} · {t('pantryPlan.daysCovered', { days: howMany.days_covered })}
            </Text>
          </View>
          {howMany.breakdown.map((row, i) => (
            <View key={`${row.meal_label}-${i}`} className="flex-row items-center justify-between border-t border-border py-2 mt-2">
              <Text className="font-sans text-sm text-foreground flex-1" numberOfLines={1}>
                {row.meal_label} <Text className="font-mono text-xs text-muted-foreground">×{row.times_possible}</Text>
              </Text>
              <Text className="font-mono text-[10px] text-amber-400 shrink pl-2 text-right" numberOfLines={1}>
                {t('pantryPlan.limitedBy', { ingredient: row.limiting_ingredient })}
              </Text>
            </View>
          ))}
          <Text className="font-sans text-xs text-muted-foreground mt-2">{howMany.summary}</Text>
        </View>
      )}

      <RecipeDetailSheet
        visible={recipeMeal != null}
        mealLabel={recipeMeal?.label ?? ''}
        recipe={recipeMeal?.recipe ?? null}
        onClose={() => setRecipeMeal(null)}
      />
    </View>
  )
}
