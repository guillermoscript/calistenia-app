/**
 * FrequentMealsRow (extraído en #470) — fila horizontal de comidas frecuentes
 * para re-registrar de un toque. Un fallo al guardar se reporta y avisa aquí;
 * el padre solo provee `onQuickAdd`.
 */
import { View, ScrollView, Pressable, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { Sentry } from '@/lib/instrument'
import type { NutritionEntry } from '@calistenia/core/types'

interface FrequentMealsRowProps {
  meals: NutritionEntry[]
  /** Guarda una copia de la entry como comida de ahora. */
  onQuickAdd: (entry: NutritionEntry) => Promise<unknown>
}

export default function FrequentMealsRow({ meals, onQuickAdd }: FrequentMealsRowProps) {
  const { t } = useTranslation()
  if (meals.length === 0) return null

  return (
    <View className="mb-5">
      <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground mb-3">
        {t('nutrition.frequentMeals')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2.5 px-0.5"
      >
        {meals.map((entry, i) => {
          const foodNames = entry.foods.map(f => f.name).filter(Boolean)
          const summary = foodNames.length > 2
            ? foodNames.slice(0, 2).join(', ') + ` +${foodNames.length - 2}`
            : foodNames.join(', ')
          return (
            <Pressable
              key={entry.id ?? i}
              onPress={async () => {
                haptics.medium()
                try {
                  await onQuickAdd(entry)
                } catch (e) {
                  Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'quick_add_recent_entry' } })
                  haptics.error()
                  Alert.alert(t('nutrition.logger.saveError', { defaultValue: 'No se pudo guardar' }))
                }
              }}
              className="w-40 p-3 bg-card border border-border rounded-xl active:border-lime-400/40"
            >
              <Text className="text-xs font-sans-medium text-foreground" numberOfLines={1}>
                {summary || t('nutrition.noName')}
              </Text>
              <Text className="font-mono text-[10px] text-muted-foreground mt-1">
                {Math.round(entry.totalCalories)} kcal · {Math.round(entry.totalProtein)}g P
              </Text>
              <View className="flex-row items-center gap-1 mt-1.5">
                <Plus size={10} className="text-lime-400" />
                <Text className="font-mono text-[9px] text-lime-400 tracking-widest uppercase">{t('nutrition.register')}</Text>
              </View>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
