import { pb, isPocketBaseAvailable } from './pocketbase'
import { localMidnightAsUTC, utcToLocalDateStr } from './dateUtils'
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

// Medidas corporales (cinta métrica) — el calendario solo necesita presencia + fecha.
export interface BodyMeasurementLite {
  id: string
  date: string
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

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (year: number, month0: number, day: number) => `${year}-${pad(month0 + 1)}-${pad(day)}`

// PB devuelve los campos `date` como "YYYY-MM-DD 00:00:00.000Z"; nos quedamos
// con el prefijo de fecha local (igual que hace useSleep con r.date.split(' ')[0]).
const dateKey = (raw: string): string => (raw || '').split(' ')[0].split('T')[0]

/**
 * Obtiene todas las fuentes de actividad respaldadas por PocketBase para un mes
 * calendario, acotadas a la ventana del mes local del usuario, y devuelve los
 * agregados por fecha local (YYYY-MM-DD).
 *
 * Dos familias de fechas, dos reglas (ver handoff/feedback_widget_timezone):
 *  - Timestamps UTC (`*_at`: cardio/circuit started_at, nutrition/water logged_at)
 *    → convertir con utcToLocalDateStr ANTES de agrupar, o la actividad cae en el
 *    día equivocado cerca de medianoche.
 *  - Campos `date` (sleep, weight) → ya son fecha local; agrupar por su prefijo.
 *
 * Resiliente: cada fuente que falle registra un warning y queda vacía; nunca lanza.
 * Compartido por el calendario web y el nativo para tener una sola fuente de verdad.
 */
export async function fetchMonthActivity(
  userId: string,
  year: number,
  month0: number, // 0-based, como Date.getMonth()
): Promise<MonthActivity> {
  const result = emptyMonthActivity()
  const available = await isPocketBaseAvailable()
  if (!available) return result

  const monthStart = ymd(year, month0, 1)
  const nextMonth = month0 === 11 ? ymd(year + 1, 0, 1) : ymd(year, month0 + 1, 1)
  const pbStart = localMidnightAsUTC(monthStart)
  const pbEnd = localMidnightAsUTC(nextMonth)

  // Timestamps UTC: rango en instantes UTC equivalentes a medianoche local.
  const utcRange = (field: string) =>
    pb.filter(`user = {:uid} && ${field} >= {:start} && ${field} < {:end}`, {
      uid: userId, start: pbStart, end: pbEnd,
    })
  // Campos `date` locales: comparación lexicográfica con límites YYYY-MM-DD.
  const dateRange = pb.filter('user = {:uid} && date >= {:start} && date < {:end}', {
    uid: userId, start: monthStart, end: nextMonth,
  })

  // getFullList (sin tope de página) para fuentes que pueden tener muchas filas/día
  // (agua: varios vasos al día → un getList(1,500) podría descartar entradas en
  // meses intensos). Normalizamos a { items } para mantener la forma uniforme.
  const fullList = (collection: string, opts: Record<string, unknown>) =>
    pb.collection(collection).getFullList(opts).then((items) => ({ items }))

  const [
    cardioRes, circuitRes, nutritionRes, waterRes, sleepRes, weightRes,
    measurementRes, photoRes, lumbarRes,
  ] = await Promise.allSettled([
    pb.collection('cardio_sessions').getList(1, 200, {
      filter: utcRange('started_at'),
      sort: '-started_at',
      fields: 'id,activity_type,distance_km,duration_seconds,started_at,finished_at,note',
    }),
    pb.collection('circuit_sessions').getList(1, 200, {
      filter: utcRange('started_at'),
      sort: '-started_at',
      fields: 'id,circuit_name,mode,rounds_completed,rounds_target,duration_seconds,started_at,finished_at,note',
    }),
    fullList('nutrition_entries', {
      filter: utcRange('logged_at'),
      fields: 'id,logged_at,total_calories',
    }),
    fullList('water_entries', {
      filter: utcRange('logged_at'),
      fields: 'id,logged_at,amount_ml',
    }),
    pb.collection('sleep_entries').getList(1, 62, {
      filter: dateRange,
      fields: 'id,date,quality,duration_minutes,bedtime,wake_time,awakenings,caffeine,screen_before_bed,stress_level',
    }),
    pb.collection('weight_entries').getList(1, 62, {
      filter: dateRange,
      fields: 'id,date,weight_kg,note',
    }),
    pb.collection('body_measurements').getList(1, 62, {
      filter: dateRange,
      sort: '-date',
      fields: 'id,date',
    }),
    pb.collection('body_photos').getList(1, 300, {
      filter: dateRange,
      sort: '-date',
      fields: 'id,collectionId,collectionName,date,photo',
    }),
    // lumbar_checks.date es un campo `text` YYYY-MM-DD: la comparación lexicográfica
    // del rango sigue siendo válida porque el formato ordena cronológicamente.
    pb.collection('lumbar_checks').getList(1, 62, {
      filter: dateRange,
      sort: '-date',
      fields: 'id,date,lumbar_score',
    }),
  ])

  if (cardioRes.status === 'fulfilled') {
    result.cardio = cardioRes.value.items as unknown as CardioSession[]
  } else {
    console.warn('monthActivity: cardio fetch failed', cardioRes.reason)
  }

  if (circuitRes.status === 'fulfilled') {
    result.circuits = circuitRes.value.items as unknown as CircuitSessionLite[]
  } else {
    console.warn('monthActivity: circuit fetch failed', circuitRes.reason)
  }

  if (nutritionRes.status === 'fulfilled') {
    for (const item of nutritionRes.value.items) {
      const date = utcToLocalDateStr((item as Record<string, unknown>).logged_at as string || '')
      if (!date || date === 'Invalid Date') continue
      const cur = result.nutritionByDate[date] || (result.nutritionByDate[date] = { meals: 0, calories: 0 })
      cur.meals++
      cur.calories += ((item as Record<string, unknown>).total_calories as number) || 0
    }
  } else {
    console.warn('monthActivity: nutrition fetch failed', nutritionRes.reason)
  }

  if (waterRes.status === 'fulfilled') {
    for (const item of waterRes.value.items) {
      const date = utcToLocalDateStr((item as Record<string, unknown>).logged_at as string || '')
      if (!date || date === 'Invalid Date') continue
      const cur = result.waterByDate[date] || (result.waterByDate[date] = { totalMl: 0 })
      cur.totalMl += ((item as Record<string, unknown>).amount_ml as number) || 0
    }
  } else {
    console.warn('monthActivity: water fetch failed', waterRes.reason)
  }

  if (sleepRes.status === 'fulfilled') {
    for (const raw of sleepRes.value.items as unknown as SleepEntry[]) {
      const date = dateKey(raw.date)
      if (!date) continue
      result.sleepByDate[date] = { ...raw, date }
    }
  } else {
    console.warn('monthActivity: sleep fetch failed', sleepRes.reason)
  }

  if (weightRes.status === 'fulfilled') {
    for (const raw of weightRes.value.items as unknown as WeightEntryLite[]) {
      const date = dateKey(raw.date)
      if (!date) continue
      result.weightByDate[date] = { ...raw, date }
    }
  } else {
    console.warn('monthActivity: weight fetch failed', weightRes.reason)
  }

  // Medidas corporales: una por día (la más reciente gana, ordenado por -date).
  if (measurementRes.status === 'fulfilled') {
    for (const raw of measurementRes.value.items as unknown as BodyMeasurementLite[]) {
      const date = dateKey(raw.date)
      if (!date || result.measurementByDate[date]) continue
      result.measurementByDate[date] = { ...raw, date }
    }
  } else {
    console.warn('monthActivity: measurements fetch failed', measurementRes.reason)
  }

  // Fotos de progreso: pueden ser varias por día → contamos y guardamos URLs servibles.
  if (photoRes.status === 'fulfilled') {
    for (const item of photoRes.value.items) {
      const rec = item as Record<string, unknown>
      const date = dateKey(rec.date as string || '')
      if (!date) continue
      const cur = result.photosByDate[date] || (result.photosByDate[date] = { count: 0, photos: [] })
      cur.count++
      const file = rec.photo as string
      if (file) cur.photos.push({ id: rec.id as string, url: pb.files.getURL(rec, file) })
    }
  } else {
    console.warn('monthActivity: photos fetch failed', photoRes.reason)
  }

  // Chequeo lumbar: uno por día (el más reciente gana).
  if (lumbarRes.status === 'fulfilled') {
    for (const raw of lumbarRes.value.items as unknown as LumbarCheckLite[]) {
      const date = dateKey(raw.date)
      if (!date || result.lumbarByDate[date]) continue
      result.lumbarByDate[date] = { ...raw, date }
    }
  } else {
    console.warn('monthActivity: lumbar fetch failed', lumbarRes.reason)
  }

  return result
}
