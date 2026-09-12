/**
 * Verificación manual del backfill de `programs.visibility`
 * (migración 1785000000_programs_visibility.js, #603).
 *
 * POR QUÉ NO ES UN TEST NORMAL: `run.mjs` levanta PocketBase una sola vez y las
 * migraciones corren al arrancar, con la base vacía — el backfill siempre vería
 * cero filas y el test pasaría en verde sin probar nada. Aquí hace falta el
 * ciclo completo: sembrar programas como estaban ANTES de #603 (sin
 * `visibility`), quitar la marca de la migración y REINICIAR para que el
 * UPDATE corra de verdad sobre datos.
 *
 * Lo que se comprueba son las dos mitades del `WHERE`:
 *   - las filas sin valor pasan a `public` (nadie pierde acceso a lo que ya
 *     veía: hoy esos programas son públicos de facto);
 *   - las filas que YA tienen un valor no se tocan — si el backfill pisara un
 *     `private` explícito, publicaría el borrador de alguien.
 *
 * Corre contra un PocketBase efímero en un tmpdir; nunca toca datos reales.
 *
 *   node tests/pb_hooks/manual/verify-visibility-backfill.mjs
 *   PB_BINARY=/ruta/a/pocketbase node tests/pb_hooks/manual/verify-visibility-backfill.mjs
 *
 * Necesita `sqlite3` en el PATH (viene con macOS y la mayoría de distros).
 */
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import net from "node:net"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const BIN = process.env.PB_BINARY || join(ROOT, "pocketbase")
const MIGRATION = "1785000000_programs_visibility.js"
const SU_EMAIL = "visibility@test.local"
const SU_PASS = "TestSuper123!"

if (!existsSync(BIN)) {
  console.error(
    `✗ No hay binario de PocketBase en ${BIN}.\n` +
    "  Exporta PB_BINARY=/ruta/a/pocketbase o coloca ./pocketbase en la raíz del repo."
  )
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), "pb-visibility-"))

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
const patch = (col, id, data) => api(`/api/collections/${col}/records/${id}`, { method: "PATCH", body: data })
const authSuper = async () => {
  token = (await api("/api/collections/_superusers/auth-with-password", {
    method: "POST", body: { identity: SU_EMAIL, password: SU_PASS },
  })).token
}

const results = []
function check(label, actual, expected) {
  const ok = actual === expected
  results.push({ ok, label })
  console.log(`${ok ? "✔" : "✖"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (esperado ${JSON.stringify(expected)})`}`)
}

/** Programa creado como superuser (bypassa las API rules a propósito). */
async function makeProgram(name, extra = {}) {
  return create("programs", {
    name: { es: name, en: name },
    description: { es: "", en: "" },
    duration_weeks: 4,
    is_active: true,
    ...extra,
  })
}

const getLog = await startPB()
try {
  spawnSync(BIN, ["superuser", "upsert", SU_EMAIL, SU_PASS, `--dir=${dataDir}`], { encoding: "utf8" })
  await authSuper()

  const owner = await create("users", {
    email: "owner-visibility@test.local", password: "TestUser123!",
    passwordConfirm: "TestUser123!", name: "Duena", display_name: "Duena",
  })

  // ── Estado "pre-#603": filas con el select vacío ────────────────────────────
  // Es exactamente lo que había antes de la migración (la columna no existía) y
  // lo que sigue creando un cliente móvil viejo que no manda el campo.
  const legacyPlain = await makeProgram("Legacy sin dueño", { visibility: "" })
  const legacyOwned = await makeProgram("Legacy con dueño", { visibility: "", created_by: owner.id })
  const legacyOfficial = await makeProgram("Legacy oficial", { visibility: "", is_official: true })

  // ── Filas que YA eligieron: el backfill NO debe tocarlas ────────────────────
  const explicitPrivate = await makeProgram("Borrador explícito", { visibility: "private", created_by: owner.id })
  const explicitLink = await makeProgram("Enlace explícito", { visibility: "link", created_by: owner.id })
  const explicitPublic = await makeProgram("Público explícito", { visibility: "public", created_by: owner.id })

  // El seed de yoga de 1775100006 corre ANTES que esta migración, así que en
  // este arranque ya llegó a `public`. Lo devolvemos a vacío para que la
  // segunda pasada tenga que arreglarlo otra vez.
  const seeded = (await api('/api/collections/programs/records?perPage=200')).items
    .filter((p) => ![legacyPlain, legacyOwned, legacyOfficial, explicitPrivate, explicitLink, explicitPublic]
      .some((x) => x.id === p.id))
  for (const row of seeded) await patch("programs", row.id, { visibility: "" })
  console.log(`— sembrado: 3 filas legacy + 3 explícitas + ${seeded.length} preexistentes puestas a vacío`)

  check("antes: la fila legacy está vacía", legacyPlain.visibility, "")
  check("antes: la explícita privada vale private", explicitPrivate.visibility, "private")

  // ── Volver a correr la migración de verdad ──────────────────────────────────
  await stopPB()
  const del = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del.status !== 0) throw new Error("sqlite3 falló: " + (del.stderr || del.error?.message))

  await startPB()
  await authSuper()

  const after = Object.fromEntries(
    (await api("/api/collections/programs/records?perPage=200")).items.map((r) => [r.id, r]),
  )

  console.log("\n── Filas sin valor: pasan a public ──")
  check("legacy sin dueño", after[legacyPlain.id]?.visibility, "public")
  check("legacy con dueño", after[legacyOwned.id]?.visibility, "public")
  check("legacy oficial (is_official ⇒ public)", after[legacyOfficial.id]?.visibility, "public")
  check(
    "las preexistentes del seed también",
    seeded.every((r) => after[r.id]?.visibility === "public"),
    true,
  )

  console.log("\n── Filas con valor: intactas ──")
  check("private explícito NO se publica", after[explicitPrivate.id]?.visibility, "private")
  check("link explícito NO se publica", after[explicitLink.id]?.visibility, "link")
  check("public explícito sigue público", after[explicitPublic.id]?.visibility, "public")

  console.log("\n── Las reglas siguen en su sitio tras la segunda pasada ──")
  const collection = await api("/api/collections/programs")
  check(
    "listRule filtra por visibility",
    typeof collection.listRule === "string" && collection.listRule.includes('visibility = "public"'),
    true,
  )
  check("listRule y viewRule coinciden", collection.listRule, collection.viewRule)

  // ── Idempotencia ────────────────────────────────────────────────────────────
  // Si el backfill falla a medias se reintenta borrando su fila de `_migrations`
  // y reiniciando: la segunda pasada tiene que dar exactamente lo mismo.
  await stopPB()
  const del2 = spawnSync("sqlite3", [
    join(dataDir, "data.db"), `DELETE FROM _migrations WHERE file = '${MIGRATION}';`,
  ], { encoding: "utf8" })
  if (del2.status !== 0) throw new Error("sqlite3 falló: " + del2.stderr)

  await startPB()
  await authSuper()
  const twice = Object.fromEntries(
    (await api("/api/collections/programs/records?perPage=200")).items.map((r) => [r.id, r]),
  )

  console.log("\n── Tercera pasada (idempotencia) ──")
  check("no se duplican filas", Object.keys(twice).length, Object.keys(after).length)
  check("private explícito sigue private", twice[explicitPrivate.id]?.visibility, "private")
  check("legacy sigue public", twice[legacyPlain.id]?.visibility, "public")

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
