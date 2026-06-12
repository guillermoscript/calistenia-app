/**
 * Shared types, constants and pure helpers for the MealLogger feature.
 * No React / component dependencies — safe to import from the hook, steps and views.
 */
import { migrateLegacyFood } from '@calistenia/core/lib/macro-calc'
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
  ) => Promise<{
    foods: FoodItem[]
    meal_description?: string
    quality?: AnalysisQuality
  }>
  onSave: (
    entry: Omit<NutritionEntry, 'id' | 'user'>,
    photoUris?: string[],
  ) => Promise<void>
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

export function getDefaultMealType(): MealType {
  const h = new Date().getHours()
  if (h < 10) return 'desayuno'
  if (h < 15) return 'almuerzo'
  if (h < 18) return 'snack'
  return 'cena'
}

/** Bring an entry's foods up to the current FoodItem shape, migrating legacy records. */
export function normalizeEntryFoods(foods: NutritionEntry['foods']): FoodItem[] {
  return foods.map((f) =>
    !('baseCal100' in f) || !(f as FoodItem).baseCal100
      ? migrateLegacyFood(f as any)
      : (f as FoodItem),
  )
}
