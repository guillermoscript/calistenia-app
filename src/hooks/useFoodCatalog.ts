import { useCallback } from 'react'
import { pb } from '../lib/pocketbase'
import type { FoodItem } from '../types'
import { migrateLegacyFood } from '../lib/macro-calc'
import { AI_API_URL } from '../lib/ai-api'
import { searchOFF, mapOFFToFoodItem, isIncompleteFood } from '../lib/openfoodfacts'

// ── Relation helpers ───────────────────────────────────────────────────────

/** Find or create a food_categories record, returns its PB id */
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

/** Find or create food_tags records, returns array of PB ids */
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
        // skip this tag
      }
    }
  }
  return ids
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useFoodCatalog() {
  /** Save a food to the shared catalog, skipping duplicates by normalized name */
  const saveFoodToCatalog = useCallback(async (food: FoodItem): Promise<void> => {
    const normalized = food.name.toLowerCase().trim()
    if (!normalized) return
    try {
      await pb.collection('foods').getFirstListItem(
        pb.filter('name = {:name}', { name: normalized })
      )
      // Already exists — skip
    } catch {
      // Not found — resolve relations then create
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

  /** Ask AI for nutritional values by food name, then save to catalog */
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

  /** Complete a food item that has incomplete nutritional data using AI */
  const completeWithAI = useCallback(async (food: FoodItem): Promise<FoodItem> => {
    try {
      const completed = await lookupWithAI(food.name)
      return completed
    } catch {
      // AI failed — return original incomplete food
      return food
    }
  }, [lookupWithAI])

  /** OFF food item with optional image URL for UI rendering */
  type OFFResultItem = FoodItem & { imageUrl?: string }

  /** Search foods across PB catalog + Open Food Facts in a single call */
  const searchFoods = useCallback(async (query: string): Promise<{
    catalog: FoodItem[]
    off: OFFResultItem[]
  }> => {
    if (query.trim().length < 2) return { catalog: [], off: [] }
    const q = query.toLowerCase().trim()
    let catalog: FoodItem[] = []

    // Search PocketBase catalog
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
      // PB not available — catalog stays empty, OFF will fill in
    }

    // Search Open Food Facts (returns items with imageUrl for UI)
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

        // Split complete vs incomplete
        const complete = mapped.filter(f => !isIncompleteFood(f))
        const incomplete = mapped.filter(f => isIncompleteFood(f))

        // Cache complete OFF results in PB (fire-and-forget)
        for (const food of complete) {
          saveFoodToCatalog({ ...food, source: 'openfoodfacts' } as any).catch(() => {})
        }

        // Complete incomplete foods with AI in background (fire-and-forget, max 2)
        for (const food of incomplete.slice(0, 2)) {
          completeWithAI(food).catch(() => {})
        }

        off = mapped
      } catch {
        // OFF search failed
      }
    }

    return { catalog: catalog.slice(0, 10), off }
  }, [saveFoodToCatalog, completeWithAI])

  return { searchFoods, saveFoodToCatalog, lookupWithAI, completeWithAI }
}
