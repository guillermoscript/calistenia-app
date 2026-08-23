#!/usr/bin/env node
/**
 * publish-play.mjs — Sube un AAB a Google Play por la API y le pone como notas
 * de versión la entrada curada de packages/core/data/changelog.mobile.json.
 *
 *   pnpm play:publish ~/Desktop/calistenia-v1.11.0-vc34.aab
 *   pnpm play:publish <aab> --track internal|alpha|beta|production
 *   pnpm play:publish <aab> --track production --rollout 0.1
 *   pnpm play:publish <aab> --status draft        # sube pero no publica
 *   pnpm play:publish <aab> --dry-run             # todo menos el commit
 *
 * Por defecto va al track `internal` y con status `completed`. Producción exige
 * que la cuenta haya pasado la prueba cerrada (12 testers, 14 días).
 *
 * El edit se borra si algo falla, así no quedan borradores colgando en Play.
 */

import { existsSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PlayClient, TRACKS } from './play-api.mjs'
import { entryFor, toPlayNotes } from './extract-changelog-entry.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appJson = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/app.json'), 'utf-8'))
const PKG = appJson.expo.android.package
const VERSION = appJson.expo.version
const CODE = appJson.expo.android.versionCode

/** Idioma del changelog → idiomas de ficha de Play, en orden de preferencia. */
const LANG_MAP = { es: ['es-419', 'es-ES', 'es-US', 'es'], en: ['en-US', 'en-GB', 'en'] }

const args = process.argv.slice(2)
const VALUED = new Set(['track', 'rollout', 'status']) // flags que consumen el siguiente argumento
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

/** Primer argumento suelto que no sea el valor de un flag. */
function positional() {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (VALUED.has(args[i].slice(2))) i++
      continue
    }
    return args[i]
  }
}

const aabPath = resolve((positional() || `~/Desktop/calistenia-v${VERSION}-vc${CODE}.aab`).replace(/^~/, homedir()))
const track = flag('track', 'internal')
const rollout = flag('rollout')
const statusFlag = flag('status', rollout ? 'inProgress' : 'completed')
const dryRun = has('dry-run')

if (!TRACKS.includes(track)) {
  console.error(`Track desconocido: ${track}. Válidos: ${TRACKS.join(', ')}`)
  process.exit(1)
}
if (!existsSync(aabPath)) {
  console.error(`No existe el AAB: ${aabPath}\nConstrúyelo antes: pnpm build:aab`)
  process.exit(1)
}

// Notas de versión: la entrada curada del changelog, ya recortada a 500 chars.
const entry = entryFor(VERSION)
const notesByLang = { es: toPlayNotes(entry, 'es'), en: toPlayNotes(entry, 'en') }

console.log(`\nCalistenia → Google Play`)
console.log(`  AAB:     ${aabPath} (${(statSync(aabPath).size / 1024 / 1024).toFixed(1)} MB)`)
console.log(`  app:     ${PKG}  v${VERSION} / vc${CODE}`)
console.log(`  track:   ${track}  (status ${statusFlag}${rollout ? `, rollout ${Number(rollout) * 100}%` : ''})`)
console.log(`  notas:   ${notesByLang.es.split('\n')[0].slice(0, 70)}…`)
if (dryRun) console.log('  MODO DRY-RUN: no se hará commit del edit')

const client = await PlayClient.create(PKG).catch((err) => {
  console.error(`\n${err.message}\n`)
  process.exit(1)
})
console.log(`  cuenta:  ${client.serviceAccountEmail}\n`)

await client.openEdit()

try {
  // Guarda: Play rechaza un versionCode ya usado, y el error llega DESPUÉS de
  // subir 110 MB. Se comprueba antes.
  const known = [...(await client.listBundles()), ...(await client.listApks())].map((b) => b.versionCode)
  const highest = known.length ? Math.max(...known) : 0
  if (known.includes(CODE)) {
    throw new Error(
      `versionCode ${CODE} YA está subido a Play (Play recuerda hasta los borradores).\n` +
        `   El más alto es ${highest} → bumpea con: pnpm release:mobile patch`,
    )
  }
  console.log(`▸ versionCode ${CODE} libre (el más alto en Play: ${highest})`)

  console.log('▸ Subiendo el AAB...')
  const uploaded = await client.uploadBundle(aabPath, { onProgress: (m) => console.log(`  ${m}`) })
  if (uploaded.versionCode !== CODE) {
    throw new Error(`El AAB subido dice versionCode ${uploaded.versionCode}, pero app.json dice ${CODE}.`)
  }
  console.log(`  ✓ subido vc${uploaded.versionCode} (sha1 ${String(uploaded.sha1 || '').slice(0, 10)}…)`)

  // Sólo se mandan notas en idiomas que la ficha tiene publicados.
  const available = await client.listListingLanguages()
  const releaseNotes = []
  for (const [lang, candidates] of Object.entries(LANG_MAP)) {
    const match = candidates.find((c) => available.includes(c))
    if (match) releaseNotes.push({ language: match, text: notesByLang[lang] })
  }
  console.log(
    `▸ Notas de versión: ${releaseNotes.map((n) => n.language).join(', ') || '(ninguna: la ficha no tiene idiomas)'}` +
      `  [ficha: ${available.join(', ')}]`,
  )

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

  console.log('▸ Commit del edit...')
  try {
    await client.commitEdit()
  } catch (err) {
    // Play a veces exige no mandar a revisión automática (declaraciones a medias).
    if (/changesNotSentForReview/i.test(err.message)) {
      console.log('  ⚠️  Play pide changesNotSentForReview=true; reintentando así.')
      console.log('     (la release queda subida pero SIN mandar a revisión: hay que enviarla desde Play Console)')
      await client.commitEdit({ changesNotSentForReview: true })
    } else {
      throw err
    }
  }
  client.editId = null

  console.log(`\n✓ v${VERSION} (vc${CODE}) publicada en el track ${track}.`)
  console.log(`  https://play.google.com/console/u/0/developers/app/${PKG}/tracks/${track}\n`)
} catch (err) {
  console.error(`\n✗ ${err.message}\n`)
  await client.deleteEdit()
  process.exit(1)
}
