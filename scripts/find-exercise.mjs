/**
 * Buscador del catálogo de ejercicios, para escribir contenido de programas.
 *
 * Existe porque el error más caro al editar `programs/*.json` es inventarse un
 * `exercise_id`: entra sin queja, no resuelve contra el catálogo, y el ejercicio
 * se queda sin media y sin progresión por variante. Aquí se comprueba antes.
 *
 * Uso:
 *   node scripts/find-exercise.mjs remo            # busca por nombre o id
 *   node scripts/find-exercise.mjs --cat pull      # lista una categoría entera
 *   node scripts/find-exercise.mjs --eq ninguno    # filtra por material
 *   node scripts/find-exercise.mjs --check a b c   # ¿resuelven estos ids?
 */

import { readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(
  readFileSync(join(ROOT, 'packages/core/data/exercise-catalog.json'), 'utf8'),
)

const norm = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const all = []
for (const [category, group] of Object.entries(catalog.categories)) {
  for (const ex of group.exercises) all.push({ ...ex, category })
}
const byId = new Map(all.map(e => [e.id, e]))

const args = process.argv.slice(2)
const flag = args.find(a => a.startsWith('--'))
const terms = args.filter(a => !a.startsWith('--'))

const show = e =>
  console.log(
    `${e.id.padEnd(34)} ${e.category.padEnd(10)} ${(e.equipment ?? []).join(',').padEnd(22)} ${e.name?.es ?? ''}`,
  )

if (flag === '--check') {
  let bad = 0
  for (const t of terms) {
    const hit = byId.get(t)
    if (hit) show(hit)
    else {
      bad++
      console.log(`${t.padEnd(34)} ✗ NO RESUELVE`)
    }
  }
  process.exit(bad ? 1 : 0)
} else if (flag === '--cat') {
  all.filter(e => e.category === terms[0]).forEach(show)
} else if (flag === '--eq') {
  all.filter(e => (e.equipment ?? []).includes(terms[0])).forEach(show)
} else {
  const q = norm(terms.join(' '))
  const hits = all.filter(
    e => norm(e.id).includes(q) || norm(e.name?.es).includes(q) || norm(e.name?.en).includes(q),
  )
  hits.slice(0, 60).forEach(show)
  console.log(`\n${hits.length} resultados${hits.length > 60 ? ' (mostrados 60)' : ''}`)
}
