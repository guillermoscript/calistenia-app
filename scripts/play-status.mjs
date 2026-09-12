#!/usr/bin/env node
/**
 * play-status.mjs — Qué sabe Google Play de la app: versionCodes ya subidos y
 * qué hay en cada track.
 *
 *   pnpm play:status
 *
 * Existe porque la memoria del proyecto ha mentido dos veces sobre si un AAB
 * llegó a subirse (Play recuerda TODO código subido, incluso en borradores) y
 * eso costó un rechazo «El código de versión N ya se ha usado». Esta es la
 * fuente de verdad: mírala ANTES de construir un AAB.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PlayClient, credentialsPath } from './play-api.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appJson = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/app.json'), 'utf-8'))
const PKG = appJson.expo.android.package
const LOCAL_VERSION = appJson.expo.version
const LOCAL_CODE = appJson.expo.android.versionCode

const client = await PlayClient.create(PKG).catch((err) => {
  console.error(`\n${err.message}\n`)
  process.exit(1)
})

console.log(`\nApp:             ${PKG}`)
console.log(`Service account: ${client.serviceAccountEmail}`)
console.log(`Credenciales:    ${credentialsPath()}`)
console.log(`Local (app.json): v${LOCAL_VERSION} / vc${LOCAL_CODE}\n`)

try {
  await client.openEdit()
  const [bundles, apks, tracks] = await Promise.all([
    client.listBundles(),
    client.listApks(),
    client.listTracks(),
  ])

  const codes = [...bundles.map((b) => b.versionCode), ...apks.map((a) => a.versionCode)].sort(
    (a, b) => a - b,
  )
  const highest = codes.at(-1) ?? 0

  console.log(`versionCodes que Play ya conoce (${codes.length}):`)
  console.log(`  ${codes.join(', ') || '(ninguno)'}`)
  console.log(`  → el más alto subido: ${highest}\n`)

  console.log('Tracks:')
  for (const t of tracks) {
    const releases = t.releases || []
    if (!releases.length) {
      console.log(`  ${t.track.padEnd(11)} (vacío)`)
      continue
    }
    for (const r of releases) {
      const frac = r.userFraction ? ` ${(r.userFraction * 100).toFixed(0)}%` : ''
      console.log(
        `  ${t.track.padEnd(11)} vc ${(r.versionCodes || []).join(',').padEnd(6)} ${r.status}${frac}  ${r.name || ''}`,
      )
    }
  }

  console.log('')
  if (LOCAL_CODE <= highest) {
    console.log(
      `⚠️  versionCode local ${LOCAL_CODE} <= ${highest} ya usado en Play.\n` +
        `   Play RECHAZARÁ la subida. Bumpea antes: pnpm release:mobile patch\n`,
    )
    process.exitCode = 2
  } else {
    console.log(`✓ versionCode local ${LOCAL_CODE} está libre (el más alto en Play es ${highest}).\n`)
  }
} catch (err) {
  console.error(`\n✗ ${err.message}\n`)
  process.exitCode = 1
} finally {
  await client.deleteEdit()
}
