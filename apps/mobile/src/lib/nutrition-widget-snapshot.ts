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

/**
 * Rollover de día: si el snapshot es de un día pasado (`s.date < today`), las
 * metas siguen vigentes pero el consumo se reinicia a 0. Devuelve un snapshot
 * fresco para hoy sin necesidad de abrir la app. El poll de `updatePeriodMillis`
 * recalcula "today" en la tz del escritor y, tras medianoche, renderiza el día
 * nuevo vacío en vez de quedarse pegado en "ABRE LA APP".
 *
 * Fechas futuras (`s.date > today`, p.ej. desfase de reloj/tz) se dejan intactas
 * para no borrar datos legítimos. Puro: testeable sin react-native.
 */
export function rolloverSnapshot(
  s: NutritionWidgetSnapshot | null,
  today: string,
): NutritionWidgetSnapshot | null {
  if (!s) return null
  if (s.date >= today) return s
  return { ...s, date: today, calories: 0, protein: 0, carbs: 0, fat: 0 }
}
