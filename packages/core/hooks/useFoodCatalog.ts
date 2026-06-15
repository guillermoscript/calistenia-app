import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { FoodItem } from '../types'
import { migrateLegacyFood } from '../lib/macro-calc'
import { AI_API_URL } from '../lib/ai-api'
import { searchOFF, mapOFFToFoodItem, isIncompleteFood } from '../lib/openfoodfacts'

// ── Relation helpers ───────────────────────────────────────────────────────

/** Encuentra o crea un registro food_categories, retorna su id de PB */
async function resolveCategory(slug: string): Promise<string | null> {
  if (!slug) return null
  try {
    const rec = await pb.collection('food_categories').getFirstListItem(
      pb.filter('slug = {:slug}', { slug })
    )
    return rec.id
  } catch {
    try {
      const created = await pb.collection('food_categories').create({
        slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
      })
      return created.id
    } catch {
      return null
    }
  }
}

/** Encuentra o crea registros food_tags, retorna array de ids de PB */
async function resolveTags(tags: string[]): Promise<string[]> {
  if (!tags.length) return []
  const ids: string[] = []
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim()
    if (!normalized) continue
    try {
      const rec = await pb.collection('food_tags').getFirstListItem(
        pb.filter('slug = {:slug}', { slug: normalized })
      )
      ids.push(rec.id)
    } catch {
      try {
        const created = await pb.collection('food_tags').create({
          slug: normalized,
          name: normalized,
        })
        ids.push(created.id)
      } catch {
        // ignorar este tag
      }
    }
  }
  return ids
}

// ── Tipo interno para resultados OFF con imageUrl ──────────────────────────
/** Item de OFF con URL de imagen opcional para renderizado en UI */
type OFFResultItem = FoodItem & { imageUrl?: string }

// ── QueryFn de búsqueda (reutilizable en useQuery y fetchQuery) ─────────────
/**
 * Busca alimentos en el catálogo PB y en Open Food Facts.
 * Se extrae fuera del hook para que fetchQuery pueda reutilizarla
 * sin depender del closure del hook.
 */
async function fetchFoodSearch(
  query: string,
  saveFn: (food: FoodItem) => Promise<void>,
  completeFn: (food: FoodItem) => Promise<FoodItem>,
): Promise<{ catalog: FoodItem[]; off: OFFResultItem[] }> {
  if (query.trim().length < 2) return { catalog: [], off: [] }
  const q = query.toLowerCase().trim()
  let catalog: FoodItem[] = []

  // Buscar en catálogo PocketBase
  try {
    const res = await pb.collection('foods').getList(1, 10, {
      filter: pb.filter('name ~ {:q} || tags.slug ~ {:q}', { q }),
      sort: 'name_display',
      expand: 'category,tags',
    })
    catalog = res.items.map((r: any) => {
      const food = migrateLegacyFood({
        name: r.name_display,
        portion: r.portion,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        category: r.expand?.category?.slug || undefined,
        tags: r.expand?.tags?.map((t: any) => t.slug) || [],
      })
      if (r.base_cal_100) food.baseCal100 = r.base_cal_100
      if (r.base_prot_100) food.baseProt100 = r.base_prot_100
      if (r.base_carbs_100) food.baseCarbs100 = r.base_carbs_100
      if (r.base_fat_100) food.baseFat100 = r.base_fat_100
      return food
    })
  } catch {
    // PB no disponible — catalog queda vacío, OFF complementará
  }

  // Buscar en Open Food Facts (retorna items con imageUrl para UI)
  let off: OFFResultItem[] = []
  if (q.length >= 3) {
    try {
      const offProducts = await searchOFF(query)
      const existingNames = new Set(catalog.map(f => f.name.toLowerCase()))
      const mapped = offProducts
        .map(p => {
          const food = mapOFFToFoodItem(p)
          if (!food) return null
          return { ...food, imageUrl: p.image_front_small_url } as OFFResultItem
        })
        .filter((f): f is OFFResultItem => f !== null && !existingNames.has(f.name.toLowerCase()))
        .slice(0, 5)

      // Separar completos vs incompletos
      const complete = mapped.filter(f => !isIncompleteFood(f))
      const incomplete = mapped.filter(f => isIncompleteFood(f))

      // Cachear resultados OFF completos en PB (fire-and-forget)
      for (const food of complete) {
        saveFn({ ...food, source: 'openfoodfacts' } as any).catch(() => {})
      }

      // Completar alimentos incompletos con IA en segundo plano (fire-and-forget, máx 2)
      for (const food of incomplete.slice(0, 2)) {
        completeFn(food).catch(() => {})
      }

      off = mapped
    } catch {
      // Búsqueda OFF falló
    }
  }

  return { catalog: catalog.slice(0, 10), off }
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Catálogo de alimentos con búsqueda reactiva vía TanStack Query.
 *
 * Acepta un `query` opcional para activar la búsqueda reactiva debounced (300ms).
 * El debounce se aplica sobre la string que alimenta la queryKey; la queryFn
 * nunca hace throttle interno.
 *
 * Forma pública idéntica a la versión anterior:
 *   { searchFoods, saveFoodToCatalog, lookupWithAI, completeWithAI }
 *
 * `searchFoods` sigue siendo llamable de forma imperativa (delega a fetchQuery
 * para que el resultado quede en caché); la búsqueda reactiva queda disponible
 * en los campos `data`, `isLoading` e `isError` del retorno extendido.
 */
export function useFoodCatalog(query?: string) {
  const qc = useQueryClient()

  // ── saveFoodToCatalog ────────────────────────────────────────────────────
  /** Guarda un alimento en el catálogo compartido, omitiendo duplicados por nombre normalizado */
  const saveFoodToCatalog = useCallback(async (food: FoodItem): Promise<void> => {
    const normalized = food.name.toLowerCase().trim()
    if (!normalized) return
    try {
      await pb.collection('foods').getFirstListItem(
        pb.filter('name = {:name}', { name: normalized })
      )
      // Ya existe — omitir
    } catch {
      // No encontrado — resolver relaciones y crear
      try {
        const [categoryId, tagIds] = await Promise.all([
          food.category ? resolveCategory(food.category) : Promise.resolve(null),
          food.tags?.length ? resolveTags(food.tags) : Promise.resolve([]),
        ])
        await pb.collection('foods').create({
          name: normalized,
          name_display: food.name,
          portion: `${food.portionAmount}${food.portionUnit}`,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          base_cal_100: food.baseCal100 || 0,
          base_prot_100: food.baseProt100 || 0,
          base_carbs_100: food.baseCarbs100 || 0,
          base_fat_100: food.baseFat100 || 0,
          ...(categoryId && { category: categoryId }),
          ...(tagIds.length && { tags: tagIds }),
          source: (food as any).source || 'ai',
        })
      } catch (e) {
        console.warn('Failed to save food to catalog:', e)
      }
    }
  }, [])

  // ── lookupWithAI ─────────────────────────────────────────────────────────
  /** Consulta la IA por valores nutricionales del alimento, luego guarda en catálogo */
  const lookupWithAI = useCallback(async (foodName: string): Promise<FoodItem> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (pb.authStore.token) {
      headers['Authorization'] = `Bearer ${pb.authStore.token}`
    }
    const res = await fetch(`${AI_API_URL}/api/lookup-food`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ food_name: foodName }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Lookup failed: ${res.status}`)
    }
    const data = await res.json()
    const food = migrateLegacyFood({
      name: data.food?.name || foodName,
      portion: data.food?.portion || '100g',
      calories: data.food?.calories || 0,
      protein: data.food?.protein || 0,
      carbs: data.food?.carbs || 0,
      fat: data.food?.fat || 0,
      category: data.food?.category || undefined,
      tags: data.food?.tags || [],
    })
    await saveFoodToCatalog(food)
    return food
  }, [saveFoodToCatalog])

  // ── completeWithAI ───────────────────────────────────────────────────────
  /** Completa un alimento con datos nutricionales incompletos usando IA */
  const completeWithAI = useCallback(async (food: FoodItem): Promise<FoodItem> => {
    try {
      const completed = await lookupWithAI(food.name)
      return completed
    } catch {
      // IA falló — retornar alimento incompleto original
      return food
    }
  }, [lookupWithAI])

  // ── Debounce del query reactivo (300ms) ──────────────────────────────────
  const [debouncedQuery, setDebouncedQuery] = useState(query ?? '')

  useEffect(() => {
    const q = query ?? ''
    const timer = setTimeout(() => setDebouncedQuery(q), 300)
    return () => clearTimeout(timer)
  }, [query])

  // ── useQuery para búsqueda reactiva ─────────────────────────────────────
  // El debounce se aplica sobre debouncedQuery (la key); la queryFn no hace throttle.
  // enabled: solo si hay al menos 2 caracteres tras el debounce.
  const searchQuery = useQuery({
    queryKey: qk.foods.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000, // resultados de búsqueda válidos 1 min
    queryFn: () => fetchFoodSearch(debouncedQuery, saveFoodToCatalog, completeWithAI),
  })

  // ── searchFoods imperativo (forma pública idéntica) ─────────────────────
  /**
   * Busca alimentos de forma imperativa. Delega a fetchQuery para que el
   * resultado quede en caché de TanStack Query y sea reutilizado por la
   * ruta reactiva si coincide la key.
   */
  const searchFoods = useCallback(
    async (q: string): Promise<{ catalog: FoodItem[]; off: OFFResultItem[] }> => {
      if (q.trim().length < 2) return { catalog: [], off: [] }
      return qc.fetchQuery({
        queryKey: qk.foods.search(q.toLowerCase().trim()),
        staleTime: 60_000,
        queryFn: () => fetchFoodSearch(q, saveFoodToCatalog, completeWithAI),
      })
    },
    [qc, saveFoodToCatalog, completeWithAI],
  )

  return {
    // Forma pública idéntica — todos los callers existentes siguen funcionando
    searchFoods,
    saveFoodToCatalog,
    lookupWithAI,
    completeWithAI,
    // Campos reactivos adicionales (útiles cuando se pasa `query` al hook)
    data: searchQuery.data,
    isLoading: searchQuery.isLoading,
    isError: searchQuery.isError,
  }
}
