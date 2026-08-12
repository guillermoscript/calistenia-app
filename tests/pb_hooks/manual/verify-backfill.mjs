/**
 * Verificacion manual del backfill de `user_stats` (migracion 1783600000, #412).
 *
 * POR QUE NO ES UN TEST NORMAL: `run.mjs` levanta PocketBase una sola vez y las
 * migraciones corren al arrancar, cuando todavia no hay ni un dato — el backfill
 * siempre veria la base vacia. Aqui hace falta el ciclo completo: sembrar datos,
 * dejar `user_stats` como estaba antes del arreglo, quitar la marca de la
 * migracion y REINICIAR para que vuelva a correr de verdad.
 *
 * Corre contra un PocketBase efimero en un tmpdir; nunca toca datos reales.
 *
 *   node tests/pb_hooks/manual/verify-backfill.mjs
 *   PB_BINARY=/ruta/a/pocketbase node tests/pb_hooks/manual/verify-backfill.mjs
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
const MIGRATION = "1783600000_backfill_user_stats_workouts.js"
const SU_EMAIL = "backfill@test.local"
const SU_PASS = "TestSuper123!"

if (!existsSync(BIN)) {
  console.error(
    `✗ No hay binario de PocketBase en ${BIN}.\n` +
    "  Exporta PB_BINARY=/ruta/a/pocketbase o coloca ./pocketbase en la raiz del repo."
  )
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), "pb-backfill-"))

function freePort() {
  return new Promise((res) => {
    const s = net.createServer()
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)) })
  })
}

const port = await freePort()

function pad2(n) { return n < 10 ? "0" + n : "" + n }
function dayOffset(delta) {
  const d = new Date()
  d.setDate(d.getDate() + delta)
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
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

const results = []
function check(label, actual, expected) {
  const ok = actual === expected
  results.push({ ok, label })
  console.log(`${ok ? "✔" : "✖"} ${label}: ${actual}${ok ? "" : ` (esperado ${expected})`}`)
}

const getLog = await startPB()
try {
  spawnSync(BIN, ["superuser", "upsert", SU_EMAIL, SU_PASS, `--dir=${dataDir}`], { encoding: "utf8" })
  await authSuper()

  // ── Usuario A: racha viva de 3 dias + un dia suelto viejo, con los 3 tipos ──
  const a = await makeUser("Atleta A", "a-backfill@test.local")
  for (const off of [-10, -2, -1, 0]) {
    await create("sessions", {
      user: a.id, workout_key: `w${off}`, phase: 1, day: "day1",
      completed_at: `${dayOffset(off)} 10:00:00`,
    })
  }
  await create("circuit_sessions", {
    user: a.id, mode: "rounds", rounds_completed: 3,
    started_at: `${dayOffset(0)}T12:00:00.000Z`, finished_at: `${dayOffset(0)}T12:30:00.000Z`,
  })
  await create("cardio_sessions", {
    user: a.id, activity_type: "run", distance_km: 5, duration_seconds: 1800,
    started_at: `${dayOffset(-1)}T12:00:00.000Z`, finished_at: `${dayOffset(-1)}T12:30:00.000Z`,
  })

  // ── Usuario B: una sola sesion vieja → racha rota ──
  const b = await makeUser("Atleta B", "b-backfill@test.local")
  await create("sessions", {
    user: b.id, workout_key: "solo", phase: 1, day: "day1",
    completed_at: `${dayOffset(-5)} 10:00:00`,
  })

  // ── Usuario C: sin ninguna sesion → no debe aparecer ──
  const c = await makeUser("Atleta C", "c-backfill@test.local")

  // Estado previo al arreglo, cubriendo las dos ramas de la migracion:
  //  - A conserva la fila con los contadores de entrenamiento a cero, un `best`
  //    historico mas alto y datos de nutricion → prueba el UPDATE.
  //  - B pierde la fila entera → prueba el INSERT.
  const existing = await api("/api/collections/user_stats/records?perPage=200")
  for (const row of existing.items) {
    if (row.user === a.id) {
      await api(`/api/collections/user_stats/records/${row.id}`, {
        method: "PATCH",
        body: {
          total_sessions: 0, workout_streak_current: 0, workout_streak_best: 10,
          last_workout_date: "", total_nutrition_logs: 42, nutrition_streak_best: 7, xp: 500,
        },
      })
    } else {
      await api(`/api/collections/user_stats/records/${row.id}`, { method: "DELETE" })
    }
  }
  console.log(`— ${existing.items.length} filas: A a cero (best=10, nutricion=42), el resto borradas`)

  await stopPB()

  const del = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del.status !== 0) throw new Error("sqlite3 fallo: " + (del.stderr || del.error?.message))

  const getLog2 = await startPB()
  await authSuper()
  console.log("— log del backfill:", (getLog2().match(/\[backfill_user_stats\].*/g) || []).slice(-1)[0] || "(ninguno)")

  const after = await api("/api/collections/user_stats/records?perPage=200")
  const byUser = Object.fromEntries(after.items.map((r) => [r.user, r]))

  console.log("\n── A: 4 fuerza + 1 circuito + 1 cardio; dias -10, -2, -1, 0 ──")
  const sa = byUser[a.id] || {}
  check("total_sessions suma los tres tipos", sa.total_sessions, 6)
  check("workout_streak_best no retrocede desde 10", sa.workout_streak_best, 10)
  check("workout_streak_current (viva, acaba hoy)", sa.workout_streak_current, 3)
  check("last_workout_date", sa.last_workout_date, dayOffset(0))
  check("total_nutrition_logs intacto", sa.total_nutrition_logs, 42)
  check("nutrition_streak_best intacto", sa.nutrition_streak_best, 7)
  check("xp intacto", sa.xp, 500)

  console.log("\n── B: 1 sesion hace 5 dias, sin fila previa ──")
  const sb = byUser[b.id] || {}
  check("total_sessions", sb.total_sessions, 1)
  check("workout_streak_best", sb.workout_streak_best, 1)
  check("workout_streak_current (rota → 0)", sb.workout_streak_current, 0)
  check("last_workout_date", sb.last_workout_date, dayOffset(-5))
  check("level arranca en 1", sb.level, 1)

  console.log("\n── C: sin sesiones ──")
  check("no se le crea fila", byUser[c.id] === undefined, true)

  // ── Idempotencia: correrla otra vez no puede duplicar nada ──────────────────
  // Importa porque si el backfill falla a medias se reintenta borrando su fila
  // de `_migrations` y reiniciando; recomputar tiene que dar lo mismo.
  await stopPB()
  const del2 = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del2.status !== 0) throw new Error("sqlite3 fallo: " + del2.stderr)

  await startPB()
  await authSuper()
  const twice = await api("/api/collections/user_stats/records?perPage=200")
  const byUser2 = Object.fromEntries(twice.items.map((r) => [r.user, r]))

  console.log("\n── Segunda pasada del backfill (idempotencia) ──")
  check("no se duplican filas", twice.items.length, after.items.length)
  check("A total_sessions sigue igual", byUser2[a.id]?.total_sessions, 6)
  check("A racha sigue igual", byUser2[a.id]?.workout_streak_current, 3)
  check("B total_sessions sigue igual", byUser2[b.id]?.total_sessions, 1)

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
