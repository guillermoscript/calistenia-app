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
  /** Racha ACTIVA (termina hoy o ayer) de días con score de calidad A/B.
   *  Misma racha que los badges `streak_3/7/30` de `badge-definitions.ts`:
   *  `nutrition_coach_insights.streaks.currentGood`, no se reimplementa aquí. */
  mealStreak: number
  /** true si el insight de HOY ya cuenta como A/B. Mismo rol que `streakToday`
   *  en el snapshot de entrenamiento: distingue racha "viva" de "en riesgo"
   *  (`mealStreak` no baja hasta que se confirme un día malo, pero el color
   *  se apaga si hoy aún no está confirmado como bueno). */
  mealStreakToday: boolean
  /** ml de agua registrados hoy (`water_entries`, ver `useWater`). */
  waterMl: number
  /** Meta diaria de agua en ml (`settings.water_goal`, default 2500). */
  waterGoalMl: number
  lang: 'es' | 'en'
  /** IANA tz usada por el escritor para calcular `date`. El widget recalcula
   *  "hoy" en esta misma tz para evitar mismatch entre proceso app y headless. */
  tz: string
}

export const NUTRITION_WIDGET_SNAPSHOT_KEY = 'nutrition_widget_snapshot'

/**
 * Rollover de día: si el snapshot es de un día pasado (`s.date < today`), las
 * metas siguen vigentes pero el consumo (calorías/macros y agua) se reinicia
 * a 0. Devuelve un snapshot
 * fresco para hoy sin necesidad de abrir la app. El poll de `updatePeriodMillis`
 * recalcula "today" en la tz del escritor y, tras medianoche, renderiza el día
 * nuevo vacío en vez de quedarse pegado en "ABRE LA APP".
 *
 * Fechas futuras (`s.date > today`, p.ej. desfase de reloj/tz) se dejan intactas
 * para no borrar datos legítimos. Puro: testeable sin react-native.
 *
 * `mealStreak` NO se reinicia aquí: es una racha, no un consumo diario, y solo
 * cambia cuando la app calcula el score del nuevo día. `mealStreakToday` sí se
 * apaga en el rollover — el "hoy" bueno de ayer ya no aplica al nuevo día hasta
 * que se confirme.
 */
export function rolloverSnapshot(
  s: NutritionWidgetSnapshot | null,
  today: string,
): NutritionWidgetSnapshot | null {
  if (!s) return null
  if (s.date >= today) return s
  return { ...s, date: today, calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0, mealStreakToday: false }
}
