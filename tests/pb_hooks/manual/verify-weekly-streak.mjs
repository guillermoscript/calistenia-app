/**
 * Verificacion manual de la racha SEMANAL de `user_stats` (#801).
 *
 * No es un test de CI: se corre a mano contra un PocketBase con datos (una
 * copia de produccion, por ejemplo) para comprobar que lo que guarda el
 * servidor coincide con el algoritmo compartido. Recalcula la racha de CADA
 * fila de `user_stats` desde las tres colecciones de sesiones y la historia de
 * objetivos de su `settings`, y lista las filas que difieren.
 *
 * SOLO LEE: no escribe nada.
 *
 *   PB_URL=http://127.0.0.1:8090 PB_SU_EMAIL=admin@x.com PB_SU_PASS=secreto \
 *     node tests/pb_hooks/manual/verify-weekly-streak.mjs
 *
 * Las reglas de dia son las del servidor (utils/weekly_streak.js):
 *  - sessions: los 10 primeros caracteres de `completed_at`.
 *  - circuit_sessions y cardio_sessions: los 10 primeros de `finished_at`, o de
 *    `started_at` si esta vacio.
 *  - hoy = la fecha local de esta maquina (la misma zona que el servidor si se
 *    corre en la misma maquina; si no, puede haber diferencias en el limite del dia).
 */
import { readFileSync } from "node:fs"

// El package.json de la raiz es "type":"module": `require` no existe, asi que
// se evalua el CommonJS del hook igual que lo hace el test de core.
const src = readFileSync(new URL("../../../pb_hooks/utils/weekly_streak.js", import.meta.url), "utf8")
const mod = { exports: {} }
new Function("module", "exports", src)(mod, mod.exports)
const { computeWeeklyStreak, goalForWeekFromChanges, parseGoalLog, FALLBACK_GOAL } = mod.exports

const PB_URL = (process.env.PB_URL || "").replace(/\/$/, "")
const SU_EMAIL = process.env.PB_SU_EMAIL
const SU_PASS = process.env.PB_SU_PASS

if (!PB_URL || !SU_EMAIL || !SU_PASS) {
  console.error(
    "✗ Faltan PB_URL / PB_SU_EMAIL / PB_SU_PASS.\n" +
    "  PB_URL=http://127.0.0.1:8090 PB_SU_EMAIL=... PB_SU_PASS=... node tests/pb_hooks/manual/verify-weekly-streak.mjs"
  )
  process.exit(1)
}

function pad2(n) { return n < 10 ? "0" + n : "" + n }
function localToday() {
  const d = new Date()
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
}

let token
async function api(path) {
  const res = await fetch(`${PB_URL}${path}`, { headers: token ? { Authorization: token } : {} })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

/** Todas las filas de una coleccion, paginando. */
async function all(collection, fields) {
  const out = []
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${PB_URL}/api/collections/${collection}/records?perPage=500&page=${page}&skipTotal=1&fields=${fields}`,
      { headers: { Authorization: token } },
    )
    if (!res.ok) throw new Error(`GET ${collection} p${page} → ${res.status}: ${await res.text()}`)
    const body = await res.json()
    out.push(...body.items)
    if (body.items.length < 500) return out
  }
}

const auth = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASS }),
})
if (!auth.ok) {
  console.error(`✗ Login de superuser fallido (${auth.status}): ${await auth.text()}`)
  process.exit(1)
}
token = (await auth.json()).token

const today = localToday()
const [stats, sessions, circuits, cardios, settings] = await Promise.all([
  all("user_stats", "id,user,workout_streak_current,workout_streak_best"),
  all("sessions", "user,completed_at"),
  all("circuit_sessions", "user,started_at,finished_at"),
  all("cardio_sessions", "user,started_at,finished_at"),
  all("settings", "user,weekly_goal_log"),
])

const daysByUser = new Map()
function addDay(user, day) {
  if (!user || !day) return
  if (!daysByUser.has(user)) daysByUser.set(user, new Set())
  daysByUser.get(user).add(day)
}
for (const r of sessions) addDay(r.user, String(r.completed_at || "").slice(0, 10))
for (const r of [...circuits, ...cardios]) addDay(r.user, String(r.finished_at || r.started_at || "").slice(0, 10))

const logByUser = new Map(settings.map((s) => [s.user, parseGoalLog(s.weekly_goal_log)]))

console.log(`— hoy: ${today} · ${stats.length} filas de user_stats · objetivo por defecto ${FALLBACK_GOAL}`)

const diffs = []
for (const row of stats) {
  const expected = computeWeeklyStreak(
    [...(daysByUser.get(row.user) || [])],
    goalForWeekFromChanges(logByUser.get(row.user) || [], FALLBACK_GOAL),
    today,
  )
  const cur = row.workout_streak_current || 0
  const best = row.workout_streak_best || 0
  if (cur !== expected.current || best !== expected.best) {
    diffs.push({ user: row.user, guardado: `${cur}/${best}`, esperado: `${expected.current}/${expected.best}` })
  }
}

if (diffs.length === 0) {
  console.log("✓ TODO OK: la racha guardada coincide con el recalculo en todas las filas")
} else {
  console.log(`✗ ${diffs.length} filas difieren (current/best):`)
  for (const d of diffs) console.log(`  ${d.user}  guardado ${d.guardado}  esperado ${d.esperado}`)
  console.log("  (una fila desfasada puede ser normal si la semana acaba de cerrar: el cron del lunes la recalcula)")
}
process.exitCode = diffs.length === 0 ? 0 : 1
