import type { FoodItem } from '../types'

interface OFFProduct {
  product_name_es?: string
  product_name?: string
  image_front_small_url?: string
  nutriments?: {
    'energy-kcal_100g'?: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
  }
  serving_size?: string
}

interface OFFSearchResponse {
  products: OFFProduct[]
  count: number
}

export type { OFFProduct }

export async function searchOFF(query: string, locale = 'es'): Promise<OFFProduct[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10&lc=${locale}`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return []
  const data: OFFSearchResponse = await res.json()
  return data.products || []
}

export async function getProductByBarcode(barcode: string): Promise<OFFProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 1) return null
  return data.product || null
}

/** Check if a mapped FoodItem has incomplete nutritional data */
export function isIncompleteFood(food: FoodItem): boolean {
  return food.calories === 0 && food.protein === 0 && food.carbs === 0 && food.fat === 0
}

export function mapOFFToFoodItem(product: OFFProduct): FoodItem | null {
  const name = product.product_name_es || product.product_name
  if (!name) return null

  const n = product.nutriments
  const cal100 = n?.['energy-kcal_100g'] ?? 0
  const prot100 = n?.proteins_100g ?? 0
  const carbs100 = n?.carbohydrates_100g ?? 0
  const fat100 = n?.fat_100g ?? 0

  return {
    name,
    portionAmount: 100,
    portionUnit: 'g',
    unitWeightInGrams: 100,
    calories: cal100,
    protein: prot100,
    carbs: carbs100,
    fat: fat100,
    baseCal100: cal100,
    baseProt100: prot100,
    baseCarbs100: carbs100,
    baseFat100: fat100,
    category: 'otros',
  }
}
