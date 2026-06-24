/**
 * Tipos compartidos para la integración con el hub de salud del teléfono
 * (Google Health Connect en Android / Apple HealthKit en iOS), que a su vez
 * agrega datos de cualquier smartwatch conectado.
 *
 * SOLO TIPOS — sin dependencias de React Native. La implementación nativa
 * (lectura desde Health Connect) vive en apps/mobile; aquí solo viven las
 * formas de datos que comparten web y mobile (p.ej. mostrar FC en el detalle
 * de sesión, o leer daily_health_cache).
 */

/** Origen de un dato de salud. '' / undefined se trata como 'manual'. */
export type HealthSource = 'health_connect' | 'healthkit' | 'manual'

/** Métricas que importamos del hub (Fase 1 = solo lectura). */
export type HealthDataType =
  | 'steps'
  | 'active_calories'
  | 'total_calories'
  | 'heart_rate'
  | 'resting_hr'
  | 'hrv'
  | 'vo2max'
  | 'sleep'
  | 'weight'
  | 'body_fat'
  | 'distance'
  | 'exercise_session'

/** Muestra cruda normalizada — espejo de la colección PB `health_samples`. */
export interface HealthSample {
  id?: string
  source: HealthSource
  data_type: HealthDataType
  value: number | null
  unit?: string
  /** ISO datetime */
  start_time?: string
  /** ISO datetime */
  end_time?: string
  /** id del registro en el hub (clientRecordId) — para de-duplicar al re-sincronizar */
  external_id?: string
  metadata?: Record<string, unknown>
}

/** Resumen diario — espejo de la colección PB `daily_health_cache`. */
export interface DailyHealthSummary {
  id?: string
  /** YYYY-MM-DD local */
  date: string
  steps?: number
  active_calories?: number
  total_calories?: number
  resting_hr?: number
  hrv_ms?: number
  vo2max?: number
  sleep_minutes?: number
  sleep_quality?: number
  weight_kg?: number
  body_fat_pct?: number
}

/** FC/calorías medidas por el reloj, adjuntas a una sesión (sessions/cardio/circuit). */
export interface SessionHealthMetrics {
  hr_avg?: number
  hr_max?: number
  calories_actual?: number
}

/** Disponibilidad del hub en el dispositivo. */
export type HealthHubStatus =
  | 'unsupported' // plataforma sin hub (web, iPad, simulador)
  | 'unavailable' // hub no instalado (Android < 14 sin la app Health Connect)
  | 'update_required' // el proveedor del hub necesita actualización
  | 'available' // listo para pedir permisos / leer

/** Resultado de una sincronización. */
export interface HealthSyncResult {
  ok: boolean
  /** ISO datetime */
  syncedAt: string
  /** nº de muestras importadas por tipo */
  imported: Partial<Record<HealthDataType, number>>
  error?: string
}
