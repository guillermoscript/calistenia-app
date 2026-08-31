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

/**
 * Métricas que importamos del hub (Fase 1 = solo lectura).
 *
 * Lista CERRADA por la política de acceso mínimo a datos de Health Connect:
 * cada tipo debe corresponder a un permiso declarado en apps/mobile/app.json y
 * tener una función visible detrás. Ampliarla implica ampliar el manifiesto y
 * volver a declararlo en Play Console.
 */
export type HealthDataType =
  | 'sleep'
  | 'weight'
  | 'body_fat'

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

/**
 * Resumen diario — espejo de la colección PB `daily_health_cache`.
 * La colección conserva columnas que ya no se escriben (active_calories,
 * resting_hr, hrv_ms, vo2max, total_calories): sus permisos se retiraron por
 * la política de acceso mínimo de Play y los datos viejos se dejan sin borrar.
 */
export interface DailyHealthSummary {
  id?: string
  /** YYYY-MM-DD local */
  date: string
  /** Legado: READ_STEPS se retiró en v1.12.3 (tercer rechazo); solo días viejos. */
  steps?: number
  sleep_minutes?: number
  sleep_quality?: number
  weight_kg?: number
  body_fat_pct?: number
}

/**
 * FC medida por el reloj, adjunta a una sesión (sessions/cardio/circuit).
 * Legado: READ_HEART_RATE se retiró en v1.12.3 (tercer rechazo de Play);
 * hr_avg/hr_max ya no se escriben — se muestran si la sesión los tenía.
 */
export interface SessionHealthMetrics {
  hr_avg?: number
  hr_max?: number
  /** Legado: dejó de escribirse en v1.12.1 (sin READ_ACTIVE_CALORIES_BURNED); se muestra si existe. */
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
