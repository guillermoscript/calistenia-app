#!/usr/bin/env node
/**
 * Datos FALSOS de reloj para ver cómo los pinta la app sin tener reloj.
 *
 * Simula lo que Health Connect le devolvería a `syncHealth()`
 * (apps/mobile/src/lib/health/sync.ts) y escribe EXACTAMENTE lo mismo que esa
 * función: `daily_health_cache` + `sleep_entries` + `weight_entries` con
 * `source = 'health_connect'`. La agregación y la regla de «no pisar lo manual»
 * se IMPORTAN de `packages/core/lib/health-merge.ts` (Node ≥ 22.6 quita los
 * tipos), así que no se puede desincronizar de la app. Solo PocketBase LOCAL.
 *
 *   node scripts/seed-watch-fake-data.mjs [pbUrl] [email] [password]
 *   node scripts/seed-watch-fake-data.mjs --clean   # borra lo sembrado
 *
 * Por defecto: http://127.0.0.1:8090, test-b@local.test / TestUser123!
 */
const args = process.argv.slice(2)
const clean = args.includes('--clean')
const [PB = 'http://127.0.0.1:8090', EMAIL = 'test-b@local.test', PASS = 'TestUser123!'] = args.filter((a) => !a.startsWith('--'))

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(PB)) {
  console.error(`Solo PocketBase local, no ${PB}`)
  process.exit(1)
}

import {
  collapseSleepByNight, dropUndefined, latestByDay, localDay, planSleepMerge, planWeightMerge,
  sleepMinutesByWakeDay,
} from '../packages/core/lib/health-merge.ts'

const DAY_MS = 86_400_000
const pad = (n) => String(n).padStart(2, '0')
const fmtMin = (m) => `${Math.floor(m / 60)}h${pad(m % 60)}`

/** Fecha local a `daysAgo` días de hoy, a la hora h:m. */
function at(daysAgo, h, m = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

// ─── Lo que «diría» Health Connect ────────────────────────────────────────────
// Cada caso está puesto para enseñar una regla concreta de la sync.
const SLEEP = [
  // hoy: noche normal con 25 min despierto → 7h05 dormido, calidad 5
  { id: 'fake-s0', startTime: at(1, 23, 40), endTime: at(0, 7, 10), awakeMinutes: 25 },
  // ayer: durmió de más → 9h50, calidad 4 («sobre-dormido»)
  { id: 'fake-s1', startTime: at(2, 22, 30), endTime: at(1, 8, 20), awakeMinutes: 0 },
  // hace 3 días: noche corta → 4h35, calidad 2
  { id: 'fake-s3', startTime: at(3, 1, 45), endTime: at(3, 6, 30), awakeMinutes: 10 },
  // hace 5 días: noche + siesta → la siesta se IGNORA (no estira la noche hasta las 16:10)
  { id: 'fake-s5a', startTime: at(5, 0, 30), endTime: at(5, 6, 0), awakeMinutes: 15 },
  { id: 'fake-s5b', startTime: at(5, 15, 0), endTime: at(5, 16, 10), awakeMinutes: 0 },
  // noche de hace 8 días: el reloj dice 8h, pero YA había un registro MANUAL → no se pisa
  { id: 'fake-s7', startTime: at(8, 23, 0), endTime: at(7, 7, 0), awakeMinutes: 0 },
  // hace 9 días: noche normal
  { id: 'fake-s9', startTime: at(10, 23, 15), endTime: at(9, 6, 45), awakeMinutes: 20 },
]
const WEIGHT = [
  { time: at(9, 7, 30), kg: 75.4 },
  { time: at(6, 7, 30), kg: 75.1 },
  // dos pesadas el mismo día → gana la ÚLTIMA (la de la tarde)
  { time: at(3, 7, 30), kg: 74.6 },
  { time: at(3, 19, 0), kg: 75.3 },
  { time: at(0, 7, 20), kg: 74.8 },
]
const BODY_FAT = [
  { time: at(6, 7, 30), pct: 17.4 },
  { time: at(0, 7, 20), pct: 16.9 },
]
// El registro manual que el usuario apuntó a mano para esa noche (antes de sincronizar).
const MANUAL_SLEEP = { daysAgo: 8, bedtime: '00:30', wake_time: '06:30', duration_minutes: 360, quality: 3 }

// ─── PB ───────────────────────────────────────────────────────────────────────
async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}
const q = (s) => encodeURIComponent(s)

const auth = await api('/api/collections/users/auth-with-password', {
  method: 'POST',
  body: { identity: EMAIL, password: PASS },
})
const token = auth.token
const uid = auth.record.id
const list = async (col, filter) =>
  (await api(`/api/collections/${col}/records?perPage=500&filter=${q(filter)}`, { token })).items
const create = (col, body) => api(`/api/collections/${col}/records`, { method: 'POST', body, token })
const update = (col, id, body) => api(`/api/collections/${col}/records/${id}`, { method: 'PATCH', body, token })
const del = (col, id) => api(`/api/collections/${col}/records/${id}`, { method: 'DELETE', token })

const windowStart = localDay(new Date(Date.now() - 14 * DAY_MS).toISOString())
const manualDay = localDay(at(MANUAL_SLEEP.daysAgo, 12))

if (clean) {
  let n = 0
  for (const r of await list('daily_health_cache', `user="${uid}" && date>="${windowStart}"`)) { await del('daily_health_cache', r.id); n++ }
  for (const col of ['sleep_entries', 'weight_entries'])
    for (const r of await list(col, `user="${uid}" && date>="${windowStart} 00:00:00" && source="health_connect"`)) { await del(col, r.id); n++ }
  for (const r of await list('sleep_entries', `user="${uid}" && date>="${windowStart} 00:00:00" && note="FAKE manual"`)) { await del('sleep_entries', r.id); n++ }
  console.log(`Borradas ${n} filas de ${EMAIL} desde ${windowStart}`)
  process.exit(0)
}

// 0) El manual previo (como si el usuario lo hubiera apuntado antes de conectar el reloj).
const existingManual = await list('sleep_entries', `user="${uid}" && date~"${manualDay}"`)
if (existingManual.length === 0) {
  await create('sleep_entries', {
    user: uid, date: `${manualDay} 00:00:00`, bedtime: MANUAL_SLEEP.bedtime, wake_time: MANUAL_SLEEP.wake_time,
    duration_minutes: MANUAL_SLEEP.duration_minutes, quality: MANUAL_SLEEP.quality, awakenings: 1, note: 'FAKE manual',
  })
}

// 1) Agregación — la misma de syncHealth().
const weightByDay = latestByDay(WEIGHT, (s) => s.kg)
const bodyFatByDay = latestByDay(BODY_FAT, (s) => s.pct)
const nights = collapseSleepByNight(SLEEP)
const sleepByDay = sleepMinutesByWakeDay(nights)

// 2) daily_health_cache
const cache = new Map((await list('daily_health_cache', `user="${uid}" && date>="${windowStart}"`)).map((r) => [r.date, r]))
const dates = [...new Set([...Object.keys(weightByDay), ...Object.keys(bodyFatByDay), ...Object.keys(sleepByDay)])].sort()
for (const date of dates) {
  const row = dropUndefined({
    user: uid, date, weight_kg: weightByDay[date], body_fat_pct: bodyFatByDay[date], sleep_minutes: sleepByDay[date],
  })
  const found = cache.get(date)
  if (found) await update('daily_health_cache', found.id, row)
  else await create('daily_health_cache', row)
}

// 3) sleep_entries / weight_entries — mismo plan que la app (respeta lo manual)
const report = []
const run = async (col, ops, describe) => {
  for (const op of ops) {
    const day = op.payload.date.slice(0, 10)
    try {
      if (op.kind === 'update') await update(col, op.id, op.payload)
      else await create(col, op.payload)
      report.push(`  ${day} ${describe(op.payload)}`)
    } catch (e) {
      // syncHealth() hace lo mismo: lo manda a Sentry y sigue sin avisar.
      report.push(`  ${day} ${col} FALLÓ (la app lo traga en silencio): ${e.message.slice(0, 160)}`)
    }
  }
}
const sleepRows = await list('sleep_entries', `user="${uid}" && date>="${windowStart} 00:00:00"`)
const sleepOps = planSleepMerge(uid, nights, sleepRows)
for (const night of Object.keys(nights)) {
  if (!sleepOps.some((o) => o.payload.date.startsWith(night))) {
    report.push(`  ${night} noche   SALTADA (ya había una manual) — el reloj decía ${fmtMin(nights[night].asleep)}`)
  }
}
await run('sleep_entries', sleepOps, (p) =>
  `noche   ${p.bedtime}→${p.wake_time}  ${fmtMin(p.duration_minutes)} dormido, calidad ${p.quality}/5`)

const weightRows = await list('weight_entries', `user="${uid}" && date>="${windowStart} 00:00:00"`)
await run('weight_entries', planWeightMerge(uid, weightByDay, bodyFatByDay, weightRows), (p) =>
  `peso    ${p.weight_kg} kg${p.body_fat_pct ? ` · grasa ${p.body_fat_pct}%` : ''}`)

console.log(`Usuario ${EMAIL} (${uid}) — ${dates.length} días en daily_health_cache\n${report.sort().join('\n')}`)
