/**
 * Piezas puras del registro de comidas que web y móvil tenían copiadas
 * (`meal-logger-shared.ts` en cada app, #470 / #477): tipos, opciones de tipo
 * de comida, el tipo «semilla» según la hora y lo último que eligió el usuario,
 * la migración de comidas antiguas y los totales.
 *
 * Aquí no hay React ni DOM. Lo que depende de la plataforma (comprimir con
 * canvas en web, `ImageAsset` en móvil) se queda en cada app.
 */
import { localHour } from '../dateUtils'
import { storage } from '../../platform'
import { migrateLegacyFood } from '../macro-calc'
import type {
  FoodItem, NutritionEntry, MealType,
  QualityScore, QualityBreakdown, QualitySuggestion,
} from '../../types'

export const MAX_PHOTOS = 5

export type Step = 'capture' | 'analyzing' | 'review' | 'saving' | 'success'
export type MacroField = 'calories' | 'protein' | 'carbs' | 'fat'

export interface MealTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface AnalysisQuality {
  score: QualityScore
  breakdown: QualityBreakdown
  message: string
  suggestion: QualitySuggestion | null
}

export interface MealOption { id: MealType; labelKey: string; icon: string }

export const MEAL_OPTIONS: readonly MealOption[] = [
  { id: 'desayuno', labelKey: 'meal.desayuno', icon: '☀️' },
  { id: 'almuerzo', labelKey: 'meal.almuerzo', icon: '🍽️' },
  { id: 'cena', labelKey: 'meal.cena', icon: '🌙' },
  { id: 'snack', labelKey: 'meal.snack', icon: '🍎' },
]

/** Tipo de comida por la hora, en la zona horaria configurada del usuario. */
export function getDefaultMealType(): MealType {
  const hour = localHour()
  if (hour < 10) return 'desayuno'
  if (hour < 15) return 'almuerzo'
  if (hour < 18) return 'snack'
  return 'cena'
}

const LS_LAST_MEAL_TYPE = 'calistenia_last_meal_type'

/** Último tipo de comida que registró el usuario, validado contra `MEAL_OPTIONS`. */
export function getLastMealType(): MealType | null {
  try {
    const v = storage.getItem(LS_LAST_MEAL_TYPE) as MealType | null
    return v && MEAL_OPTIONS.some(o => o.id === v) ? v : null
  } catch {
    return null
  }
}

/** Recuerda la elección para que el selector la conserve la próxima vez. */
export function setLastMealType(mealType: MealType): void {
  try { storage.setItem(LS_LAST_MEAL_TYPE, mealType) } catch { /* best-effort */ }
}

/** Lo último que usó el usuario y, si no hay, la heurística por hora. */
export function getSeedMealType(): MealType {
  return getLastMealType() ?? getDefaultMealType()
}

/**
 * Migra al vuelo las comidas antiguas (sin `baseCal100`) que llegan de la IA,
 * de una entrada guardada o de un job en background.
 */
export function normalizeFoods(foods: NutritionEntry['foods'] | FoodItem[]): FoodItem[] {
  return (foods || []).map(f => {
    if (!('baseCal100' in f) || !(f as FoodItem).baseCal100) {
      return migrateLegacyFood(f as Parameters<typeof migrateLegacyFood>[0])
    }
    return f as FoodItem
  })
}

/** Totales de calorías y macros de una lista de comidas (ignora valores no numéricos). */
export function sumFoodTotals(foods: ReadonlyArray<Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fat'>>): MealTotals {
  return foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fat: acc.fat + (Number(f.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}
