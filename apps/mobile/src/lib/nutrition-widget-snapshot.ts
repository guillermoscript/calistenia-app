/** Contrato del snapshot del widget de nutrición. Puro: testeable sin react-native. */
export interface NutritionWidgetSnapshot {
  /** YYYY-MM-DD local de la última escritura — el widget marca stale si es viejo. */
  date: string
  calories: number
  protein: number
  carbs: number
  fat: number
  calorieGoal: number
  proteinGoal: number
  carbsGoal: number
  fatGoal: number
  lang: 'es' | 'en'
  /** IANA tz usada por el escritor para calcular `date`. El widget recalcula
   *  "hoy" en esta misma tz para evitar mismatch entre proceso app y headless. */
  tz: string
}

export const NUTRITION_WIDGET_SNAPSHOT_KEY = 'nutrition_widget_snapshot'
