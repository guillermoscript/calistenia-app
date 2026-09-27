/**
 * Verificacion manual del recomputo a racha SEMANAL (migracion 1790320000, #801).
 *
 * Mismo motivo que `verify-backfill.mjs` para no ser un test normal: las
 * migraciones corren al arrancar, con la base vacia. Aqui se siembran sesiones,
 * se deja `user_stats` con rachas EN DIAS (como en produccion antes del
 * despliegue), se quita la marca de la migracion y se reinicia.
 *
 * Corre contra un PocketBase efimero en un tmpdir; nunca toca datos reales.
 *
 *   node tests/pb_hooks/manual/verify-weekly-streak.mjs
 *   PB_BINARY=/ruta/a/pocketbase node tests/pb_hooks/manual/verify-weekly-streak.mjs
 *
 * Necesita `sqlite3` en el PATH (viene con macOS y la mayoria de distros).
 */
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import net from "node:net"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const BIN = process.env.PB_BINARY || join(ROOT, "pocketbase")
const MIGRATION = "1790320000_weekly_streak.js"
const SU_EMAIL = "weekly@test.local"
const SU_PASS = "TestSuper123!"

if (!existsSync(BIN)) {
  console.error(
    `✗ No hay binario de PocketBase en ${BIN}.\n` +
    "  Exporta PB_BINARY=/ruta/a/pocketbase o coloca ./pocketbase en la raiz del repo."
  )
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), "pb-weekly-streak-"))

function freePort() {
  return new Promise((res) => {
    const s = net.createServer()
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)) })
  })
}

const port = await freePort()

function pad2(n) { return n < 10 ? "0" + n : "" + n }
function localToday() {
  const d = new Date()
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
}
/** Lunes de esta semana + `weeks` semanas + `day` dias (0 = lunes ... 6 = domingo). */
function weekDay(weeks, day) {
  const d = new Date(`${localToday()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + weeks * 7 + day)
  return d.toISOString().slice(0, 10)
}

let pb
async function startPB() {
  pb = spawn(BIN, [
    "serve", `--http=127.0.0.1:${port}`, `--dir=${dataDir}`,
    `--migrationsDir=${join(ROOT, "pb_migrations")}`, `--hooksDir=${join(ROOT, "pb_hooks")}`,
  ])
  let log = ""
  pb.stdout.on("data", (d) => (log += d))
  pb.stderr.on("data", (d) => (log += d))
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return () => log } catch { /* aun no */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("PocketBase no arranco:\n" + log)
}
function stopPB() {
  return new Promise((res) => { pb.on("exit", res); pb.kill("SIGTERM") })
}

let token
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const create = (col, data) => api(`/api/collections/${col}/records`, { method: "POST", body: data })
const authSuper = async () => {
  token = (await api("/api/collections/_superusers/auth-with-password", {
    method: "POST", body: { identity: SU_EMAIL, password: SU_PASS },
  })).token
}
const makeUser = (name, email) => create("users", {
  email, password: "TestUser123!", passwordConfirm: "TestUser123!", name, display_name: name,
})
const strength = (user, day, key) => create("sessions", {
  user: user.id, workout_key: key, phase: 1, day: "day1", completed_at: `${day} 10:00:00`,
})

const results = []
function check(label, actual, expected) {
  const ok = actual === expected
  results.push({ ok, label })
  console.log(`${ok ? "✔" : "✖"} ${label}: ${actual}${ok ? "" : ` (esperado ${expected})`}`)
}

function rerunMigration() {
  const del = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del.status !== 0) throw new Error("sqlite3 fallo: " + (del.stderr || del.error?.message))
}

const getLog = await startPB()
try {
  spawnSync(BIN, ["superuser", "upsert", SU_EMAIL, SU_PASS, `--dir=${dataDir}`], { encoding: "utf8" })
  await authSuper()

  // ── A: 3 semanas cumplidas hace tiempo, hueco, 2 cumplidas (-2, -1) y esta
  //       semana solo el lunes. Mezcla los tres tipos de sesion.
  const a = await makeUser("Atleta A", "a-weekly@test.local")
  for (const w of [-6, -5, -4]) {
    await strength(a, weekDay(w, 0), `old${w}a`)
    await strength(a, weekDay(w, 3), `old${w}b`)
  }
  await strength(a, weekDay(-2, 0), "w-2a")
  await create("circuit_sessions", {
    user: a.id, mode: "rounds", rounds_completed: 3,
    started_at: `${weekDay(-2, 2)}T12:00:00.000Z`, finished_at: `${weekDay(-2, 2)}T12:30:00.000Z`,
  })
  await create("cardio_sessions", {
    user: a.id, activity_type: "run", distance_km: 5, duration_seconds: 1800,
    started_at: `${weekDay(-1, 1)}T12:00:00.000Z`, finished_at: `${weekDay(-1, 1)}T12:30:00.000Z`,
  })
  await strength(a, weekDay(-1, 4), "w-1b")
  await strength(a, weekDay(-1, 4), "w-1b-bis") // mismo dia: no es un segundo dia
  await strength(a, weekDay(0, 0), "w0a")

  // ── B: una semana cumplida hace 3 semanas y nada desde entonces → rota.
  const b = await makeUser("Atleta B", "b-weekly@test.local")
  await strength(b, weekDay(-3, 1), "b1")
  await strength(b, weekDay(-3, 5), "b2")

  // ── C: fila con racha en dias pero sin ninguna sesion.
  const c = await makeUser("Atleta C", "c-weekly@test.local")
  await create("user_stats", { user: c.id, level: 1 })

  // Estado previo al despliegue: rachas EN DIAS, un best en dias mas alto que
  // cualquier racha semanal posible, y sin estado semanal.
  const existing = await api("/api/collections/user_stats/records?perPage=200")
  for (const row of existing.items) {
    await api(`/api/collections/user_stats/records/${row.id}`, {
      method: "PATCH",
      body: {
        workout_streak_current: 9, workout_streak_best: 40,
        streak_week_start: "", streak_week_mask: 0, total_nutrition_logs: 42,
      },
    })
  }
  console.log(`— ${existing.items.length} filas con racha en dias (9 / best 40)`)

  await stopPB()
  rerunMigration()
  const getLog2 = await startPB()
  await authSuper()
  console.log("— log:", (getLog2().match(/\[weekly_streak\].*/g) || []).slice(-1)[0] || "(ninguno)")

  const after = await api("/api/collections/user_stats/records?perPage=200")
  const byUser = Object.fromEntries(after.items.map((r) => [r.user, r]))

  console.log("\n── A: 3 semanas viejas + hueco + 2 recientes + lunes de esta ──")
  const sa = byUser[a.id] || {}
  check("workout_streak_current = 2 (semanas -2 y -1; esta aun sin cumplir)", sa.workout_streak_current, 2)
  check("workout_streak_best = 3 (se sobrescribe, no MAX con los 40 dias)", sa.workout_streak_best, 3)
  check("streak_week_start = lunes de esta semana", sa.streak_week_start, weekDay(0, 0))
  check("streak_week_mask = solo el lunes", sa.streak_week_mask, 1)
  check("total_nutrition_logs intacto", sa.total_nutrition_logs, 42)

  console.log("\n── B: una semana cumplida hace 3 semanas ──")
  const sb = byUser[b.id] || {}
  check("workout_streak_current (rota → 0)", sb.workout_streak_current, 0)
  check("workout_streak_best", sb.workout_streak_best, 1)
  check("streak_week_start", sb.streak_week_start, weekDay(-3, 0))
  check("streak_week_mask = martes y sabado", sb.streak_week_mask, 2 | 32)

  console.log("\n── C: fila sin sesiones ──")
  const sc = byUser[c.id] || {}
  check("workout_streak_current → 0", sc.workout_streak_current, 0)
  check("workout_streak_best → 0", sc.workout_streak_best, 0)
  check("streak_week_start vacio", sc.streak_week_start, "")

  // ── El hook sigue desde el estado recomputado ───────────────────────────────
  // A entrena otro dia de esta semana → la semana se cumple → 2 → 3.
  const aDay2 = weekDay(0, 0) === localToday() ? weekDay(0, 1) : localToday()
  await strength(a, aDay2, "w0b")
  await new Promise((r) => setTimeout(r, 500))
  const sa2 = (await api(`/api/collections/user_stats/records?filter=${encodeURIComponent(`user='${a.id}'`)}`)).items[0]
  console.log("\n── El hook continua desde el recomputo ──")
  check("A cumple esta semana → racha 3", sa2.workout_streak_current, 3)
  check("A best acompaña", sa2.workout_streak_best, 3)

  // ── Idempotencia ─────────────────────────────────────────────────────────────
  await stopPB()
  rerunMigration()
  await startPB()
  await authSuper()
  const twice = await api("/api/collections/user_stats/records?perPage=200")
  const byUser2 = Object.fromEntries(twice.items.map((r) => [r.user, r]))
  console.log("\n── Segunda pasada (idempotencia) ──")
  check("no se duplican filas", twice.items.length, after.items.length)
  check("A racha sigue en 3", byUser2[a.id]?.workout_streak_current, 3)
  check("B racha sigue en 0", byUser2[b.id]?.workout_streak_current, 0)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length === 0 ? "✓ TODO OK" : `✗ ${failed.length} comprobaciones fallaron`}`)
  process.exitCode = failed.length === 0 ? 0 : 1
} catch (err) {
  console.error("ERROR:", err.message)
  console.error(getLog().split("\n").slice(-25).join("\n"))
  process.exitCode = 1
} finally {
  try { await stopPB() } catch { /* ya estaba muerto */ }
}
