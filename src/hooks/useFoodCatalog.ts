import { useCallback } from 'react'
import { pb } from '../lib/pocketbase'
import type { FoodItem } from '../types'
import { migrateLegacyFood } from '../lib/macro-calc'
import { AI_API_URL } from '../lib/ai-api'
import { searchCommonFoods } from '../data/common-foods'

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
  /** Search foods by name or by related tag slugs */
  const searchFoods = useCallback(async (query: string): Promise<FoodItem[]> => {
    if (query.trim().length < 2) return []
    const q = query.toLowerCase().trim()
    try {
      const res = await pb.collection('foods').getList(1, 10, {
        // name is the normalized field; also search through related tag slugs
        filter: pb.filter('name ~ {:q} || tags.slug ~ {:q}', { q }),
        sort: 'name_display',
        expand: 'category,tags',
      })
      const pbFoods = res.items.map((r: any) => {
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
        // Use base100 from DB if available
        if (r.base_cal_100) food.baseCal100 = r.base_cal_100
        if (r.base_prot_100) food.baseProt100 = r.base_prot_100
        if (r.base_carbs_100) food.baseCarbs100 = r.base_carbs_100
        if (r.base_fat_100) food.baseFat100 = r.base_fat_100
        return food
      })
      // Merge with local common foods (avoid duplicates by name)
      const pbNames = new Set(pbFoods.map((f: FoodItem) => f.name.toLowerCase()))
      const localFoods = searchCommonFoods(query).filter(f => !pbNames.has(f.name.toLowerCase()))
      return [...pbFoods, ...localFoods].slice(0, 15)
    } catch {
      // PB not available — fall back to local common foods database
      return searchCommonFoods(query)
    }
  }, [])

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
          source: 'ai',
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

  return { searchFoods, saveFoodToCatalog, lookupWithAI }
}
