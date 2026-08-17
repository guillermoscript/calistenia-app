/**
 * Verificacion manual del cierre EN SILENCIO del backlog de retos caducados
 * (migracion 1784400000, #515).
 *
 * POR QUE NO ES UN TEST NORMAL: `run.mjs` levanta PocketBase una sola vez y las
 * migraciones corren al arrancar, cuando todavia no hay ni un dato — la
 * migracion siempre veria la base vacia. Aqui hace falta el ciclo completo:
 * sembrar retos caducados, quitar la marca de la migracion y REINICIAR para que
 * vuelva a correr de verdad.
 *
 * QUE SE COMPRUEBA, y por que es lo unico que importa: la migracion escribe con
 * SQL crudo para NO pasar por `app.save()`, porque
 * `pb_hooks/notification_service.pb.js` manda notificacion + push a todos los
 * participantes en cuanto una fila de `challenges` pasa a `ended`. Si alguien la
 * reescribe con `findRecordsByFilter` + `app.save`, la primera pasada en
 * produccion es una tormenta de notificaciones sobre retos que la gente termino
 * hace meses. Este script falla justo ahi.
 *
 * Corre contra un PocketBase efimero en un tmpdir; nunca toca datos reales.
 *
 *   node tests/pb_hooks/manual/verify-expired-backlog.mjs
 *   PB_BINARY=/ruta/a/pocketbase node tests/pb_hooks/manual/verify-expired-backlog.mjs
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
const MIGRATION = "1784400000_close_expired_challenges_backlog.js"
const SU_EMAIL = "expiry@test.local"
const SU_PASS = "TestSuper123!"

if (!existsSync(BIN)) {
  console.error(
    `✗ No hay binario de PocketBase en ${BIN}.\n` +
    "  Exporta PB_BINARY=/ruta/a/pocketbase o coloca ./pocketbase en la raiz del repo."
  )
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), "pb-expiry-"))

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

  const creator = await makeUser("Creador Backlog", "creator-expiry@test.local")
  const participant = await makeUser("Participante Backlog", "part-expiry@test.local")

  // El backlog real: retos que terminaron hace meses y siguen 'active' porque su
  // creador nunca volvio a abrir la app.
  const backlog = []
  for (const off of [-400, -120, -30, -3]) {
    const ch = await create("challenges", {
      creator: creator.id, title: `Reto caducado ${off}`, metric: "sessions",
      starts_at: dayOffset(off - 7), ends_at: dayOffset(off), status: "active",
    })
    await create("challenge_participants", { challenge: ch.id, user: participant.id })
    backlog.push(ch)
  }

  // Controles que la migracion NO debe tocar.
  const endsToday = await create("challenges", {
    creator: creator.id, title: "Reto que acaba hoy", metric: "sessions",
    starts_at: dayOffset(-5), ends_at: dayOffset(0), status: "active",
  })
  const future = await create("challenges", {
    creator: creator.id, title: "Reto futuro", metric: "sessions",
    starts_at: dayOffset(0), ends_at: dayOffset(30), status: "active",
  })

  // Las notificaciones de la siembra (unirse a un reto notifica al creador) se
  // borran para que el recuento posterior mida SOLO lo que hizo la migracion.
  const seeded = await api("/api/collections/notifications/records?perPage=500")
  for (const n of seeded.items) {
    await api(`/api/collections/notifications/records/${n.id}`, { method: "DELETE" })
  }
  console.log(`— sembrados ${backlog.length} retos caducados + 2 vigentes; ${seeded.items.length} notificaciones de siembra borradas`)

  await stopPB()

  const del = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del.status !== 0) throw new Error("sqlite3 fallo: " + (del.stderr || del.error?.message))

  const getLog2 = await startPB()
  await authSuper()
  console.log("— log de la migracion:", (getLog2().match(/\[close_expired_challenges_backlog\].*/g) || []).slice(-1)[0] || "(ninguno)")

  const after = await api("/api/collections/challenges/records?perPage=500")
  const byId = Object.fromEntries(after.items.map((r) => [r.id, r]))

  console.log("\n── El backlog queda cerrado ──")
  for (const ch of backlog) {
    check(`"${ch.title}" pasa a ended`, byId[ch.id]?.status, "ended")
  }

  console.log("\n── Los vigentes no se tocan ──")
  check("el reto que acaba hoy sigue activo", byId[endsToday.id]?.status, "active")
  check("el reto futuro sigue activo", byId[future.id]?.status, "active")

  // LA comprobacion del issue: cerrar el backlog no puede notificar a nadie.
  console.log("\n── Y sobre todo: en silencio ──")
  const notifs = await api("/api/collections/notifications/records?perPage=500")
  const complete = notifs.items.filter((n) => n.type === "challenge_complete")
  check("cero notificaciones challenge_complete", complete.length, 0)
  check("cero notificaciones de cualquier tipo", notifs.items.length, 0)

  // Idempotencia: si la migracion falla a medias se reintenta borrando su fila de
  // `_migrations` y reiniciando. La segunda pasada ya no encuentra nada que hacer
  // — y sigue sin notificar.
  await stopPB()
  const del2 = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del2.status !== 0) throw new Error("sqlite3 fallo: " + del2.stderr)

  const getLog3 = await startPB()
  await authSuper()
  console.log("\n── Segunda pasada (idempotencia) ──")
  console.log("— log:", (getLog3().match(/\[close_expired_challenges_backlog\].*/g) || []).slice(-1)[0] || "(ninguno)")
  const twice = await api("/api/collections/challenges/records?perPage=500")
  const byId2 = Object.fromEntries(twice.items.map((r) => [r.id, r]))
  check("el reto que acaba hoy sigue activo", byId2[endsToday.id]?.status, "active")
  const notifs2 = await api("/api/collections/notifications/records?perPage=500")
  check("sigue sin notificaciones", notifs2.items.length, 0)

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
