/**
 * Mis recetas — recetas guardadas del plan pantry-aware (#179).
 * El costo/porción se calcula on-the-fly con computeRecipeCost (precios
 * actuales de la despensa) — nunca se persiste.
 *
 * Ruta: /saved-recipes
 */
import { memo, useMemo } from 'react'
import { Alert, FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, X } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { usePantryItems } from '@calistenia/core/hooks/usePantry'
import { useDeleteSavedRecipe, useSavedRecipes } from '@calistenia/core/hooks/useSavedRecipes'
import { computeRecipeCost, formatMoney } from '@calistenia/core/lib/shopping'
import type { PantryItem, SavedRecipe } from '@calistenia/core/types'

const MUTED = 'hsl(0 0% 55%)'

const RecipeRow = memo(function RecipeRow({
  item,
  pantryItems,
  onPress,
  onDelete,
}: {
  item: SavedRecipe
  pantryItems: PantryItem[]
  onPress: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const servings = Math.max(1, item.recipe?.servings ?? 1)
  const ingredients = useMemo(() => item.recipe?.ingredients ?? [], [item.recipe?.ingredients])
  const cost = useMemo(
    () => (ingredients.length ? computeRecipeCost(ingredients, pantryItems, servings) : null),
    [ingredients, pantryItems, servings],
  )
  const hasAnyPrice = cost != null && cost.breakdown.some((b) => b.source !== 'sin_precio')
  const meta = [
    t('savedRecipes.ingredientsCount', { count: ingredients.length }),
    item.recipe?.prep_minutes != null ? `${item.recipe.prep_minutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border py-3 active:opacity-70"
      accessibilityRole="button"
    >
      <View className="flex-1">
        <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
          {item.label}
        </Text>
        <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {meta}
        </Text>
      </View>
      {hasAnyPrice && (
        <View className="items-end">
          <Text className="font-bebas text-lg leading-none text-lime-400">
            {cost!.hasEstimates ? '~' : ''}${formatMoney(cost!.perServing)}
          </Text>
          <Text className="font-mono text-[9px] uppercase text-muted-foreground">
            {t('savedRecipes.perServing')}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onDelete}
        hitSlop={6}
        className="-my-2 p-2"
        accessibilityRole="button"
        accessibilityLabel={t('savedRecipes.delete')}
      >
        <X size={14} color={MUTED} />
      </Pressable>
    </Pressable>
  )
})

export default function SavedRecipesScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const authUser = useAuthUser()
  const uid = authUser?.id ?? null
  const { data: recipes = [], isLoading } = useSavedRecipes(uid)
  const { data: pantryItems = [] } = usePantryItems(uid)
  const del = useDeleteSavedRecipe(uid)

  const openRecipe = (r: SavedRecipe) => {
    router.push({
      pathname: '/recipe-detail',
      params: { label: r.label, recipe: JSON.stringify(r.recipe) },
    })
  }

  // Borrar aquí SÍ es destructivo: la receta no vive en ningún otro lado.
  const confirmDelete = (r: SavedRecipe) => {
    Alert.alert(t('savedRecipes.deleteTitle'), t('savedRecipes.deleteMsg', { label: r.label }), [
      { text: t('common.cancel', 'Cancelar'), style: 'cancel' },
      { text: t('savedRecipes.delete'), style: 'destructive', onPress: () => del.mutate(r.id) },
    ])
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Volver')}
        >
          <ArrowLeft size={20} color={MUTED} />
        </Pressable>
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground">
            {t('savedRecipes.kicker')}
          </Text>
          <Text className="font-bebas text-4xl text-foreground">{t('savedRecipes.title')}</Text>
        </View>
      </View>

      {recipes.length === 0 && !isLoading ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="mb-2 font-mono text-xs uppercase tracking-[3px] text-muted-foreground">
            {t('savedRecipes.emptyTitle')}
          </Text>
          <Text className="text-center font-sans text-sm text-muted-foreground">
            {t('savedRecipes.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          className="px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <RecipeRow
              item={item}
              pantryItems={pantryItems}
              onPress={() => openRecipe(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}
