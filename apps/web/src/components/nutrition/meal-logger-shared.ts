/**
 * Tipos, constantes y helpers puros del registro de comidas web (#477).
 *
 * Espejo de `apps/mobile/src/components/nutrition/meal-logger-shared.ts` (#470):
 * aquí no hay React ni estado, solo lo que la máquina de estados y los pasos
 * necesitan compartir. Lo específico del DOM (comprimir con canvas) vive aquí
 * porque es web-only y sigue siendo una función pura.
 */
import { localHour } from '@calistenia/core/lib/dateUtils'
import { storage } from '@calistenia/core/platform'
import { migrateLegacyFood } from '@calistenia/core/lib/macro-calc'
import type {
  FoodItem, NutritionEntry, DailyTotals, NutritionGoal, MealType,
  QualityScore, QualityBreakdown, QualitySuggestion,
} from '@calistenia/core/types'

export const MAX_PHOTOS = 5

export type Step = 'capture' | 'analyzing' | 'review' | 'saving' | 'success'
export type CaptureSubView = 'main' | 'repeatMeal' | 'templates'
export type MacroField = 'calories' | 'protein' | 'carbs' | 'fat'
export type EditingMacro = { index: number; field: keyof FoodItem } | null

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

export interface AnalysisResult {
  foods: FoodItem[]
  meal_description?: string
  quality?: AnalysisQuality
}

export interface MealLoggerContentProps {
  onAnalyze: (imageFiles: File[], mealType: string, description?: string, eatenHour?: number) => Promise<AnalysisResult>
  onSave: (entry: Omit<NutritionEntry, 'id' | 'user'>, photoFiles?: File[]) => Promise<NutritionEntry | void>
  userId: string | null
  dailyTotals: DailyTotals
  goals: NutritionGoal | null
  getRecentEntries: () => Promise<NutritionEntry[]>
  /** Called after successful save (e.g. to navigate away or close modal) */
  onSaveSuccess?: () => void
  /** F4 (#173): tras guardar con id de servidor, dispara el match de despensa. */
  onSaved?: (entryId: string, foods: FoodItem[]) => void
  /** Send current analysis to background processing */
  onSendToBackground?: (imageFiles: File[], mealType: string, description?: string) => void
  /** Pre-populated analysis from a completed background job */
  initialAnalysis?: AnalysisResult | null
}

export const MEAL_OPTIONS: { id: MealType; labelKey: string; icon: string }[] = [
  { id: 'desayuno', labelKey: 'meal.desayuno', icon: '☀️' },
  { id: 'almuerzo', labelKey: 'meal.almuerzo', icon: '🍽️' },
  { id: 'cena', labelKey: 'meal.cena', icon: '🌙' },
  { id: 'snack', labelKey: 'meal.snack', icon: '🍎' },
]

/** Auto-detect meal type based on current hour */
export function getDefaultMealType(): MealType {
  const hour = localHour()
  if (hour < 10) return 'desayuno'
  if (hour < 15) return 'almuerzo'
  if (hour < 18) return 'snack'
  return 'cena'
}

const LS_LAST_MEAL_TYPE = 'calistenia_last_meal_type'

/** Prefer the user's last-used meal type so their choice sticks between logs. */
export function getSeedMealType(): MealType {
  try {
    const v = storage.getItem(LS_LAST_MEAL_TYPE) as MealType | null
    if (v && MEAL_OPTIONS.some(o => o.id === v)) return v
  } catch { /* ignore */ }
  return getDefaultMealType()
}

export function setLastMealType(mealType: MealType): void {
  try { storage.setItem(LS_LAST_MEAL_TYPE, mealType) } catch { /* best-effort */ }
}

/** Migra al vuelo las comidas antiguas (sin `baseCal100`) que llegan de la IA,
 *  de una entrada guardada o de un job en background. */
export function normalizeFoods(foods: NutritionEntry['foods'] | FoodItem[]): FoodItem[] {
  return (foods || []).map(f => {
    if (!('baseCal100' in f) || !(f as FoodItem).baseCal100) {
      return migrateLegacyFood(f as any)
    }
    return f as FoodItem
  })
}

export function sumFoodTotals(foods: FoodItem[]): MealTotals {
  return foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fat: acc.fat + (Number(f.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

/** Compress image client-side to max 1536px (higher res = better AI food detection) */
export function compressImage(file: File, maxSize = 1536): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= maxSize && height <= maxSize) {
        resolve(file)
        return
      }
      const ratio = Math.min(maxSize / width, maxSize / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        0.85
      )
    }
    img.src = url
  })
}
