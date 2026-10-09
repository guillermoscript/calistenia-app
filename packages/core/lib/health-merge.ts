/**
 * Reglas de fusión de datos del reloj (Health Connect / HealthKit) con lo que el
 * usuario ya tiene en `sleep_entries` y `weight_entries`.
 *
 * Es lógica de negocio, no de plataforma: la app móvil lee del puente nativo y
 * ejecuta el plan; aquí solo se decide QUÉ se escribe.
 *
 * Regla de oro: NUNCA se pisa lo manual (ni lo de otra fuente). Un día sin fila
 * se crea; un día con fila solo se actualiza si la escribimos nosotros en una
 * sincronización anterior (`source === 'health_connect'`).
 */

export const HEALTH_SOURCE = 'health_connect'

export interface ExistingDatedRow { id: string; date: string; source?: string }

export type MergeOp<P> =
  | { kind: 'create'; payload: P }
  | { kind: 'update'; id: string; payload: P }

/** Día local YYYY-MM-DD de un datetime ISO (zona del dispositivo). */
export function localDay(iso: string): string {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

/** «HH:MM» local (zona del dispositivo) de un datetime ISO. */
export function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Última lectura de cada día local (por marca de tiempo), redondeada a 1 decimal. */
export function latestByDay<T extends { time: string }>(
  samples: T[],
  pick: (s: T) => number,
): Record<string, number> {
  const best: Record<string, { t: number; v: number }> = {}
  for (const s of samples) {
    const day = localDay(s.time)
    const t = new Date(s.time).getTime()
    if (!best[day] || t > best[day].t) best[day] = { t, v: pick(s) }
  }
  const out: Record<string, number> = {}
  for (const d in best) out[d] = Math.round(best[d].v * 10) / 10
  return out
}

export function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

/** Calidad 1–5 aproximada a partir de los minutos dormidos (Health Connect no da puntuación). */
export function sleepQualityFromMinutes(min: number): number {
  const h = min / 60
  if (h >= 9.5) return 4 // sobre-dormido
  if (h >= 7) return 5
  if (h >= 6) return 4
  if (h >= 5) return 3
  if (h >= 4) return 2
  return 1
}

/** `date` de PB («YYYY-MM-DD HH:MM:SS.sssZ» o ISO) → «YYYY-MM-DD». */
export const dateKey = (raw: string): string => String(raw).split(' ')[0].split('T')[0]

export interface SleepSampleLike { startTime: string; endTime: string; awakeMinutes: number; id?: string }
export interface SleepDay { start: string; end: string; asleep: number; awake: number; id?: string }

/** Junta las sesiones de sueño en una por día de despertar (acuesta más temprano, despierta más tarde). */
export function collapseSleepByDay(sleep: SleepSampleLike[]): Record<string, SleepDay> {
  const out: Record<string, SleepDay> = {}
  for (const s of sleep) {
    const day = localDay(s.endTime) // se atribuye al día en que se despierta
    const asleep = Math.max(0, minutesBetween(s.startTime, s.endTime) - s.awakeMinutes)
    const cur = out[day]
    if (!cur) {
      out[day] = { start: s.startTime, end: s.endTime, asleep, awake: s.awakeMinutes, id: s.id }
    } else {
      if (new Date(s.startTime) < new Date(cur.start)) cur.start = s.startTime
      if (new Date(s.endTime) > new Date(cur.end)) cur.end = s.endTime
      cur.asleep += asleep
      cur.awake += s.awakeMinutes
    }
  }
  return out
}

function indexByDate(existing: ExistingDatedRow[]): Map<string, ExistingDatedRow> {
  return new Map(existing.map(r => [dateKey(r.date), r]))
}

/** ¿Se puede escribir sobre la fila de ese día? Sin fila, o fila nuestra de una sincronización anterior. */
function writable(found: ExistingDatedRow | undefined): boolean {
  return !found || found.source === HEALTH_SOURCE
}

export interface SleepEntryPayload {
  user: string
  date: string
  bedtime: string
  wake_time: string
  duration_minutes: number
  awake_minutes: number
  awakenings: number
  quality: number
  source: string
  external_id: string
}

/** Qué escribir en `sleep_entries`: un create/update por día, saltando los días con datos manuales. */
export function planSleepMerge(
  userId: string,
  days: Record<string, SleepDay>,
  existing: ExistingDatedRow[],
): MergeOp<SleepEntryPayload>[] {
  const byDate = indexByDate(existing)
  const ops: MergeOp<SleepEntryPayload>[] = []
  for (const day of Object.keys(days)) {
    const found = byDate.get(day)
    if (!writable(found)) continue // respeta lo manual
    const info = days[day]
    const payload: SleepEntryPayload = {
      user: userId,
      date: `${day} 00:00:00`,
      bedtime: hhmm(info.start),
      wake_time: hhmm(info.end),
      duration_minutes: Math.round(info.asleep),
      awake_minutes: Math.round(info.awake),
      awakenings: 0,
      quality: sleepQualityFromMinutes(info.asleep),
      source: HEALTH_SOURCE,
      external_id: info.id ?? '',
    }
    ops.push(found ? { kind: 'update', id: found.id, payload } : { kind: 'create', payload })
  }
  return ops
}

export interface WeightEntryPayload {
  user: string
  date: string
  weight_kg?: number
  body_fat_pct?: number
  source: string
}

/** Qué escribir en `weight_entries` (peso + grasa), con la misma regla que el sueño. */
export function planWeightMerge(
  userId: string,
  weightByDay: Record<string, number>,
  bodyFatByDay: Record<string, number>,
  existing: ExistingDatedRow[],
): MergeOp<Partial<WeightEntryPayload>>[] {
  const byDate = indexByDate(existing)
  const ops: MergeOp<Partial<WeightEntryPayload>>[] = []
  for (const day of Object.keys(weightByDay)) {
    const found = byDate.get(day)
    if (!writable(found)) continue
    const payload = dropUndefined({
      user: userId,
      date: `${day} 00:00:00`,
      weight_kg: weightByDay[day],
      body_fat_pct: bodyFatByDay[day],
      source: HEALTH_SOURCE,
    })
    ops.push(found ? { kind: 'update', id: found.id, payload } : { kind: 'create', payload })
  }
  return ops
}

/** Primer día (YYYY-MM-DD) de la lista, o null si está vacía: cota inferior de la lectura de filas existentes. */
export function earliestDay(days: string[]): string | null {
  return days.length === 0 ? null : days.reduce((a, b) => (a < b ? a : b))
}
