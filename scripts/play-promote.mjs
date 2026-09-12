#!/usr/bin/env node
/**
 * Promueve a un track un versionCode que YA está subido a Play (sin volver a
 * subir el AAB). Complementa a publish-play.mjs, que se niega a reusar un
 * versionCode ya conocido.
 *
 *   pnpm play:promote --track alpha            # vc de app.json → alpha
 *   pnpm play:promote --track beta --code 37
 *   pnpm play:promote --track production --rollout 0.2
 *   pnpm play:promote --track alpha --dry-run
 *
 * Por qué existe: Play Console construye la lista de permisos «detectados»
 * (Health Connect, foreground services…) con la UNIÓN de los bundles de TODOS
 * los tracks activos. Con alpha/beta parados en un vc viejo, las declaraciones
 * siguen listando permisos que el AAB nuevo ya no pide, y el revisor los ve.
 * Hay que mover TODOS los tracks al vc recortado.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PlayClient, TRACKS } from './play-api.mjs'
import { entryFor, toPlayNotes } from './extract-changelog-entry.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appJson = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/app.json'), 'utf-8'))
const PKG = appJson.expo.android.package
const LANG_MAP = { es: ['es-419', 'es-ES', 'es-US', 'es'], en: ['en-US', 'en-GB', 'en'] }

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

const track = flag('track')
const CODE = Number(flag('code', appJson.expo.android.versionCode))
const rollout = flag('rollout')
const statusFlag = flag('status', rollout ? 'inProgress' : 'completed')
const dryRun = has('dry-run')

if (!track) {
  console.error('Uso: node scripts/play-promote.mjs --track internal|alpha|beta|production [--code N] [--rollout 0.1] [--dry-run]')
  process.exit(1)
}
if (!TRACKS.includes(track)) console.log(`ℹ️  Track no estándar «${track}» (los estándar son ${TRACKS.join(', ')}).`)

console.log(`Promover vc${CODE} de ${PKG} → track ${track} (status ${statusFlag}${rollout ? `, rollout ${Number(rollout) * 100}%` : ''})`)

const client = await PlayClient.create(PKG).catch((err) => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
console.log(`  cuenta:  ${client.serviceAccountEmail}\n`)

await client.openEdit()
try {
  const known = [...(await client.listBundles()), ...(await client.listApks())].map((b) => b.versionCode)
  if (!known.includes(CODE)) {
    throw new Error(`vc${CODE} NO está subido a Play (conocidos: ${known.sort((a, b) => a - b).join(', ')}). Súbelo con pnpm play:publish.`)
  }
  console.log(`▸ vc${CODE} existe en Play`)

  // Notas de versión: las del changelog de esa versión, si existe.
  let releaseNotes = []
  let VERSION = appJson.expo.version
  try {
    const entry = entryFor(appJson.expo.version)
    const available = await client.listListingLanguages()
    for (const [lang, candidates] of Object.entries(LANG_MAP)) {
      const match = candidates.find((c) => available.includes(c))
      if (match) releaseNotes.push({ language: match, text: toPlayNotes(entry, lang) })
    }
    VERSION = entry.version
  } catch {
    /* sin entrada de changelog → sin notas */
  }

  const release = {
    name: `${VERSION} (${CODE})`,
    versionCodes: [String(CODE)],
    status: statusFlag,
    ...(rollout ? { userFraction: Number(rollout) } : {}),
    ...(releaseNotes.length ? { releaseNotes } : {}),
  }
  await client.updateTrack(track, release)
  console.log(`  ✓ track ${track} apuntando a vc${CODE}`)

  if (dryRun) {
    console.log('\nDRY-RUN: borrando el edit sin publicar nada.\n')
    await client.deleteEdit()
    process.exit(0)
  }

  try {
    await client.commitEdit()
  } catch (err) {
    if (/changesNotSentForReview/i.test(err.message)) {
      console.log('  ⚠️  Play pide changesNotSentForReview=true; reintentando así.')
      await client.commitEdit({ changesNotSentForReview: true })
    } else {
      throw err
    }
  }
  console.log(`\n✓ vc${CODE} promovido al track ${track}.\n`)
} catch (err) {
  console.error(`\n✗ ${err.message}\n`)
  await client.deleteEdit()
  process.exit(1)
}
