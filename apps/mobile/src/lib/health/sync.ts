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
import {
  collapseSleepByDay, dropUndefined, earliestDay, latestByDay, localDay, minutesBetween,
  planSleepMerge, planWeightMerge, type ExistingDatedRow as DatedRow,
} from '@calistenia/core/lib/health-merge'
import * as hc from './bridge'
import { Sentry } from '@/lib/instrument'

// ─── Formas de las filas de PB que se leen aquí ──────────────────────────────
// `getFullList()` devuelve `RecordModel`, cuyos campos son un índice laxo; estas
// interfaces declaran solo lo que pide cada `fields:` de la query.

interface DailyCacheRow {
  id: string
  date: string
  sleep_minutes?: number
  sleep_quality?: number
  weight_kg?: number
  body_fat_pct?: number
}

const DAY_MS = 86_400_000

/**
 * Merge watch sleep into `sleep_entries` so it shows in the calendar/sleep
 * tracking. La regla (nunca pisar lo manual) vive en `planSleepMerge` de core;
 * aquí solo se leen las filas existentes y se ejecuta el plan. Best-effort:
 * errors here never fail the sync.
 */
async function mergeSleepEntries(userId: string, sleep: hc.SleepSample[]): Promise<number> {
  const days = collapseSleepByDay(sleep)
  const minDay = earliestDay(Object.keys(days))
  if (!minDay) return 0
  const existing = await pb.collection('sleep_entries').getFullList({
    requestKey: null,
    filter: pb.filter('user = {:uid} && date >= {:d}', { uid: userId, d: `${minDay} 00:00:00` }),
    fields: 'id,date,source',
  })
  const ops = planSleepMerge(userId, days, existing as unknown as DatedRow[])
  for (const op of ops) {
    if (op.kind === 'update') await pb.collection('sleep_entries').update(op.id, op.payload)
    else await pb.collection('sleep_entries').create(op.payload)
  }
  return ops.length
}

/** Merge watch weight (+ body fat) into `weight_entries`. Misma regla (`planWeightMerge`). */
async function mergeWeightEntries(
  userId: string,
  weightByDay: Record<string, number>,
  bodyFatByDay: Record<string, number>,
): Promise<number> {
  const minDay = earliestDay(Object.keys(weightByDay))
  if (!minDay) return 0
  const existing = await pb.collection('weight_entries').getFullList({
    requestKey: null,
    filter: pb.filter('user = {:uid} && date >= {:d}', { uid: userId, d: `${minDay} 00:00:00` }),
    fields: 'id,date,source',
  })
  const ops = planWeightMerge(userId, weightByDay, bodyFatByDay, existing as unknown as DatedRow[])
  for (const op of ops) {
    if (op.kind === 'update') await pb.collection('weight_entries').update(op.id, op.payload)
    else await pb.collection('weight_entries').create(op.payload)
  }
  return ops.length
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
