import { useRef } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import type { Recipe } from '@calistenia/core/types'

interface RecipeDetailSheetProps {
  visible: boolean
  mealLabel: string
  recipe: Recipe | null
  onClose: () => void
}

export function RecipeDetailSheet({ visible, mealLabel, recipe: recipeProp, onClose }: RecipeDetailSheetProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  // Los callers cierran nulificando el meal (recipe y visible caen juntos); cachear el
  // último contenido mantiene el Modal montado para que el slide-out sí se vea.
  const lastContent = useRef<{ recipe: Recipe; mealLabel: string } | null>(null)
  if (recipeProp) lastContent.current = { recipe: recipeProp, mealLabel }
  if (!lastContent.current) return null
  const { recipe, mealLabel: shownLabel } = lastContent.current

  return (
    <Modal visible={visible && recipeProp != null} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View
          className="border-t border-border bg-card"
          style={{ maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14 }}
        >
          <View className="items-center pb-2 pt-3">
            <View className="h-1 w-9 rounded-full bg-lime/40" />
          </View>

          {/* Header */}
          <View className="flex-row items-start justify-between px-5 pb-3">
            <View className="flex-1 pr-3">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('pantryPlan.recipe')}
                {recipe.prep_minutes != null ? `  ·  ${t('pantryPlan.prepMinutes', { min: recipe.prep_minutes })}` : ''}
              </Text>
              <Text className="font-bebas text-2xl text-foreground">{shownLabel}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text className="text-lg text-muted-foreground">✕</Text>
            </Pressable>
          </View>

          <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
            {/* Ingredientes */}
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {t('pantryPlan.ingredients')}
            </Text>
            <View className="mb-5">
              {recipe.ingredients.map((ing, i) => (
                <View key={`${ing.name_normalized}-${i}`} className="flex-row items-center justify-between border-b border-border py-2">
                  <View className="flex-1 flex-row items-center gap-2 pr-2">
                    <Text className="font-sans text-sm text-foreground" numberOfLines={1}>
                      {ing.name}
                    </Text>
                    {ing.qty != null && (
                      <Text className="font-mono text-xs text-muted-foreground">
                        {ing.qty} {ing.unit ?? ''}
                      </Text>
                    )}
                  </View>
                  <View
                    className={
                      ing.from === 'pantry'
                        ? 'rounded border border-lime/40 bg-lime/10 px-2 py-0.5'
                        : 'rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5'
                    }
                  >
                    <Text
                      className={
                        ing.from === 'pantry'
                          ? 'font-mono text-[10px] uppercase tracking-wide text-lime-400'
                          : 'font-mono text-[10px] uppercase tracking-wide text-amber-400'
                      }
                    >
                      {ing.from === 'pantry' ? `✓ ${t('pantryPlan.haveIt')}` : `🛒 ${t('pantryPlan.toBuy')}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Pasos */}
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {t('pantryPlan.steps')}
            </Text>
            <View className="mb-6">
              {recipe.steps.map((step, i) => (
                <View key={i} className="flex-row gap-3 py-1.5">
                  <Text className="font-bebas text-base text-lime-400 w-5">{i + 1}</Text>
                  <Text className="font-sans text-sm text-foreground flex-1">{step}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
