/**
 * Verificación manual de la traducción al español de
 * `program_exercises.exercise_name` (migración 1786700000, generada por
 * scripts/generate-exercise-name-translation-migration.mjs).
 *
 * POR QUÉ NO ES UN TEST NORMAL: `run.mjs` levanta PocketBase una sola vez y las
 * migraciones corren al arrancar, cuando todavía no hay ni un dato — la
 * migración siempre vería la base vacía. Aquí hace falta el ciclo completo:
 * sembrar filas con la forma real de producción, quitar la marca de la
 * migración y REINICIAR para que vuelva a correr de verdad.
 *
 * QUÉ SE COMPRUEBA: la regla conservadora. Un `es` que sigue siendo el nombre
 * INGLÉS del catálogo (o el `es` viejo, también inglés) se sustituye por la
 * traducción; un nombre escrito por una persona pasa intacto; un préstamo que
 * se dejó a propósito en inglés (Hollow Body Hold) pasa intacto; las claves
 * extra del json se conservan; un `es` vacío no se rellena. Y `exercise_id` no
 * cambia en ninguna fila.
 *
 * Corre contra un PocketBase efímero en un tmpdir; nunca toca datos reales.
 *
 *   node tests/pb_hooks/manual/verify-exercise-name-translation.mjs
 *   PB_BINARY=/ruta/a/pocketbase node tests/pb_hooks/manual/verify-exercise-name-translation.mjs
 *
 * Necesita `sqlite3` en el PATH (viene con macOS y la mayoría de distros).
 */
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import net from "node:net"

import { TRANSLATIONS } from "../../../scripts/generate-exercise-name-translation-migration.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const BIN = process.env.PB_BINARY || join(ROOT, "pocketbase")
const MIGRATION = "1786700000_translate_program_exercise_names_es.js"
const SU_EMAIL = "translate@test.local"
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

// Una entrada traducida cuyo `es` VIEJO ya era distinto del `en` («Glute Bridge
// Unilateral» vs «Unilateral Glute Bridge»): prueba la segunda vía de resolución.
const withOldEs = Object.keys(TRANSLATIONS).find(
  (id) => byId[id] && TRANSLATIONS[id].toLowerCase() !== byId[id].name.en.toLowerCase()
)
// Una entrada traducida con `seed_slug` propio: prueba la vía del slug.
const withSlug = Object.keys(TRANSLATIONS).find(
  (id) => byId[id]?.seed_slug && byId[id].seed_slug !== id
)

if (!byId.plank || !byId.arm_circles || !byId.hollow_hold || !withOldEs || !withSlug) {
  console.error("✗ El catálogo ya no tiene plank / arm_circles / hollow_hold / una entrada con es viejo propio / una con seed_slug; actualiza los casos")
  process.exit(1)
}
if (TRANSLATIONS.hollow_hold) {
  console.error("✗ hollow_hold entró en la tabla de traducción; era el caso de «préstamo intacto»")
  process.exit(1)
}

const OLD = byId[withOldEs]
const SLUG = byId[withSlug]

const dataDir = mkdtempSync(join(tmpdir(), "pb-translate-"))

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
    email: "owner-translate@test.local", password: "TestUser123!", passwordConfirm: "TestUser123!",
    name: "Dueño", display_name: "Dueño",
  })
  const program = await create("programs", {
    name: { es: "Programa en inglés", en: "Program in English" }, description: { es: "qa" },
    created_by: owner.id, duration_weeks: 4, difficulty: "intermediate", is_active: true,
  })

  const base = { program: program.id, phase_number: 1, day_id: "lun", sets: 3, reps: "10", sort_order: 1 }
  // La forma real que dejó en prod la migración 1786500000: el par {es,en} del
  // catálogo VIEJO, con una clave de slot en exercise_id.
  const cases = {
    // «Intermedio · Hipertrofia» mie_1_10 en prod: {"es":"Plank","en":"Plank"}
    plank: await create("program_exercises", { ...base, exercise_id: "mie_1_10", exercise_name: { es: byId.plank.name.en, en: byId.plank.name.en } }),
    // «Intermedio · Hipertrofia» lun_1_1 en prod: {"es":"Arm Circles","en":"Arm Circles"}
    armCircles: await create("program_exercises", { ...base, exercise_id: "lun_1_1", exercise_name: { es: byId.arm_circles.name.en, en: byId.arm_circles.name.en } }),
    // `es` viejo distinto del `en`: se resuelve por el nombre viejo.
    oldEs: await create("program_exercises", { ...base, exercise_id: "lun_1_2", exercise_name: { es: TRANSLATIONS[withOldEs], en: OLD.name.en } }),
    // Resolución por seed_slug en exercise_id.
    bySlug: await create("program_exercises", { ...base, exercise_id: SLUG.seed_slug, exercise_name: { es: SLUG.name.en } }),
    // Resolución por id de catálogo en exercise_id.
    byCatalogId: await create("program_exercises", { ...base, exercise_id: "plank", exercise_name: { es: byId.plank.name.en } }),
    // Claves extra del json: se conservan.
    extraKeys: await create("program_exercises", { ...base, exercise_id: "lun_1_3", exercise_name: { es: byId.plank.name.en, en: byId.plank.name.en, pt: "Prancha" } }),
    // Nombre escrito por una persona: intacto.
    human: await create("program_exercises", { ...base, exercise_id: "plank", exercise_name: { es: "Mi plancha de siempre", en: "My usual plank" } }),
    // Préstamo que se deja en inglés a propósito: intacto.
    loanword: await create("program_exercises", { ...base, exercise_id: "lun_1_4", exercise_name: { es: byId.hollow_hold.name.es, en: byId.hollow_hold.name.en } }),
    // `es` vacío: esta migración NO rellena (eso lo hace la 1786500000).
    emptyEs: await create("program_exercises", { ...base, exercise_id: "arm_circles", exercise_name: { es: "" } }),
    // Ejercicio que no está en la tabla de traducción: intacto.
    untouched: await create("program_exercises", { ...base, exercise_id: "lun_1_5", exercise_name: { es: "Burpees", en: "Burpees" } }),
  }
  console.log(`— sembradas ${Object.keys(cases).length} filas de program_exercises`)

  await stopPB()

  const del = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del.status !== 0) throw new Error("sqlite3 falló: " + (del.stderr || del.error?.message))

  const getLog2 = await startPB()
  await authSuper()
  console.log("— log de la migración:", (getLog2().match(/\[translate_program_exercise_names_es\].*/g) || []).slice(-1)[0] || "(ninguno)")

  const after = {}
  for (const [k, rec] of Object.entries(cases)) after[k] = await api(`/api/collections/program_exercises/records/${rec.id}`)

  console.log("\n── Se traduce lo que sigue siendo el nombre de máquina ──")
  check("«Plank» → «Plancha»", after.plank.exercise_name, byId.plank.name)
  check("«Arm Circles» → «Círculos de Brazos»", after.armCircles.exercise_name, byId.arm_circles.name)
  check(`es viejo «${TRANSLATIONS[withOldEs]}» → «${OLD.name.es}»`, after.oldEs.exercise_name, OLD.name)
  check(`seed_slug «${SLUG.seed_slug}» → «${SLUG.name.es}»`, after.bySlug.exercise_name, SLUG.name)
  check("id de catálogo en exercise_id → traducido", after.byCatalogId.exercise_name, byId.plank.name)
  check("claves extra del json conservadas", after.extraKeys.exercise_name, { ...byId.plank.name, pt: "Prancha" })

  console.log("\n── Lo que NO se toca ──")
  check("nombre humano intacto", after.human.exercise_name, { es: "Mi plancha de siempre", en: "My usual plank" })
  check("préstamo (Hollow Body Hold) intacto", after.loanword.exercise_name, byId.hollow_hold.name)
  check("es vacío no se rellena", after.emptyEs.exercise_name, { es: "" })
  check("ejercicio fuera de la tabla intacto", after.untouched.exercise_name, { es: "Burpees", en: "Burpees" })
  for (const [k, rec] of Object.entries(cases)) check(`exercise_id de «${k}» no cambia`, after[k].exercise_id, rec.exercise_id)

  console.log("\n── Ninguna fila se queda con el nombre inglés de un id traducido ──")
  const machine = new Set()
  for (const [id, oldEs] of Object.entries(TRANSLATIONS)) {
    if (!byId[id]) continue
    machine.add(oldEs.trim().toLowerCase())
    machine.add(byId[id].name.en.trim().toLowerCase())
  }
  // Los casos «human», «loanword», «emptyEs» y «untouched» no llevan nombre de
  // máquina de un id traducido, así que la lista tiene que quedar vacía entera.
  const leftovers = Object.entries(after)
    .filter(([, rec]) => machine.has(String(rec.exercise_name?.es || "").trim().toLowerCase()))
    .map(([k]) => k)
  check("filas con es inglés de un id traducido", leftovers, [])

  console.log("\n── Idempotencia ──")
  await stopPB()
  spawnSync("sqlite3", [join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`], { encoding: "utf8" })
  const getLog3 = await startPB()
  const second = (getLog3().match(/\[translate_program_exercise_names_es\] (\d+) filas traducidas/) || [])[1]
  check("segunda pasada traduce 0 filas", second, "0")
} finally {
  await stopPB()
}

const failed = results.filter((r) => !r.ok)
console.log(failed.length === 0 ? `\n✓ ${results.length} comprobaciones OK` : `\n✗ ${failed.length}/${results.length} comprobaciones fallaron`)
process.exit(failed.length === 0 ? 0 : 1)
