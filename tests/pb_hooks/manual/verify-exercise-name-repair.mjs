/**
 * Verificación manual de la reparación de `program_exercises.exercise_name`
 * (migración 1786500000, generada por
 * scripts/generate-exercise-name-repair-migration.mjs).
 *
 * POR QUÉ NO ES UN TEST NORMAL: `run.mjs` levanta PocketBase una sola vez y las
 * migraciones corren al arrancar, cuando todavía no hay ni un dato — la
 * migración siempre vería la base vacía. Aquí hace falta el ciclo completo:
 * sembrar filas con la forma rota real, quitar la marca de la migración y
 * REINICIAR para que vuelva a correr de verdad.
 *
 * QUÉ SE COMPRUEBA: la regla conservadora. Un slug del catálogo en el nombre se
 * sustituye por el `name {es,en}` del catálogo; un nombre humano pasa intacto;
 * una clave de máquina que no resuelve pasa intacta; un nombre vacío se rellena
 * desde `exercise_id` si es id de catálogo; un alias listado a mano resuelve. Y
 * `exercise_id` no cambia en ninguna fila.
 *
 * Corre contra un PocketBase efímero en un tmpdir; nunca toca datos reales.
 *
 *   node tests/pb_hooks/manual/verify-exercise-name-repair.mjs
 *   PB_BINARY=/ruta/a/pocketbase node tests/pb_hooks/manual/verify-exercise-name-repair.mjs
 *
 * Necesita `sqlite3` en el PATH (viene con macOS y la mayoría de distros).
 */
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import net from "node:net"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const BIN = process.env.PB_BINARY || join(ROOT, "pocketbase")
const MIGRATION = "1786500000_repair_program_exercise_names.js"
const SU_EMAIL = "names@test.local"
const SU_PASS = "TestSuper123!"

if (!existsSync(BIN)) {
  console.error(
    `✗ No hay binario de PocketBase en ${BIN}.\n` +
    "  Exporta PB_BINARY=/ruta/a/pocketbase o coloca ./pocketbase en la raíz del repo."
  )
  process.exit(1)
}

// Casos sacados del catálogo real para que el script no se quede viejo si
// cambian los nombres.
const catalog = JSON.parse(readFileSync(join(ROOT, "packages/core/data/exercise-catalog.json"), "utf-8"))
const entries = Object.values(catalog.categories).flatMap((c) => c.exercises || [])
const byId = Object.fromEntries(entries.map((e) => [e.id, e]))
const withSlug = entries.find((e) => e.seed_slug && e.seed_slug !== e.id)
if (!byId.arm_circles || !byId.pushup_std || !byId.sit_up || !withSlug) {
  console.error("✗ El catálogo ya no tiene arm_circles / pushup_std / sit_up / una entrada con seed_slug; actualiza los casos")
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), "pb-names-"))

function freePort() {
  return new Promise((res) => {
    const s = net.createServer()
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)) })
  })
}
const port = await freePort()

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
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return () => log } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("PocketBase no arrancó:\n" + log)
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

const results = []
// PocketBase devuelve las claves del json ordenadas (`en` antes que `es`); se
// compara por contenido, no por orden.
const canon = (v) => JSON.stringify(v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort()) : v)
function check(label, actual, expected) {
  const ok = canon(actual) === canon(expected)
  results.push({ ok, label })
  console.log(`${ok ? "✔" : "✖"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (esperado ${JSON.stringify(expected)})`}`)
}

const getLog = await startPB()
try {
  spawnSync(BIN, ["superuser", "upsert", SU_EMAIL, SU_PASS, `--dir=${dataDir}`], { encoding: "utf8" })
  await authSuper()

  const owner = await create("users", {
    email: "owner-names@test.local", password: "TestUser123!", passwordConfirm: "TestUser123!",
    name: "Dueño", display_name: "Dueño",
  })
  const program = await create("programs", {
    name: { es: "Programa con slugs", en: "Program with slugs" }, description: { es: "qa" },
    created_by: owner.id, duration_weeks: 4, difficulty: "intermediate", is_active: true,
  })

  const base = { program: program.id, phase_number: 1, day_id: "lun", sets: 3, reps: "10", sort_order: 1 }
  // La forma rota real de prod: slot key en exercise_id, slug en exercise_name.
  const cases = {
    slug: await create("program_exercises", { ...base, exercise_id: "lun_1_1", exercise_name: { es: "arm_circles" } }),
    human: await create("program_exercises", { ...base, exercise_id: "lun_1_2", exercise_name: { es: "Mi ejercicio raro", en: "My odd exercise" } }),
    unknown: await create("program_exercises", { ...base, exercise_id: "lun_1_3", exercise_name: { es: "no_existe_en_catalogo" } }),
    emptyName: await create("program_exercises", { ...base, exercise_id: "pushup_std", exercise_name: { es: "" } }),
    seedSlug: await create("program_exercises", { ...base, exercise_id: "lun_1_5", exercise_name: { es: withSlug.seed_slug } }),
    alias: await create("program_exercises", { ...base, exercise_id: "vie_2_9", exercise_name: { es: "sit_ups" } }),
    singleWordId: await create("program_exercises", { ...base, exercise_id: "lun_1_7", exercise_name: { es: "sit_up" } }),
  }
  console.log(`— sembradas ${Object.keys(cases).length} filas de program_exercises`)

  await stopPB()

  const del = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del.status !== 0) throw new Error("sqlite3 falló: " + (del.stderr || del.error?.message))

  const getLog2 = await startPB()
  await authSuper()
  console.log("— log de la migración:", (getLog2().match(/\[repair_program_exercise_names\].*/g) || []).slice(-1)[0] || "(ninguno)")

  const after = {}
  for (const [k, rec] of Object.entries(cases)) after[k] = await api(`/api/collections/program_exercises/records/${rec.id}`)

  console.log("\n── Se repara lo que es clave de máquina y resuelve ──")
  check("slug del catálogo → nombre {es,en}", after.slug.exercise_name, byId.arm_circles.name)
  check("nombre vacío + exercise_id de catálogo → nombre", after.emptyName.exercise_name, byId.pushup_std.name)
  check("seed_slug → nombre", after.seedSlug.exercise_name, withSlug.name)
  check("alias listado a mano (sit_ups) → nombre", after.alias.exercise_name, byId.sit_up.name)
  check("id de una sola palabra como nombre → nombre", after.singleWordId.exercise_name, byId.sit_up.name)

  console.log("\n── Lo que NO se toca ──")
  check("nombre humano intacto", after.human.exercise_name, { es: "Mi ejercicio raro", en: "My odd exercise" })
  check("clave de máquina que no resuelve, intacta", after.unknown.exercise_name, { es: "no_existe_en_catalogo" })
  for (const [k, rec] of Object.entries(cases)) check(`exercise_id de «${k}» no cambia`, after[k].exercise_id, rec.exercise_id)

  console.log("\n── Idempotencia ──")
  await stopPB()
  spawnSync("sqlite3", [join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`], { encoding: "utf8" })
  const getLog3 = await startPB()
  const second = (getLog3().match(/\[repair_program_exercise_names\] (\d+) filas reparadas/) || [])[1]
  check("segunda pasada repara 0 filas", second, "0")
} finally {
  await stopPB()
}

const failed = results.filter((r) => !r.ok)
console.log(failed.length === 0 ? `\n✓ ${results.length} comprobaciones OK` : `\n✗ ${failed.length}/${results.length} comprobaciones fallaron`)
process.exit(failed.length === 0 ? 0 : 1)
