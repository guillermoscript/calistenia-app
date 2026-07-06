/**
 * Shared types, constants and pure helpers for the MealLogger feature.
 * No React / component dependencies — safe to import from the hook, steps and views.
 */
import { migrateLegacyFood } from '@calistenia/core/lib/macro-calc'
import { localHour } from '@calistenia/core/lib/dateUtils'
import { storage } from '@calistenia/core/platform'
import type {
  FoodItem,
  NutritionEntry,
  DailyTotals,
  NutritionGoal,
  MealType,
  QualityScore,
  QualityBreakdown,
  QualitySuggestion,
} from '@calistenia/core/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImageAsset {
  uri: string
  mimeType?: string
  fileName?: string
}

export type Step = 'capture' | 'analyzing' | 'review' | 'saving' | 'success'
export type CaptureSubView = 'main' | 'repeatMeal'
export type MacroField = 'calories' | 'protein' | 'carbs' | 'fat'
export type EditingMacro = { index: number; field: MacroField } | null

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

export interface MealLoggerSheetProps {
  visible: boolean
  onClose: () => void
  /** When set, auto-triggers camera picker ('camera') or focuses text input ('text') on open */
  initialMode?: 'camera' | 'text'
  onAnalyze: (
    images: ImageAsset[],
    mealType: string,
    description?: string,
    /** Hour (0–23) the food was eaten — fed to the AI for timing quality. */
    eatenHour?: number,
  ) => Promise<{
    foods: FoodItem[]
    meal_description?: string
    quality?: AnalysisQuality
  }>
  onSave: (
    entry: Omit<NutritionEntry, 'id' | 'user'>,
    photoUris?: string[],
  ) => Promise<string | void>
  /** F4: entry guardado con éxito (id de servidor, no edit) — dispara match de despensa. */
  onSaved?: (entryId: string, foods: FoodItem[]) => void
  userId: string | null
  dailyTotals: DailyTotals
  goals: NutritionGoal | null
  getRecentEntries: (limit?: number) => Promise<NutritionEntry[]>
  /** When set, the sheet opens straight to the review step pre-filled with this entry's foods for editing. */
  editEntry?: NutritionEntry | null
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_PHOTOS = 5

export const MEAL_OPTIONS = [
  { id: 'desayuno' as MealType, labelKey: 'meal.desayuno', icon: '☀️' },
  { id: 'almuerzo' as MealType, labelKey: 'meal.almuerzo', icon: '🍽️' },
  { id: 'cena' as MealType, labelKey: 'meal.cena', icon: '🌙' },
  { id: 'snack' as MealType, labelKey: 'meal.snack', icon: '🍎' },
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Hour-based default meal type, in the user's configured timezone (parity with web). */
export function getDefaultMealType(): MealType {
  const h = localHour()
  if (h < 10) return 'desayuno'
  if (h < 15) return 'almuerzo'
  if (h < 18) return 'snack'
  return 'cena'
}

const LS_LAST_MEAL_TYPE = 'calistenia_last_meal_type'
const VALID_MEAL_TYPES = MEAL_OPTIONS.map((o) => o.id) as MealType[]

/** Last meal type the user logged, if any (validated against MEAL_OPTIONS). */
export function getLastMealType(): MealType | null {
  try {
    const v = storage.getItem(LS_LAST_MEAL_TYPE) as MealType | null
    return v && VALID_MEAL_TYPES.includes(v) ? v : null
  } catch {
    return null
  }
}

/** Remember the user's meal-type choice so the picker keeps it on the next open. */
export function setLastMealType(mealType: MealType): void {
  try {
    storage.setItem(LS_LAST_MEAL_TYPE, mealType)
  } catch {
    /* best-effort */
  }
}

/** Bring an entry's foods up to the current FoodItem shape, migrating legacy records. */
export function normalizeEntryFoods(foods: NutritionEntry['foods']): FoodItem[] {
  return foods.map((f) =>
    !('baseCal100' in f) || !(f as FoodItem).baseCal100
      ? migrateLegacyFood(f as any)
      : (f as FoodItem),
  )
}
