#!/usr/bin/env node
/**
 * build-mobile-aab.mjs — Construye el AAB de release en local (sin EAS) y lo
 * verifica antes de que nadie lo suba.
 *
 *   pnpm build:aab              # build + verificación
 *   pnpm build:aab --verify-only ~/Desktop/calistenia-v1.11.0-vc34.aab
 *   pnpm build:aab --skip-preflight
 *
 * Automatiza la receta que veníamos haciendo a mano, incluidas sus trampas:
 *  - android/ está gitignorado y el script de release SOLO toca app.json →
 *    aquí se sincronizan versionCode/versionName en android/app/build.gradle.
 *  - apps/mobile/.env.local (URL de LAN) pisa a .env y se cuela en el bundle →
 *    se aparta durante el build y se restaura al terminar, pase lo que pase.
 *  - $JAVA_HOME del shell es un JDK 11 que no sirve → se fuerza el JBR.
 *  - la subida de sourcemaps a Sentry necesita el token de
 *    <root>/.env.sentry-build-plugin, no el de apps/mobile/.env.
 *  - grep sobre el bundle JS miente: es UNA línea, hay que usar `grep -a -o`.
 */

import { execSync, execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MOBILE = resolve(ROOT, 'apps/mobile')
const ANDROID = resolve(MOBILE, 'android')
const GRADLE_FILE = resolve(ANDROID, 'app/build.gradle')
const ENV_LOCAL = resolve(MOBILE, '.env.local')
const ENV_LOCAL_PARKED = resolve(MOBILE, '.env.local.building')
const SENTRY_ENV = resolve(ROOT, '.env.sentry-build-plugin')
const JBR = '/Applications/Android Studio.app/Contents/jbr/Contents/Home'

const PROD_ENV = {
  EXPO_PUBLIC_PB_URL: 'https://gym.guille.tech',
  EXPO_PUBLIC_AI_API_URL: 'https://gym-server.guille.tech',
}

const args = process.argv.slice(2)
const has = (f) => args.includes(`--${f}`)
const argAfter = (f) => {
  const i = args.indexOf(`--${f}`)
  return i === -1 ? undefined : args[i + 1]
}

const appJson = JSON.parse(readFileSync(resolve(MOBILE, 'app.json'), 'utf-8'))
const VERSION = appJson.expo.version
const CODE = appJson.expo.android.versionCode
const PKG = appJson.expo.android.package
const HEALTH_PERMS = (appJson.expo.android.permissions || []).filter((p) => p.includes('.health.')).sort()
const BLOCKED_PERMS = appJson.expo.android.blockedPermissions || []
const FGS_PERMS = (appJson.expo.android.permissions || [])
  .filter((p) => p.includes('.FOREGROUND_SERVICE') && !BLOCKED_PERMS.includes(p))
  .sort()
const BUILD_PROPS = (appJson.expo.plugins || []).find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')?.[1]
const TARGET_SDK = BUILD_PROPS?.android?.targetSdkVersion
const DEST = resolve(homedir(), `Desktop/calistenia-v${VERSION}-vc${CODE}.aab`)
const BUILT = resolve(ANDROID, 'app/build/outputs/bundle/release/app-release.aab')

const step = (msg) => console.log(`\n▸ ${msg}`)
const ok = (msg) => console.log(`  ✓ ${msg}`)
const warn = (msg) => console.log(`  ⚠️  ${msg}`)

// ── Verificación estática ────────────────────────────────────────────────────

function bundletool(...cmdArgs) {
  return execFileSync('bundletool', cmdArgs, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
}

function verify(aabPath) {
  step(`Verificando ${basename(aabPath)}`)
  const size = statSync(aabPath).size
  const sha = createHash('sha256').update(readFileSync(aabPath)).digest('hex')
  ok(`${(size / 1024 / 1024).toFixed(1)} MB — sha256 ${sha.slice(0, 12)}…`)

  let failures = 0
  const fail = (msg) => {
    console.log(`  ✗ ${msg}`)
    failures++
  }

  // 1. Manifest: versionCode/versionName/package reales dentro del AAB.
  const manifest = bundletool('dump', 'manifest', `--bundle=${aabPath}`)
  const grab = (attr) => manifest.match(new RegExp(`${attr}="([^"]+)"`))?.[1]
  const gotCode = grab('android:versionCode')
  const gotName = grab('android:versionName')
  const gotPkg = grab('package')
  gotCode === String(CODE) ? ok(`versionCode ${gotCode}`) : fail(`versionCode ${gotCode} ≠ ${CODE} (app.json)`)
  gotName === VERSION ? ok(`versionName ${gotName}`) : fail(`versionName ${gotName} ≠ ${VERSION}`)
  gotPkg === PKG ? ok(`package ${gotPkg}`) : fail(`package ${gotPkg} ≠ ${PKG}`)

  // 1b. Permisos de Health Connect: tienen que ser EXACTAMENTE los de app.json.
  //     Trampa que costó un rechazo de Play (v1.11.0, política de acceso mínimo
  //     a datos): este script NO ejecuta `expo prebuild`, así que el AAB sale
  //     del AndroidManifest.xml de android/ — que está gitignorado y puede
  //     haberse quedado con permisos que ya se quitaron de app.json.
  const aabHealth = [...new Set(manifest.match(/android\.permission\.health\.[A-Z_]+/g) || [])].sort()
  const missing = HEALTH_PERMS.filter((p) => !aabHealth.includes(p))
  const extra = aabHealth.filter((p) => !HEALTH_PERMS.includes(p))
  if (missing.length === 0 && extra.length === 0) {
    ok(`${aabHealth.length} permiso(s) de salud, idénticos a app.json`)
  } else {
    if (extra.length) {
      fail(`el AAB pide ${extra.length} permiso(s) de salud que NO están en app.json: ${extra.join(', ')}`)
    }
    if (missing.length) {
      fail(`faltan en el AAB permisos de salud de app.json: ${missing.join(', ')}`)
    }
    console.log('    → android/ está desincronizado. Regenéralo:')
    console.log('      pnpm --filter @calistenia/mobile exec expo prebuild --platform android')
  }

  // 1c. targetSdkVersion: Play exige API 36 desde el 2026-08-30. Misma trampa
  //     que arriba: sale de android/gradle.properties, no de app.json.
  const gotTarget = grab('android:targetSdkVersion')
  if (TARGET_SDK == null) {
    warn('app.json no fija targetSdkVersion (expo-build-properties)')
  } else if (gotTarget === String(TARGET_SDK)) {
    ok(`targetSdkVersion ${gotTarget}`)
  } else {
    fail(`targetSdkVersion ${gotTarget} ≠ ${TARGET_SDK} (app.json) → edita android/gradle.properties`)
  }

  // 1d. Permisos de foreground service: exactamente los de app.json (menos los
  //     bloqueados). Play revisa la declaración de FGS tipo por tipo (vc35 fue
  //     rechazado por dataSync); un tipo de más en el manifiesto = otro rechazo.
  const aabFgs = [...new Set(manifest.match(/android\.permission\.FOREGROUND_SERVICE[A-Z_]*/g) || [])].sort()
  const fgsMissing = FGS_PERMS.filter((p) => !aabFgs.includes(p))
  const fgsExtra = aabFgs.filter((p) => !FGS_PERMS.includes(p))
  if (fgsMissing.length === 0 && fgsExtra.length === 0) {
    ok(`permisos FGS idénticos a app.json: ${aabFgs.map((p) => p.replace('android.permission.', '')).join(', ')}`)
  } else {
    if (fgsExtra.length) fail(`el AAB declara FGS que NO están en app.json: ${fgsExtra.join(', ')}`)
    if (fgsMissing.length) fail(`faltan en el AAB permisos FGS de app.json: ${fgsMissing.join(', ')}`)
  }
  // bundletool vuelca el atributo como máscara hex (0x00000108 = health|location);
  // dataSync es el bit 0x1.
  const fgsTypes = [...manifest.matchAll(/android:foregroundServiceType="([^"]+)"/g)].map((m) => m[1])
  const usesDataSync = (t) => (/^0x[0-9a-f]+$/i.test(t) ? (parseInt(t, 16) & 0x1) !== 0 : t.split('|').includes('dataSync'))
  if (fgsTypes.some(usesDataSync)) {
    fail(`algún <service> sigue con foregroundServiceType dataSync (${fgsTypes.join(' / ')}) — Play lo rechazó en vc35`)
  } else {
    ok(`foregroundServiceType de los services: ${fgsTypes.join(' / ') || '(ninguno)'}`)
  }

  // 2. Firma: tiene que ser la upload key registrada en Play.
  try {
    const cert = execSync(
      `unzip -p ${JSON.stringify(aabPath)} 'META-INF/*.RSA' | "${JBR}/bin/keytool" -printcert`,
      { encoding: 'utf-8', shell: '/bin/bash' },
    )
    const cn = cert.match(/Owner:\s*(CN=[^,\n]+)/)?.[1]
    cn?.includes('Calistenia Upload')
      ? ok(`firmado con ${cn}`)
      : fail(`firma inesperada: ${cn || '(no se pudo leer)'}`)
  } catch {
    warn('no se pudo leer el certificado (¿AAB sin firmar?)')
    failures++
  }

  // 3. Bundle JS: URLs de prod dentro, cero LAN. `grep -a -o` obligatorio: el
  //    bundle es una sola línea gigante y sin -a grep lo trata como binario.
  //    `LC_ALL=C` también obligatorio: el bundle es bytecode Hermes y el `tr` de
  //    macOS aborta con «Illegal byte sequence» en cuanto ve un byte que no es
  //    UTF-8 válido. Dejaba el fichero a 0 y el script se saltaba EN SILENCIO
  //    la comprobación de la URL de LAN, que es justo la que importa.
  // Directorio propio con permisos 0700 y borrado al salir: el bundle son ~20 MB
  // y en /tmp fijo quedaba legible por cualquier usuario de la máquina.
  const scratch = mkdtempSync(resolve(tmpdir(), 'calistenia-aab-'))
  const bundlePath = resolve(scratch, 'index.android.bundle')
  const jsBundle = execSync(
    `unzip -p ${JSON.stringify(aabPath)} base/assets/index.android.bundle 2>/dev/null | LC_ALL=C tr -d '\\0' > ${JSON.stringify(bundlePath)}; wc -c < ${JSON.stringify(bundlePath)}`,
    { encoding: 'utf-8', shell: '/bin/bash' },
  ).trim()
  if (Number(jsBundle) > 0) {
    ok(`bundle JS ${(Number(jsBundle) / 1024 / 1024).toFixed(1)} MB`)
    const count = (pattern) =>
      Number(
        execSync(`grep -a -o ${JSON.stringify(pattern)} ${JSON.stringify(bundlePath)} | wc -l`, {
          encoding: 'utf-8',
          shell: '/bin/bash',
        }).trim(),
      )
    for (const [key, url] of Object.entries(PROD_ENV)) {
      count(url) > 0 ? ok(`${key} → ${url}`) : fail(`no aparece ${url} en el bundle`)
    }
    const lan = count('http://192\\.168\\.[0-9.]*') + count('http://10\\.[0-9.]*')
    lan === 0 ? ok('0 URLs de LAN') : fail(`${lan} URL(s) de LAN en el bundle — .env.local se coló`)
  } else {
    fail(
      'no pude extraer base/assets/index.android.bundle — la comprobación de ' +
        'URLs de LAN NO se ha hecho, no subas este AAB a ciegas',
    )
  }
  rmSync(scratch, { recursive: true, force: true })

  console.log('')
  if (failures) {
    console.error(`✗ Verificación con ${failures} fallo(s). NO subas este AAB.\n`)
    process.exit(1)
  }
  console.log(`✓ AAB verificado: ${aabPath}\n`)
  console.log('Siguiente paso:')
  console.log(`  pnpm play:publish ${aabPath.replace(homedir(), '~')} --track internal\n`)
}

// ── Modo sólo verificar ──────────────────────────────────────────────────────

if (has('verify-only')) {
  const target = argAfter('verify-only') || DEST
  if (!existsSync(target)) {
    console.error(`No existe ${target}`)
    process.exit(1)
  }
  verify(target)
  process.exit(0)
}

// ── Build ────────────────────────────────────────────────────────────────────

console.log(`\nCalistenia — build AAB de release`)
console.log(`  versión:     ${VERSION} (versionCode ${CODE})`)
console.log(`  paquete:     ${PKG}`)
console.log(`  salida:      ${DEST}\n`)

if (!existsSync(ANDROID)) {
  console.error(`No existe ${ANDROID}. Ejecuta antes: pnpm --filter @calistenia/mobile exec expo prebuild`)
  process.exit(1)
}
if (!existsSync(JBR)) {
  console.error(`No encuentro el JDK de Android Studio en ${JBR} (el JAVA_HOME del shell es un JDK 11 y no vale).`)
  process.exit(1)
}

if (!has('skip-preflight')) {
  step('Preflight de deps nativas')
  execSync('node scripts/preflight-mobile-release.mjs', { cwd: ROOT, stdio: 'inherit' })
}

// versionCode/versionName: el script de release sólo toca app.json.
step('Sincronizando android/app/build.gradle con app.json')
const gradle = readFileSync(GRADLE_FILE, 'utf-8')
const patched = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${CODE}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${VERSION}"`)
if (patched !== gradle) {
  writeFileSync(GRADLE_FILE, patched, 'utf-8')
  ok(`versionCode ${CODE} / versionName ${VERSION}`)
} else {
  ok('ya estaba sincronizado')
}

// .env.local lleva la URL de LAN y pisa a .env: fuera durante el build.
let parked = false
if (existsSync(ENV_LOCAL)) {
  renameSync(ENV_LOCAL, ENV_LOCAL_PARKED)
  parked = true
  warn(`apps/mobile/.env.local apartado (${basename(ENV_LOCAL_PARKED)}) — se restaura al terminar`)
}
const restore = () => {
  if (parked && existsSync(ENV_LOCAL_PARKED)) {
    renameSync(ENV_LOCAL_PARKED, ENV_LOCAL)
    parked = false
    console.log('  ✓ .env.local restaurado')
  }
}
process.on('exit', restore)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1))

const env = { ...process.env, JAVA_HOME: JBR, ...PROD_ENV }
if (existsSync(SENTRY_ENV)) {
  const token = readFileSync(SENTRY_ENV, 'utf-8').match(/^SENTRY_AUTH_TOKEN=(.+)$/m)?.[1]?.trim()
  if (token) {
    env.SENTRY_AUTH_TOKEN = token.replace(/^["']|["']$/g, '')
    ok('SENTRY_AUTH_TOKEN cargado (los sourcemaps se suben)')
  }
} else {
  warn('sin .env.sentry-build-plugin → sourcemaps sin subir')
  env.SENTRY_DISABLE_AUTO_UPLOAD = 'true'
}

// El bundle JS lo genera la tarea gradle createBundleReleaseJsAndAssets, cuyos
// inputs son los fuentes de apps/mobile: un cambio SOLO en packages/core (o en
// node_modules) la deja UP-TO-DATE y el AAB sale con el bundle VIEJO (v1.12.2:
// el hotfix de dayjs no entró y el AAB seguía crasheando). Se purga siempre.
step('Purgando el bundle JS generado (fuerza re-bundling)')
for (const dir of [resolve(ANDROID, 'app/build/generated'), resolve(process.env.TMPDIR || '/tmp', 'metro-cache')]) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    ok(`borrado ${dir}`)
  }
}

step('gradlew :app:bundleRelease  (6-25 min, paciencia)')
const started = Date.now()
try {
  execSync('./gradlew :app:bundleRelease --no-configuration-cache', {
    cwd: ANDROID,
    stdio: 'inherit',
    env,
  })
} catch {
  console.error('\n✗ El build de gradle falló. Si el daemon murió por disco lleno:')
  console.error('    ./gradlew --stop && rm -f android/.gradle/*/executionHistory/*.lock\n')
  process.exit(1)
}
ok(`build en ${Math.round((Date.now() - started) / 60000)} min`)

if (!existsSync(BUILT)) {
  console.error(`\n✗ Gradle terminó pero no hay AAB en ${BUILT}`)
  process.exit(1)
}
copyFileSync(BUILT, DEST)
ok(`copiado a ${DEST}`)

restore()

// Se verifica la copia de android/build/outputs, no la del Desktop: TCC deja
// escribir en ~/Desktop pero puede impedir leerlo desde un shell sin permisos.
verify(BUILT)
