/**
 * Health-hub sync orchestrator (Fase 1, read-only).
 *
 * Reads the last N days from Health Connect via the bridge, aggregates to a
 * per-local-day summary, and upserts the `daily_health_cache` PocketBase
 * collection, plus merges watch sleep/weight into sleep_entries/weight_entries
 * (manual-safe). v1.12.3 retiró Steps y HeartRate (tercer rechazo de Play por
 * acceso mínimo a datos): las columnas steps y hr_avg/hr_max ya no se escriben;
 * los valores históricos se conservan.
 */
import { pb } from '@calistenia/core/lib/pocketbase'
import type { DailyHealthSummary, HealthDataType, HealthSyncResult } from '@calistenia/core/types'
import * as hc from './bridge'
import { Sentry } from '@/lib/instrument'

// ─── Formas de las filas de PB que se leen aquí ──────────────────────────────
// `getFullList()` devuelve `RecordModel`, cuyos campos son un índice laxo; estas
// interfaces declaran solo lo que pide cada `fields:` de la query.

interface DatedRow { id: string; date: string; source?: string }
interface DailyCacheRow {
  id: string
  date: string
  sleep_minutes?: number
  sleep_quality?: number
  weight_kg?: number
  body_fat_pct?: number
}

const DAY_MS = 86_400_000

/** Local YYYY-MM-DD for an ISO datetime (device timezone). */
function localDay(iso: string): string {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

/** Latest reading per local day (by timestamp). */
function latestByDay<T extends { time: string }>(samples: T[], pick: (s: T) => number): Record<string, number> {
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

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

/** Local "HH:MM" (device tz) for an ISO datetime. */
function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Coarse 1–5 sleep quality from asleep minutes (HC gives no quality score). */
function sleepQualityFromMinutes(min: number): number {
  const h = min / 60
  if (h >= 9.5) return 4 // sobre-dormido
  if (h >= 7) return 5
  if (h >= 6) return 4
  if (h >= 5) return 3
  if (h >= 4) return 2
  return 1
}

const dateKey = (raw: string): string => String(raw).split(' ')[0].split('T')[0]

interface SleepDay { start: string; end: string; asleep: number; awake: number; id?: string }

/** Collapse HC sleep sessions into one per wake-day (earliest bed, latest wake). */
function sleepDays(sleep: hc.SleepSample[]): Record<string, SleepDay> {
  const out: Record<string, SleepDay> = {}
  for (const s of sleep) {
    const day = localDay(s.endTime) // attribute to the wake day
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

/**
 * Merge watch sleep into `sleep_entries` so it shows in the calendar/sleep
 * tracking. NEVER overwrites a manual (or HealthKit) entry — only creates a row
 * for days with no entry, or updates one we previously imported
 * (source === 'health_connect'). Best-effort: errors here never fail the sync.
 */
async function mergeSleepEntries(userId: string, sleep: hc.SleepSample[]): Promise<number> {
  const days = sleepDays(sleep)
  const dates = Object.keys(days)
  if (dates.length === 0) return 0
  const minDay = dates.reduce((a, b) => (a < b ? a : b))
  const existing = await pb.collection('sleep_entries').getFullList({
    requestKey: null,
    filter: pb.filter('user = {:uid} && date >= {:d}', { uid: userId, d: `${minDay} 00:00:00` }),
    fields: 'id,date,source',
  })
  const byDate = new Map<string, { id: string; source?: string }>(
    (existing as unknown as DatedRow[]).map((r) => [dateKey(r.date), r]),
  )
  let written = 0
  for (const day of dates) {
    const found = byDate.get(day)
    if (found && found.source !== 'health_connect') continue // respeta lo manual
    const info = days[day]
    const payload = {
      user: userId,
      date: `${day} 00:00:00`,
      bedtime: hhmm(info.start),
      wake_time: hhmm(info.end),
      duration_minutes: Math.round(info.asleep),
      awake_minutes: Math.round(info.awake),
      awakenings: 0,
      quality: sleepQualityFromMinutes(info.asleep),
      source: 'health_connect',
      external_id: info.id ?? '',
    }
    if (found) await pb.collection('sleep_entries').update(found.id, payload)
    else await pb.collection('sleep_entries').create(payload)
    written++
  }
  return written
}

/**
 * Merge watch weight (+ body fat) into `weight_entries`. Same manual-safe rule
 * as sleep. Best-effort.
 */
async function mergeWeightEntries(
  userId: string,
  weightByDay: Record<string, number>,
  bodyFatByDay: Record<string, number>,
): Promise<number> {
  const dates = Object.keys(weightByDay)
  if (dates.length === 0) return 0
  const minDay = dates.reduce((a, b) => (a < b ? a : b))
  const existing = await pb.collection('weight_entries').getFullList({
    requestKey: null,
    filter: pb.filter('user = {:uid} && date >= {:d}', { uid: userId, d: `${minDay} 00:00:00` }),
    fields: 'id,date,source',
  })
  const byDate = new Map<string, { id: string; source?: string }>(
    (existing as unknown as DatedRow[]).map((r) => [dateKey(r.date), r]),
  )
  let written = 0
  for (const day of dates) {
    const found = byDate.get(day)
    if (found && found.source !== 'health_connect') continue
    const payload = dropUndefined({
      user: userId,
      date: `${day} 00:00:00`,
      weight_kg: weightByDay[day],
      body_fat_pct: bodyFatByDay[day],
      source: 'health_connect',
    })
    if (found) await pb.collection('weight_entries').update(found.id, payload)
    else await pb.collection('weight_entries').create(payload)
    written++
  }
  return written
}

/**
 * Pull the last `days` from Health Connect and upsert daily_health_cache.
 * Re-reading a rolling window each sync naturally absorbs late-arriving data
 * (the watch may sync hours after the fact); the upsert is idempotent per day.
 */
export async function syncHealth(opts: { userId: string; days?: number }): Promise<HealthSyncResult> {
  const days = opts.days ?? 14
  const end = new Date()
  const start = new Date(end.getTime() - days * DAY_MS)
  const range = { startTime: start.toISOString(), endTime: end.toISOString() }
  const syncedAt = new Date().toISOString()
  const imported: Partial<Record<HealthDataType, number>> = {}

  try {
    const [weight, bodyFat, sleep] = await Promise.all([
      hc.readWeight(range),
      hc.readBodyFat(range),
      hc.readSleep(range),
    ])

    imported.weight = weight.length
    imported.body_fat = bodyFat.length
    imported.sleep = sleep.length

    const weightByDay = latestByDay(weight, (s) => s.kg)
    const bodyFatByDay = latestByDay(bodyFat, (s) => s.pct)

    const sleepByDay: Record<string, number> = {}
    for (const s of sleep) {
      const day = localDay(s.endTime) // attribute to the wake day
      const mins = Math.max(0, minutesBetween(s.startTime, s.endTime) - s.awakeMinutes)
      sleepByDay[day] = (sleepByDay[day] ?? 0) + mins
    }

    const dates = new Set<string>([
      ...Object.keys(weightByDay),
      ...Object.keys(bodyFatByDay),
      ...Object.keys(sleepByDay),
    ])
    // daily_health_cache: resumen por día (solo si hubo métricas diarias).
    if (dates.size > 0) {
      const startDay = localDay(range.startTime)
      const existing = await pb.collection('daily_health_cache').getFullList({
        requestKey: null,
        filter: pb.filter('user = {:uid} && date >= {:d}', { uid: opts.userId, d: startDay }),
      })
      const byDate = new Map<string, { id: string }>(
        (existing as unknown as DailyCacheRow[]).map((r) => [r.date, r]),
      )

      for (const date of dates) {
        const row = dropUndefined({
          user: opts.userId,
          date,
          weight_kg: weightByDay[date],
          body_fat_pct: bodyFatByDay[date],
          sleep_minutes: sleepByDay[date] != null ? Math.round(sleepByDay[date]) : undefined,
        })
        const found = byDate.get(date)
        if (found) await pb.collection('daily_health_cache').update(found.id, row)
        else await pb.collection('daily_health_cache').create(row)
      }
    }

    // Fase 2: volcar sueño/peso a sus colecciones reales (calendario + tracking).
    // No-fatal: el cache (arriba) ya quedó guardado aunque esto falle.
    try {
      await mergeSleepEntries(opts.userId, sleep)
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'health', op: 'merge_sleep_entries' } })
      /* merge sueño best-effort */
    }
    try {
      await mergeWeightEntries(opts.userId, weightByDay, bodyFatByDay)
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'health', op: 'merge_weight_entries' } })
      /* merge peso best-effort */
    }
    return { ok: true, syncedAt, imported }
  } catch (e) {
    return { ok: false, syncedAt, imported, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Read one cached day for display (null if not synced yet). */
export async function readDailyCache(userId: string, date: string): Promise<DailyHealthSummary | null> {
  try {
    const r = (await pb
      .collection('daily_health_cache')
      .getFirstListItem(pb.filter('user = {:uid} && date = {:d}', { uid: userId, d: date }))) as unknown as DailyCacheRow
    return {
      id: r.id,
      date: r.date,
      sleep_minutes: r.sleep_minutes || undefined,
      sleep_quality: r.sleep_quality || undefined,
      weight_kg: r.weight_kg || undefined,
      body_fat_pct: r.body_fat_pct || undefined,
    }
  } catch {
    return null
  }
}
