/**
 * monthActivity.types — las formas de datos del calendario, SIN runtime de
 * cliente.
 *
 * Viven aparte de `monthActivity.ts` porque `insightContext.ts` (compartido
 * con mcp-server) necesita el tipo `MonthActivity`, y `monthActivity.ts`
 * importa `./pocketbase` (el singleton del cliente) y `./dateUtils` (que
 * arrastra i18next) para su `fetchMonthActivity`. Un `import type` no emite
 * nada en runtime, pero TypeScript sí carga el módulo: el typecheck de
 * mcp-server acababa exigiendo i18next, que no es dependencia suya.
 *
 * Regla: aquí sólo declaraciones de tipos y funciones puras. Nada que importe
 * un singleton, i18next ni el runtime de la app.
 */

import type { CardioSession, SleepEntry } from '../types'

// Resumen de nutrición agregado por día (un cuadro en el calendario).
export interface DayNutritionSummary {
  meals: number
  calories: number
}

// Resumen de agua agregado por día.
export interface DayWaterSummary {
  totalMl: number
}

// Sesión de circuito/HIIT con solo los campos que el calendario necesita.
export interface CircuitSessionLite {
  id: string
  circuit_name?: unknown
  mode?: 'circuit' | 'timed'
  rounds_completed?: number
  rounds_target?: number
  duration_seconds?: number
  started_at: string
  finished_at?: string
  note?: string
}

// Registro de peso corporal (forma mínima para el calendario).
export interface WeightEntryLite {
  id: string
  weight_kg: number
  date: string
  note?: string
}

// Medidas corporales (cinta métrica) — el calendario solo necesita presencia +
// fecha; cintura/cuello/cadera alimentan la señal de composición corporal de
// los insights (#227) y son opcionales por registro.
export interface BodyMeasurementLite {
  id: string
  date: string
  waist?: number
  neck?: number
  hips?: number
}

// Foto de progreso individual (id + URL servible desde PocketBase).
export interface DayPhotoEntry {
  id: string
  url: string
}

// Resumen de fotos de progreso por día (cuántas + sus URLs, para el visor).
export interface DayPhotoSummary {
  count: number
  photos: DayPhotoEntry[]
}

// Chequeo lumbar diario (forma mínima: la puntuación y la fecha).
export interface LumbarCheckLite {
  id: string
  date: string
  lumbar_score: number
}

// Todo lo que el usuario registró en un mes, agrupado por fecha local.
// Los entrenamientos NO se incluyen aquí: viven en WorkoutContext (progress)
// y se mezclan en el componente.
export interface MonthActivity {
  cardio: CardioSession[]
  circuits: CircuitSessionLite[]
  nutritionByDate: Record<string, DayNutritionSummary>
  waterByDate: Record<string, DayWaterSummary>
  sleepByDate: Record<string, SleepEntry>
  weightByDate: Record<string, WeightEntryLite>
  measurementByDate: Record<string, BodyMeasurementLite>
  photosByDate: Record<string, DayPhotoSummary>
  lumbarByDate: Record<string, LumbarCheckLite>
}

export function emptyMonthActivity(): MonthActivity {
  return {
    cardio: [],
    circuits: [],
    nutritionByDate: {},
    waterByDate: {},
    sleepByDate: {},
    weightByDate: {},
    measurementByDate: {},
    photosByDate: {},
    lumbarByDate: {},
  }
}
