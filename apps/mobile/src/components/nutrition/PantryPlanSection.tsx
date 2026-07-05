import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Chip } from '@/components/ui/chip'
import { RecipeDetailSheet } from '@/components/pantry/RecipeDetailSheet'
import { usePantryPlan } from '@calistenia/core/hooks/usePantryPlan'
import type { PantryPlanGoals } from '@calistenia/core/lib/pantry-api'
import type { HowManyMealsResult, PantryDayPlanResult, PantryPlannedMeal } from '@calistenia/core/types'

const MEAL_TYPE_COLORS: Record<string, string> = {
  desayuno: 'bg-amber-400',
  almuerzo: 'bg-sky-400',
  cena: 'bg-pink-400',
  snack: 'bg-lime-400',
}

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

interface PantryPlanSectionProps {
  userId: string | null
  goals: PantryPlanGoals
}

export function PantryPlanSection({ userId, goals }: PantryPlanSectionProps) {
  const { t } = useTranslation()
  const { hasPantry, generateDay, howManyMeals } = usePantryPlan(userId)
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
      setDayPlan(await generateDay(isoDate(target === 'tomorrow' ? 1 : 0), goals))
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
        {t('pantryPlan.kicker')}
      </Text>

      {/* Controles: Hoy/Mañana + CTAs */}
      <View className="flex-row items-center gap-2 mb-3">
        <Chip label={t('pantryPlan.tomorrow')} active={target === 'tomorrow'} onPress={() => setTarget('tomorrow')} />
        <Chip label={t('pantryPlan.today')} active={target === 'today'} onPress={() => setTarget('today')} />
      </View>
      <Pressable
        onPress={onGenerateDay}
        disabled={loading !== null}
        className={loading ? 'rounded-lg bg-lime-400/50 py-2.5 items-center' : 'rounded-lg bg-lime-400 py-2.5 items-center'}
      >
        {loading === 'day' ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text className="font-bebas text-base tracking-wide text-black">{t('pantryPlan.generateDay')}</Text>
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
            {t('pantryPlan.planFor', { date: dayPlan.target_date ?? isoDate(target === 'tomorrow' ? 1 : 0) })}
          </Text>
          {dayPlan.meals.map((meal, i) => (
            <Pressable
              key={`${meal.meal_type}-${i}`}
              onPress={() => meal.recipe && setRecipeMeal(meal)}
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
          {dayPlan.notes ? <Text className="font-sans text-xs text-muted-foreground mt-2">{dayPlan.notes}</Text> : null}
        </View>
      )}

      {/* Resultado: cuántas comidas */}
      {howMany && (
        <View className="mt-3 rounded-lg border border-border p-4">
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
              <Text className="font-mono text-[10px] text-amber-400">
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
