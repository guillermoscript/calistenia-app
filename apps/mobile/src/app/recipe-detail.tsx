/**
 * Detalle de receta de un plan pantry-aware (#171).
 * La receta viaja serializada en params (los planes del día no se persisten);
 * la foto se busca en TheMealDB (gratis) con el photo_query en inglés del LLM.
 * El stepper de porciones escala las cantidades de los ingredientes.
 *
 * Ruta: /recipe-detail?label=...&recipe=<json>
 */
import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { usePantryItems } from '@calistenia/core/hooks/usePantry'
import { computeRecipeCost, formatMoney, roundQty } from '@calistenia/core/lib/shopping'
import type { Recipe } from '@calistenia/core/types'

const MUTED = 'hsl(0 0% 55%)'
const MAX_SERVINGS = 8

// Cache in-module: misma query no se re-busca al navegar entre recetas.
const mediaCache = new Map<string, MealMedia | null>()

type MealDbHit = { strMeal?: string; strMealThumb?: string; strYoutube?: string | null; strSource?: string | null }
type MealMedia = { thumb: string; youtube: string | null; source: string | null }

async function mealDbSearch(q: string): Promise<MealDbHit[]> {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`${res.status}`)
  const data = (await res.json()) as { meals?: MealDbHit[] | null }
  return data.meals ?? []
}

const sameWord = (a: string, b: string) => a === b || a === `${b}s` || `${a}s` === b

/**
 * Solo acepta una foto si el NOMBRE del plato coincide de verdad con la query:
 * todas las palabras de la query presentes y máx 1 palabra extra (0 si la query
 * es de una sola palabra). Una foto de otro plato es peor que ninguna foto.
 */
function pickPreciseMeal(query: string, candidates: MealDbHit[]): MealMedia | null {
  const qwords = query.split(/\s+/).filter((w) => w.length >= 3)
  if (!qwords.length) return null
  const maxExtras = qwords.length === 1 ? 0 : 1
  let best: { meal: MealDbHit; extras: number } | null = null
  for (const m of candidates) {
    if (!m.strMealThumb) continue
    const nwords = (m.strMeal ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    if (!nwords.length) continue
    if (!qwords.every((w) => nwords.some((n) => sameWord(n, w)))) continue
    const extras = nwords.filter((n) => !qwords.some((w) => sameWord(n, w))).length
    if (extras <= maxExtras && (!best || extras < best.extras)) best = { meal: m, extras }
  }
  if (!best) return null
  return {
    thumb: best.meal.strMealThumb!,
    youtube: best.meal.strYoutube || null,
    source: best.meal.strSource || null,
  }
}

async function fetchMealMedia(query: string): Promise<MealMedia | null> {
  const key = query.trim().toLowerCase()
  if (!key) return null
  if (mediaCache.has(key)) return mediaCache.get(key) ?? null
  try {
    // search.php matchea por nombre de plato; buscamos la query completa y cada
    // palabra para juntar candidatos, y filtramos con matching estricto.
    const seen = new Map<string, MealDbHit>()
    for (const q of new Set([key, ...key.split(/\s+/).filter((w) => w.length >= 3)])) {
      for (const m of await mealDbSearch(q)) seen.set(m.strMealThumb ?? m.strMeal ?? '', m)
    }
    const media = pickPreciseMeal(key, [...seen.values()])
    mediaCache.set(key, media)
    return media
  } catch {
    // Sin foto no pasa nada — la receta es el contenido.
    mediaCache.set(key, null)
    return null
  }
}

// 3 × 1.5 → "4.5", 100 × 2 → "200" — sin colas de float (roundQty de core).
function scaleQty(qty: number, factor: number): string {
  return String(roundQty(qty * factor))
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

  const authUser = useAuthUser()
  const { data: pantryItems = [] } = usePantryItems(authUser?.id ?? null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const cost = useMemo(
    () => (recipe ? computeRecipeCost(recipe.ingredients, pantryItems, baseServings) : null),
    [recipe, pantryItems, baseServings],
  )
  const hasAnyPrice = cost != null && cost.breakdown.some((b) => b.source !== 'sin_precio')

  const [media, setMedia] = useState<MealMedia | null>(null)
  useEffect(() => {
    const query = recipe?.photo_query ?? label
    if (!query) return
    let active = true
    fetchMealMedia(query).then((m) => {
      if (active) setMedia(m)
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

          {/* Foto + video/fuente (solo con match preciso en TheMealDB) */}
          {media && (
            <View className="mb-4">
              <Image
                source={{ uri: media.thumb }}
                style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }}
                contentFit="cover"
                transition={200}
              />
              {(media.youtube || media.source) && (
                <View className="flex-row items-center gap-5 mt-2">
                  {media.youtube && (
                    <Pressable
                      onPress={() => Linking.openURL(media.youtube!).catch(() => {})}
                      hitSlop={8}
                      accessibilityRole="link"
                    >
                      <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-400">
                        ▶ {t('pantryPlan.watchVideo')}
                      </Text>
                    </Pressable>
                  )}
                  {media.source && (
                    <Pressable
                      onPress={() => Linking.openURL(media.source!).catch(() => {})}
                      hitSlop={8}
                      accessibilityRole="link"
                    >
                      <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t('pantryPlan.source')} ↗
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
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

          {hasAnyPrice && (
            <Pressable onPress={() => setShowBreakdown((v) => !v)} className="border-t border-border py-3">
              <View className="flex-row items-baseline justify-between">
                <View className="flex-row items-center gap-1">
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t('shopping.costPerServing')}
                  </Text>
                  {showBreakdown ? (
                    <ChevronUp size={12} color={MUTED} />
                  ) : (
                    <ChevronDown size={12} color={MUTED} />
                  )}
                </View>
                <Text className="font-bebas text-2xl text-lime-400">
                  {cost!.hasEstimates ? '~' : ''}${formatMoney(cost!.perServing)}
                </Text>
              </View>
              {showBreakdown &&
                cost!.breakdown.map((b, i) => (
                  <View key={i} className="mt-1 flex-row justify-between">
                    <Text className="font-sans text-xs text-muted-foreground">{b.name}</Text>
                    <Text className={`font-mono text-xs ${b.source === 'sin_precio' ? 'text-muted-foreground' : b.source === 'estimada' ? 'text-amber-500' : 'text-foreground'}`}>
                      {b.cost != null ? `${b.source === 'estimada' ? '~' : ''}$${formatMoney(b.cost)}` : t('shopping.noPrice')}
                    </Text>
                  </View>
                ))}
            </Pressable>
          )}

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
