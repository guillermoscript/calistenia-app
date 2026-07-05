/**
 * Detalle de receta de un plan pantry-aware (#171).
 * La receta viaja serializada en params (los planes del día no se persisten);
 * la foto se busca en TheMealDB (gratis) con el photo_query en inglés del LLM.
 * El stepper de porciones escala las cantidades de los ingredientes.
 *
 * Ruta: /recipe-detail?label=...&recipe=<json>
 */
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import type { Recipe } from '@calistenia/core/types'

const MUTED = 'hsl(0 0% 55%)'
const MAX_SERVINGS = 8

// Cache in-module: misma query no se re-busca al navegar entre recetas.
const photoCache = new Map<string, string | null>()

async function mealDbFirstThumb(url: string): Promise<string | null> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}`)
  const data = (await res.json()) as { meals?: { strMealThumb?: string }[] | null }
  return data.meals?.[0]?.strMealThumb ?? null
}

async function fetchMealPhoto(query: string): Promise<string | null> {
  const key = query.trim().toLowerCase()
  if (!key) return null
  if (photoCache.has(key)) return photoCache.get(key) ?? null
  try {
    // search.php matchea nombres exactos de plato — suele fallar con queries genéricas
    // ("chicken rice"); el fallback por ingrediente casi siempre encuentra algo.
    let url = await mealDbFirstThumb(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(key)}`)
    if (!url) {
      for (const word of key.split(/\s+/)) {
        if (word.length < 3) continue
        url = await mealDbFirstThumb(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(word)}`)
        if (url) break
      }
    }
    photoCache.set(key, url)
    return url
  } catch {
    // Sin foto no pasa nada — la receta es el contenido.
    photoCache.set(key, null)
    return null
  }
}

// 3 × 1.5 → "4.5", 100 × 2 → "200" — sin colas de float.
function scaleQty(qty: number, factor: number): string {
  const v = Math.round(qty * factor * 10) / 10
  return Number.isInteger(v) ? String(v) : String(v)
}

export default function RecipeDetailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ label?: string; recipe?: string }>()

  const label = typeof params.label === 'string' ? params.label : ''
  const recipe: Recipe | null = useMemo(() => {
    if (typeof params.recipe !== 'string') return null
    try {
      return JSON.parse(params.recipe) as Recipe
    } catch {
      return null
    }
  }, [params.recipe])

  const baseServings = Math.max(1, recipe?.servings ?? 1)
  const [servings, setServings] = useState(baseServings)
  const factor = servings / baseServings

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    const query = recipe?.photo_query ?? label
    if (!query) return
    let active = true
    fetchMealPhoto(query).then((url) => {
      if (active) setPhotoUrl(url)
    })
    return () => {
      active = false
    }
  }, [recipe?.photo_query, label])

  const haveCount = recipe?.ingredients.filter((ing) => ing.from === 'pantry').length ?? 0
  const buyCount = (recipe?.ingredients.length ?? 0) - haveCount

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header back */}
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
      </View>

      {!recipe ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground text-center">{t('pantryPlan.error')}</Text>
        </View>
      ) : (
        <ScrollView className="px-5" showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
          {/* Kicker + título */}
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t('pantryPlan.recipe')}
            {recipe.prep_minutes != null ? `  ·  ${t('pantryPlan.prepMinutes', { min: recipe.prep_minutes })}` : ''}
          </Text>
          <Text className="font-bebas text-3xl leading-tight text-foreground mt-1 mb-3">{label}</Text>

          {/* Foto (si TheMealDB encuentra el plato) */}
          {photoUrl && (
            <Image
              source={{ uri: photoUrl }}
              style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginBottom: 16 }}
              contentFit="cover"
              transition={200}
            />
          )}

          {/* Porciones — escala las cantidades */}
          <View className="flex-row items-center justify-between border-t border-border py-3">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t('pantryPlan.servings')}
            </Text>
            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={() => setServings((s) => Math.max(1, s - 1))}
                disabled={servings <= 1}
                hitSlop={10}
                className={`h-8 w-8 items-center justify-center rounded-lg border ${servings <= 1 ? 'border-border' : 'border-lime-400/40 active:bg-lime-400/10'}`}
                accessibilityRole="button"
                accessibilityLabel="-"
              >
                <Text className={`font-bebas text-lg leading-none ${servings <= 1 ? 'text-muted-foreground' : 'text-lime-400'}`}>−</Text>
              </Pressable>
              <Text className="font-bebas text-2xl leading-none text-foreground min-w-[24px] text-center">{servings}</Text>
              <Pressable
                onPress={() => setServings((s) => Math.min(MAX_SERVINGS, s + 1))}
                disabled={servings >= MAX_SERVINGS}
                hitSlop={10}
                className={`h-8 w-8 items-center justify-center rounded-lg border ${servings >= MAX_SERVINGS ? 'border-border' : 'border-lime-400/40 active:bg-lime-400/10'}`}
                accessibilityRole="button"
                accessibilityLabel="+"
              >
                <Text className={`font-bebas text-lg leading-none ${servings >= MAX_SERVINGS ? 'text-muted-foreground' : 'text-lime-400'}`}>+</Text>
              </Pressable>
            </View>
          </View>

          {/* Ingredientes — tally + filas con cantidad escalada */}
          {recipe.ingredients.length > 0 && (
            <>
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 mt-2">
                {t('pantryPlan.ingredients')}
                {' · '}
                <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-400">
                  {haveCount} {t('pantryPlan.haveIt')}
                </Text>
                {buyCount > 0 && (
                  <>
                    {' · '}
                    <Text className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                      {buyCount} {t('pantryPlan.toBuy')}
                    </Text>
                  </>
                )}
              </Text>
              <View className="mb-5">
                {recipe.ingredients.map((ing, i) => (
                  <View key={`${ing.name_normalized}-${i}`} className="flex-row items-center justify-between border-b border-border py-2.5">
                    <View className="flex-1 flex-row items-center gap-2 pr-2">
                      <Text className="font-sans text-sm text-foreground shrink" numberOfLines={1}>
                        {ing.name}
                      </Text>
                      {ing.qty != null && (
                        <Text className="font-mono text-xs text-muted-foreground">
                          {scaleQty(ing.qty, factor)} {ing.unit ?? ''}
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
            </>
          )}

          {/* Pasos */}
          {recipe.steps.length > 0 && (
            <>
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                {t('pantryPlan.steps')}
              </Text>
              <View>
                {recipe.steps.map((step, i) => (
                  <View key={i} className="flex-row gap-3 py-1.5">
                    <Text className="font-bebas text-base text-lime-400 w-5">{i + 1}</Text>
                    <Text className="font-sans text-sm text-foreground flex-1">{step}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
