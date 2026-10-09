/**
 * Shared types, constants and pure helpers for the MealLogger feature.
 * No React / component dependencies — safe to import from the hook, steps and views.
 */
import type { AnalysisQuality, MacroField } from '@calistenia/core/lib/meal-logger/shared'
import { normalizeFoods } from '@calistenia/core/lib/meal-logger/shared'
import type { FoodItem, NutritionEntry, DailyTotals, NutritionGoal } from '@calistenia/core/types'

// Las piezas puras viven en core y las comparte el registro de web.
export {
  MAX_PHOTOS, MEAL_OPTIONS, getDefaultMealType, getLastMealType, getSeedMealType, setLastMealType,
  sumFoodTotals,
} from '@calistenia/core/lib/meal-logger/shared'
export type {
  Step, MacroField, MealTotals, AnalysisQuality,
} from '@calistenia/core/lib/meal-logger/shared'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImageAsset {
  uri: string
  mimeType?: string
  fileName?: string
}

export type CaptureSubView = 'main' | 'repeatMeal'
export type EditingMacro = { index: number; field: MacroField } | null

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Bring an entry's foods up to the current FoodItem shape, migrating legacy records. */
export const normalizeEntryFoods = normalizeFoods
