#!/usr/bin/env node
/**
 * exercise-media-status.mjs — qué media falta, y por dónde empezar (#619).
 *
 * El issue #619 pide media propia para los ejercicios de los 15 programas
 * oficiales. Son 137 ejercicios distintos, no los 1.578 del catálogo, y no se
 * van a producir de una sentada: entran poco a poco. Este informe existe para
 * que cada rato de grabación sea mecánico —qué falta, dónde soltarlo, y cuál
 * rinde más— en vez de tener que reconstruir la lista a mano cada vez.
 *
 * El orden es por impacto: cuántas veces aparece el ejercicio en los programas.
 * `deep_breathing` sale 72 veces y `dragon_flag` una; grabar el primero se nota
 * en 72 sitios.
 *
 * Uso:
 *   node scripts/exercise-media-status.mjs              # resumen + top pendientes
 *   node scripts/exercise-media-status.mjs --all        # los 137, uno por línea
 *   node scripts/exercise-media-status.mjs --json       # para tooling
 *   node scripts/exercise-media-status.mjs --role sequence   # filtra por hueco
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ROOT,
  ROLE_ORDER,
  MEDIA_ROLES,
  MEDIA_SRC_DIR,
  buildMediaSlugIndex,
  discoverMediaFiles,
  programExerciseUsage,
  flattenCatalog,
} from './lib/exercise-media.mjs'

const CATALOG_PATH = join(ROOT, 'packages/core/data/exercise-catalog.json')

// Los huecos que el issue pide de verdad. `video` es opcional y no cuenta como
// deuda: un ejercicio con secuencia, músculos y miniatura está completo.
const REQUIRED_ROLES = ['sequence', 'muscles', 'thumbnail']

const args = process.argv.slice(2)
const showAll = args.includes('--all')
const asJson = args.includes('--json')
const roleFilter = args.includes('--role') ? args[args.indexOf('--role') + 1] : null

if (roleFilter && !ROLE_ORDER.includes(roleFilter)) {
  console.error(`--role debe ser uno de: ${ROLE_ORDER.join(', ')}`)
  process.exit(1)
}

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
const exercises = flattenCatalog(catalog)
const byId = new Map(exercises.map(e => [e.id, e]))
const { slugById } = buildMediaSlugIndex(exercises)

const usage = programExerciseUsage()

const rows = []
const orphans = []

for (const [id, use] of usage) {
  const ex = byId.get(id)
  if (!ex) {
    // Un programa referencia un id que el catálogo no tiene. No es cosa de este
    // issue arreglarlo, pero callarlo sería peor: nunca podrá tener media.
    orphans.push({ id, count: use.count, programs: [...use.programs].sort() })
    continue
  }

  const slug = slugById.get(id) ?? null
  const onDisk = slug ? discoverMediaFiles(slug) : {}
  const have = ROLE_ORDER.filter(r => onDisk[r] || ex.media?.[r])
  const missing = REQUIRED_ROLES.filter(r => !have.includes(r))

  rows.push({
    id,
    slug,
    name: ex.name?.es || ex.name?.en || id,
    uses: use.count,
    programs: use.programs.size,
    have,
    missing,
    dropIn: slug ? `seeds/exercises/media/${slug}/` : null,
  })
}

// Impacto primero; a igualdad, alfabético para que el informe sea estable.
rows.sort((a, b) => b.uses - a.uses || a.id.localeCompare(b.id))

const pending = rows.filter(r =>
  roleFilter ? !r.have.includes(roleFilter) : r.missing.length > 0
)
const complete = rows.filter(r => r.missing.length === 0)
const noSlug = rows.filter(r => !r.slug)

if (asJson) {
  console.log(JSON.stringify({ total: rows.length, complete: complete.length, pending: pending.length, orphans, rows }, null, 2))
  process.exit(0)
}

const pct = n => `${Math.round((n / rows.length) * 100)}%`

console.log('\n=== Media de los ejercicios de los 15 programas oficiales (#619) ===\n')
console.log(`  Ejercicios distintos usados por los programas: ${rows.length}`)
console.log(`  Completos (secuencia + músculos + miniatura):  ${complete.length} (${pct(complete.length)})`)
console.log(`  Pendientes:                                    ${pending.length}`)

console.log('\n  Cobertura por hueco:')
for (const role of ROLE_ORDER) {
  const n = rows.filter(r => r.have.includes(role)).length
  const opt = REQUIRED_ROLES.includes(role) ? '' : '  (opcional)'
  console.log(`    ${role.padEnd(10)} ${String(n).padStart(4)}/${rows.length}  ${pct(n).padStart(4)}${opt}`)
}

if (noSlug.length > 0) {
  console.log(`\n  ⚠  ${noSlug.length} sin carpeta asignada — colisión de slug, dales un seed_slug propio:`)
  for (const r of noSlug) console.log(`     ${r.id}`)
}

if (orphans.length > 0) {
  console.log(`\n  ⚠  ${orphans.length} exercise_id que los programas usan pero NO existen en el catálogo:`)
  for (const o of orphans) {
    console.log(`     ${o.id.padEnd(24)} ${String(o.count).padStart(3)} usos  →  ${o.programs.join(', ')}`)
  }
  console.log('     Nunca podrán resolver media ni nombre. Merece issue aparte.')
}

const list = showAll ? pending : pending.slice(0, 15)
const heading = roleFilter
  ? `Pendientes de "${roleFilter}"`
  : 'Pendientes'

console.log(`\n=== ${heading}${showAll ? '' : ` — top ${list.length} por impacto`} ===\n`)
console.log(`  ${'usos'.padStart(4)}  ${'ejercicio'.padEnd(26)} ${'carpeta donde soltarlo'.padEnd(46)} falta`)
console.log(`  ${'─'.repeat(4)}  ${'─'.repeat(26)} ${'─'.repeat(46)} ${'─'.repeat(28)}`)

for (const r of list) {
  const drop = r.dropIn ?? '(sin carpeta — colisión de slug)'
  console.log(
    `  ${String(r.uses).padStart(4)}  ${r.name.slice(0, 26).padEnd(26)} ${drop.padEnd(46)} ${r.missing.join(', ')}`
  )
}

if (!showAll && pending.length > list.length) {
  console.log(`\n  … y ${pending.length - list.length} más. Usa --all para verlos todos.`)
}

console.log('\n  Nombres de fichero aceptados dentro de cada carpeta:')
for (const role of ROLE_ORDER) {
  const [first, ...rest] = MEDIA_ROLES[role]
  console.log(`    ${(role + first).padEnd(18)} o ${rest.join(' / ')}`)
}
console.log(`  Raíz: ${MEDIA_SRC_DIR.replace(ROOT + '/', '')}`)
console.log('  Cuando sueltes ficheros:  pnpm exercises:media\n')
