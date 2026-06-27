/**
 * Health-hub sync orchestrator (Fase 1, read-only).
 *
 * Reads the last N days from Health Connect via the bridge, aggregates to a
 * per-local-day summary, and upserts the `daily_health_cache` PocketBase
 * collection. Writes are confined to that NEW collection — existing
 * user-entered data (sleep_entries, weight_entries, sessions) is untouched in
 * this slice. Merging watch sleep/weight into those logs and matching HR to
 * sessions is the next slice (see docs/health-connect-integration-plan.md WS4).
 */
import { pb } from '@calistenia/core/lib/pocketbase'
import type { DailyHealthSummary, HealthDataType, HealthSyncResult } from '@calistenia/core/types'
import * as hc from './bridge'
import { Sentry } from '@/lib/instrument'

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

function sumByDay<T>(samples: T[], dayOf: (s: T) => string, val: (s: T) => number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of samples) {
    const d = dayOf(s)
    out[d] = (out[d] ?? 0) + val(s)
  }
  return out
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
    filter: pb.filter('user = {:uid} && date >= {:d}', { uid: userId, d: `${minDay} 00:00:00` }),
    fields: 'id,date,source',
  })
  const byDate = new Map<string, { id: string; source?: string }>(
    existing.map((r: any) => [dateKey(r.date), r]),
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
    filter: pb.filter('user = {:uid} && date >= {:d}', { uid: userId, d: `${minDay} 00:00:00` }),
    fields: 'id,date,source',
  })
  const byDate = new Map<string, { id: string; source?: string }>(
    existing.map((r: any) => [dateKey(r.date), r]),
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

/** Avg/max bpm of HR samples inside [startMs, endMs]. */
function hrStatsInWindow(hr: hc.HrSample[], startMs: number, endMs: number): { avg: number; max: number; n: number } {
  let sum = 0
  let max = 0
  let n = 0
  for (const s of hr) {
    const t = new Date(s.time).getTime()
    if (t >= startMs && t <= endMs) {
      sum += s.bpm
      if (s.bpm > max) max = s.bpm
      n++
    }
  }
  return n > 0 ? { avg: Math.round(sum / n), max: Math.round(max), n } : { avg: 0, max: 0, n: 0 }
}

/** kcal of energy records overlapping [startMs, endMs] (prorated by overlap). */
function kcalInWindow(energy: hc.EnergySample[], startMs: number, endMs: number): number {
  let kcal = 0
  for (const e of energy) {
    const s = new Date(e.startTime).getTime()
    const en = new Date(e.endTime).getTime()
    if (en > s) {
      const overlap = Math.min(en, endMs) - Math.max(s, startMs)
      if (overlap > 0) kcal += e.kcal * (overlap / (en - s))
    } else if (s >= startMs && s <= endMs) {
      kcal += e.kcal // registro instantáneo dentro de la ventana
    }
  }
  return kcal
}

interface SessionWindow { id: string; start: number; end: number; hasHr: boolean }

/** Write hr_avg/hr_max/calories_actual onto sessions whose window has HR/energy. */
async function applySessionMetrics(
  collection: string,
  sessions: SessionWindow[],
  hr: hc.HrSample[],
  active: hc.EnergySample[],
): Promise<number> {
  let written = 0
  for (const s of sessions) {
    if (s.hasHr) continue // ya importado en una sync previa — no re-escribir
    if (!(s.end > s.start)) continue
    const { avg, max, n } = hrStatsInWindow(hr, s.start, s.end)
    const kcal = kcalInWindow(active, s.start, s.end)
    const payload: Record<string, number> = {}
    if (n > 0) {
      payload.hr_avg = avg
      payload.hr_max = max
    }
    if (kcal > 0) payload.calories_actual = Math.round(kcal)
    if (Object.keys(payload).length === 0) continue
    await pb.collection(collection).update(s.id, payload)
    written++
  }
  return written
}

/**
 * Casa la serie de frecuencia cardíaca (+ calorías activas) del reloj con la
 * ventana temporal de cada sesión de entreno y rellena hr_avg/hr_max/
 * calories_actual. Tres colecciones:
 *   - cardio_sessions / circuit_sessions: tienen started_at + finished_at (ISO).
 *   - sessions (fuerza): solo completed_at + duration_seconds → ventana
 *     aproximada [completed_at - duration, completed_at].
 * Solo escribe en sesiones que aún no tienen hr_avg. Best-effort.
 */
async function mergeSessionMetrics(
  userId: string,
  rangeStartISO: string,
  hr: hc.HrSample[],
  active: hc.EnergySample[],
): Promise<void> {
  if (hr.length === 0 && active.length === 0) return

  // cardio + circuit: ventana exacta por started_at/finished_at (texto ISO)
  for (const coll of ['cardio_sessions', 'circuit_sessions']) {
    const rows = await pb.collection(coll).getFullList({
      filter: pb.filter('user = {:uid} && started_at >= {:s}', { uid: userId, s: rangeStartISO }),
      fields: 'id,started_at,finished_at,hr_avg',
    })
    const windows: SessionWindow[] = rows
      .filter((r: any) => r.started_at && r.finished_at)
      .map((r: any) => ({
        id: r.id,
        start: new Date(r.started_at).getTime(),
        end: new Date(r.finished_at).getTime(),
        hasHr: !!r.hr_avg,
      }))
    await applySessionMetrics(coll, windows, hr, active)
  }

  // fuerza/yoga: ventana aproximada con completed_at - duration_seconds
  const strength = await pb.collection('sessions').getFullList({
    filter: pb.filter('user = {:uid} && completed_at >= {:s}', { uid: userId, s: rangeStartISO }),
    fields: 'id,completed_at,duration_seconds,hr_avg',
  })
  const strengthWindows: SessionWindow[] = strength
    .filter((r: any) => r.completed_at && r.duration_seconds > 0)
    .map((r: any) => {
      const end = new Date(r.completed_at).getTime()
      return { id: r.id, start: end - r.duration_seconds * 1000, end, hasHr: !!r.hr_avg }
    })
  await applySessionMetrics('sessions', strengthWindows, hr, active)
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
    const [steps, active, total, resting, hrv, vo2, weight, bodyFat, sleep, heartRate] = await Promise.all([
      hc.readSteps(range),
      hc.readActiveCalories(range),
      hc.readTotalCalories(range),
      hc.readRestingHeartRate(range),
      hc.readHrv(range),
      hc.readVo2Max(range),
      hc.readWeight(range),
      hc.readBodyFat(range),
      hc.readSleep(range),
      hc.readHeartRate(range),
    ])

    imported.steps = steps.length
    imported.active_calories = active.length
    imported.total_calories = total.length
    imported.resting_hr = resting.length
    imported.hrv = hrv.length
    imported.vo2max = vo2.length
    imported.weight = weight.length
    imported.body_fat = bodyFat.length
    imported.sleep = sleep.length

    const stepsByDay = sumByDay(steps, (s) => localDay(s.startTime), (s) => s.count)
    const activeByDay = sumByDay(active, (s) => localDay(s.startTime), (s) => s.kcal)
    const totalByDay = sumByDay(total, (s) => localDay(s.startTime), (s) => s.kcal)
    const restingByDay = latestByDay(resting, (s) => s.bpm)
    const hrvByDay = latestByDay(hrv, (s) => s.value)
    const vo2ByDay = latestByDay(vo2, (s) => s.value)
    const weightByDay = latestByDay(weight, (s) => s.kg)
    const bodyFatByDay = latestByDay(bodyFat, (s) => s.pct)

    const sleepByDay: Record<string, number> = {}
    for (const s of sleep) {
      const day = localDay(s.endTime) // attribute to the wake day
      const mins = Math.max(0, minutesBetween(s.startTime, s.endTime) - s.awakeMinutes)
      sleepByDay[day] = (sleepByDay[day] ?? 0) + mins
    }

    const dates = new Set<string>([
      ...Object.keys(stepsByDay),
      ...Object.keys(activeByDay),
      ...Object.keys(totalByDay),
      ...Object.keys(restingByDay),
      ...Object.keys(hrvByDay),
      ...Object.keys(vo2ByDay),
      ...Object.keys(weightByDay),
      ...Object.keys(bodyFatByDay),
      ...Object.keys(sleepByDay),
    ])
    // daily_health_cache: resumen por día (solo si hubo métricas diarias).
    if (dates.size > 0) {
      const startDay = localDay(range.startTime)
      const existing = await pb.collection('daily_health_cache').getFullList({
        filter: pb.filter('user = {:uid} && date >= {:d}', { uid: opts.userId, d: startDay }),
      })
      const byDate = new Map<string, { id: string }>(existing.map((r: any) => [r.date, r]))

      for (const date of dates) {
        const row = dropUndefined({
          user: opts.userId,
          date,
          steps: stepsByDay[date] != null ? Math.round(stepsByDay[date]) : undefined,
          active_calories: activeByDay[date] != null ? Math.round(activeByDay[date]) : undefined,
          total_calories: totalByDay[date] != null ? Math.round(totalByDay[date]) : undefined,
          resting_hr: restingByDay[date] != null ? Math.round(restingByDay[date]) : undefined,
          hrv_ms: hrvByDay[date],
          vo2max: vo2ByDay[date],
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
    try {
      await mergeSessionMetrics(opts.userId, range.startTime, heartRate, active)
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'health', op: 'merge_session_metrics' } })
      /* merge HR→sesiones best-effort */
    }

    return { ok: true, syncedAt, imported }
  } catch (e: any) {
    return { ok: false, syncedAt, imported, error: e?.message ?? String(e) }
  }
}

/** Read one cached day for display (null if not synced yet). */
export async function readDailyCache(userId: string, date: string): Promise<DailyHealthSummary | null> {
  try {
    const r: any = await pb
      .collection('daily_health_cache')
      .getFirstListItem(pb.filter('user = {:uid} && date = {:d}', { uid: userId, d: date }))
    return {
      id: r.id,
      date: r.date,
      steps: r.steps || undefined,
      active_calories: r.active_calories || undefined,
      total_calories: r.total_calories || undefined,
      resting_hr: r.resting_hr || undefined,
      hrv_ms: r.hrv_ms || undefined,
      vo2max: r.vo2max || undefined,
      sleep_minutes: r.sleep_minutes || undefined,
      sleep_quality: r.sleep_quality || undefined,
      weight_kg: r.weight_kg || undefined,
      body_fat_pct: r.body_fat_pct || undefined,
    }
  } catch {
    return null
  }
}
