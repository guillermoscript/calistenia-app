#!/usr/bin/env node
/**
 * Runner de los integration tests de pb_hooks (issue #144).
 *
 * 1. Levanta un mock del AI API (captura los push que los hooks mandan vía $http.send)
 * 2. Levanta un PocketBase efímero con las migraciones y hooks REALES del repo
 *    (pb_data de scratch en un tmpdir — nunca toca datos reales)
 * 3. Corre secuencialmente cada *.test.mjs de este directorio con `node --test`
 *
 * Uso:   node tests/pb_hooks/run.mjs [patrón]
 *        [patrón] opcional filtra los archivos de test por substring.
 * Binario de PB: usa $PB_BINARY, o ./pocketbase en la raíz del repo.
 * En CI: PB_BINARY=/tmp/pb/pocketbase (el mismo binario cacheado del job e2e).
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { startPushMock } from "./helpers/push-mock.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")

const SU_EMAIL = "hooks-test@ci.local"
const SU_PASS = "HooksTest123!"
const INTERNAL_KEY = "test-internal-key"

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.on("error", rej)
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address()
      srv.close(() => res(port))
    })
  })
}

function pbBinary() {
  if (process.env.PB_BINARY) return process.env.PB_BINARY
  const local = join(ROOT, "pocketbase")
  if (existsSync(local)) return local
  console.error(
    "✗ No hay binario de PocketBase.\n" +
    "  Opciones: exporta PB_BINARY=/ruta/a/pocketbase, o coloca ./pocketbase en la raíz del repo.\n" +
    "  Descarga: https://github.com/pocketbase/pocketbase/releases (usar la versión de .github/workflows/ci.yml)"
  )
  process.exit(1)
}

async function waitHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) return
    } catch { /* aún no arranca */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("PocketBase no arrancó a tiempo")
}

async function main() {
  const bin = pbBinary()
  const mockPort = await freePort()
  const pbPort = await freePort()
  const mockUrl = `http://127.0.0.1:${mockPort}`
  const pbUrl = `http://127.0.0.1:${pbPort}`
  const dataDir = mkdtempSync(join(tmpdir(), "pb-hooks-test-"))

  const mock = await startPushMock(mockPort)

  console.log(`▶ PocketBase efímero en ${pbUrl} (data: ${dataDir})`)
  let pbLog = ""
  const pb = spawn(
    bin,
    [
      "serve",
      `--http=127.0.0.1:${pbPort}`,
      `--dir=${dataDir}`,
      `--migrationsDir=${join(ROOT, "pb_migrations")}`,
      `--hooksDir=${join(ROOT, "pb_hooks")}`,
    ],
    { env: { ...process.env, AI_API_URL: mockUrl, INTERNAL_API_KEY: INTERNAL_KEY } }
  )
  pb.stdout.on("data", (d) => (pbLog += d))
  pb.stderr.on("data", (d) => (pbLog += d))

  let exitCode = 1
  try {
    await waitHealth(pbUrl)

    const su = spawnSync(bin, ["superuser", "upsert", SU_EMAIL, SU_PASS, `--dir=${dataDir}`], { encoding: "utf8" })
    if (su.status !== 0) throw new Error(`superuser upsert falló: ${su.stderr || su.stdout}`)

    const pattern = process.argv[2] || ""
    const files = readdirSync(__dirname)
      .filter((f) => f.endsWith(".test.mjs") && f.includes(pattern))
      .sort()
    if (files.length === 0) throw new Error(`No hay tests que matcheen "${pattern}"`)

    const env = {
      ...process.env,
      PB_HOOKS_URL: pbUrl,
      PB_HOOKS_MOCK_URL: mockUrl,
      PB_HOOKS_SU_EMAIL: SU_EMAIL,
      PB_HOOKS_SU_PASS: SU_PASS,
      PB_HOOKS_INTERNAL_KEY: INTERNAL_KEY,
    }

    // Secuencial a propósito: los tests comparten la instancia de PB. Cada test
    // usa usuarios propios, pero los crons enumeran registros globales.
    // OJO: spawn async, NUNCA spawnSync — el push-mock vive en este proceso y
    // spawnSync bloquearía el event loop → deadlock (el hijo espera al mock).
    let failed = 0
    for (const file of files) {
      console.log(`\n━━ ${file} ━━`)
      const code = await new Promise((res) => {
        const child = spawn(process.execPath, ["--test", join(__dirname, file)], { stdio: "inherit", env })
        child.on("close", res)
      })
      if (code !== 0) failed++
    }
    exitCode = failed === 0 ? 0 : 1
    console.log(failed === 0 ? `\n✓ ${files.length} archivos de test OK` : `\n✗ ${failed}/${files.length} archivos con fallos`)
    if (failed > 0) {
      console.log("\n── Últimas líneas del log de PocketBase ──")
      console.log(pbLog.split("\n").slice(-40).join("\n"))
    }
  } catch (err) {
    console.error("✗ Error del runner:", err.message)
    console.log(pbLog.split("\n").slice(-40).join("\n"))
  } finally {
    pb.kill()
    mock.close()
    rmSync(dataDir, { recursive: true, force: true })
  }
  process.exit(exitCode)
}

main()
